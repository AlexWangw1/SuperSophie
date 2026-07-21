import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { redactModelSecrets } from "../lib/agents/model-catalog.ts";

test("routes live conversation requests through the Agents SDK runtime", async () => {
  const [workspace, route, runtime] = await Promise.all([
    readFile(new URL("../app/workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/chat/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/agents/runtime.ts", import.meta.url), "utf8"),
  ]);
  assert.match(workspace, /fetch\("\/api\/chat"/);
  assert.doesNotMatch(workspace, /window\.setTimeout/);
  assert.match(route, /workspaceModelBindings/);
  assert.match(route, /runSophie\(input, runtimeBindings\)/);
  assert.match(runtime, /new Agent\(/);
  assert.match(runtime, /runner\.run\(/);
});

test("creates dynamic specialist teams and stores Markdown run evidence", async () => {
  const [runtime, route, schema] = await Promise.all([
    readFile(new URL("../lib/agents/runtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/chat/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/ensure.ts", import.meta.url), "utf8"),
  ]);
  assert.match(runtime, /TeamPlanSchema/);
  assert.match(runtime, /Promise\.all/);
  assert.match(runtime, /runSpecialist/);
  assert.match(route, /buildAgentRunMarkdown/);
  assert.match(route, /"agent-run"/);
  assert.match(schema, /agent_run_events/);
  assert.match(schema, /chat_messages/);
});

test("keeps model credentials in environment or the encrypted workspace vault", async () => {
  const [catalog, workspaceModels] = await Promise.all([
    readFile(new URL("../lib/agents/model-catalog.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/agents/workspace-models.ts", import.meta.url), "utf8"),
  ]);
  assert.match(catalog, /OPENAI_API_KEY/);
  assert.match(catalog, /OPENROUTER_API_KEY/);
  assert.match(catalog, /SOPHIE_MODEL_CATALOG_JSON/);
  assert.doesNotMatch(catalog, /sk-[A-Za-z0-9_-]{8,}/);
  assert.match(workspaceModels, /writeWorkspaceSecret/);
  assert.doesNotMatch(workspaceModels, /console\.(?:log|error)/);
  assert.equal(redactModelSecrets("request failed for arbitrary-secret-value", { SOPHIE_WORKSPACE_MODEL_KEY_0: "arbitrary-secret-value" }), "request failed for [REDACTED]");
});
