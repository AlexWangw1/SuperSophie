import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  publicWorkspaceModelSettings,
  WorkspaceCustomModelSchema,
  workspaceModelBindings,
  writeWorkspaceModelSettings,
} from "../lib/agents/workspace-models.ts";
import { workspaceSocialBindings } from "../lib/connectors/workspace-social.ts";
import { readWorkspaceSecret, writeWorkspaceSecret } from "../lib/workspace-secrets.ts";

class SecretDb {
  rows = new Map();
  prepare(sql) {
    const statement = {
      values: [],
      bind: (...values) => { statement.values = values; return statement; },
      first: async () => {
        const [workspaceId, provider] = statement.values;
        const ciphertext = this.rows.get(`${workspaceId}:${provider}`);
        return ciphertext ? { ciphertext } : null;
      },
      run: async () => {
        if (sql.includes("INSERT INTO connector_credentials")) {
          const [, workspaceId, provider, ciphertext] = statement.values;
          this.rows.set(`${workspaceId}:${provider}`, ciphertext);
        } else if (sql.includes("DELETE FROM connector_credentials")) {
          const [workspaceId, provider] = statement.values;
          this.rows.delete(`${workspaceId}:${provider}`);
        }
        return { meta: { changes: 1 } };
      },
    };
    return statement;
  }
}

const bindings = { CONNECTOR_ENCRYPTION_KEY: Buffer.alloc(32, 19).toString("base64") };

test("workspace secret vault encrypts values and scopes them by workspace", async () => {
  const db = new SecretDb();
  await writeWorkspaceSecret({ db, workspaceId: "workspace-a", provider: "social-telegram", value: { token: "123456789:abcdefghijklmnopqrstuvwxyz" }, bindings });
  const ciphertext = db.rows.get("workspace-a:social-telegram");
  assert.ok(ciphertext);
  assert.doesNotMatch(ciphertext, /abcdefghijklmnopqrstuvwxyz/);
  assert.deepEqual(await readWorkspaceSecret({ db, workspaceId: "workspace-a", provider: "social-telegram", bindings }), { token: "123456789:abcdefghijklmnopqrstuvwxyz" });
  assert.equal(await readWorkspaceSecret({ db, workspaceId: "workspace-b", provider: "social-telegram", bindings }), undefined);
});

test("workspace model bindings expose keys only to the server runner", async () => {
  const db = new SecretDb();
  await writeWorkspaceModelSettings(db, "workspace-a", bindings, {
    openaiApiKey: "sk-workspace-secret-value",
    customModels: [{ id: "custom:reasoner", label: "Reasoner", provider: "Private", model: "reasoner-v1", capabilities: ["推理"], baseURL: "https://models.example.com/v1", useResponses: false, apiKey: "custom-secret-value" }],
  });
  const effective = await workspaceModelBindings(db, "workspace-a", bindings);
  assert.equal(effective.bindings.OPENAI_API_KEY, "sk-workspace-secret-value");
  assert.equal(effective.bindings.SOPHIE_WORKSPACE_MODEL_KEY_0, "custom-secret-value");
  const publicSettings = publicWorkspaceModelSettings(effective.settings, bindings);
  assert.equal(publicSettings.providers.openai.source, "workspace");
  assert.equal(publicSettings.customModels[0].hasKey, true);
  assert.doesNotMatch(JSON.stringify(publicSettings), /workspace-secret|custom-secret/);
  assert.throws(() => WorkspaceCustomModelSchema.parse({ id: "bad:model", label: "Bad", provider: "Bad", model: "bad", capabilities: [], baseURL: "http://127.0.0.1:8080/v1", useResponses: false }), /公开 HTTPS/);
});

test("social delivery bindings prefer encrypted workspace credentials", async () => {
  const db = new SecretDb();
  await writeWorkspaceSecret({ db, workspaceId: "workspace-a", provider: "social-qq", value: { appId: "qq-app", clientSecret: "qq-workspace-secret" }, bindings });
  const effective = await workspaceSocialBindings(db, "workspace-a", { ...bindings, QQ_BOT_APP_ID: "environment-app", QQ_BOT_CLIENT_SECRET: "environment-secret" });
  assert.equal(effective.sources.qq, "workspace");
  assert.equal(effective.bindings.QQ_BOT_APP_ID, "qq-app");
  assert.equal(effective.bindings.QQ_BOT_CLIENT_SECRET, "qq-workspace-secret");
});

test("model and social APIs never return stored secret values", async () => {
  const [modelsRoute, connectorsRoute, sendRoute, workspace] = await Promise.all([
    readFile(new URL("../app/api/models/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/connectors/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/connectors/send/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(modelsRoute, /workspaceModelBindings/);
  assert.match(modelsRoute, /workspace_model_secret_updated/);
  assert.match(connectorsRoute, /writeWorkspaceSecret/);
  assert.match(sendRoute, /workspaceSocialBindings/);
  assert.match(workspace, /ModelSettingsModal/);
  assert.match(workspace, /SocialSecretModal/);
  assert.match(workspace, /已保存的密钥不会再次显示/);
});
