import test from "node:test";
import assert from "node:assert/strict";
import {
  deliverConnectorMessage,
  getSocialConnectorStatus,
} from "../lib/connectors/delivery.ts";
import {
  decryptConnectorCredential,
  encryptConnectorCredential,
} from "../lib/connectors/crypto.ts";
import {
  downloadOneDriveMarkdown,
  OneDrivePreconditionError,
  uploadOneDriveMarkdown,
} from "../lib/connectors/onedrive.ts";
import { parseWorkspaceSnapshotMarkdown } from "../lib/connectors/workspace-snapshot.ts";
import { decideSnapshotMerge } from "../lib/connectors/workspace-sync.ts";

function request(channel, target = "123456") {
  return { outboxId: "00000000-0000-4000-8000-000000000001", channel, target, markdown: "**发布完成**" };
}

test("connector status only reports configured server credentials", () => {
  assert.deepEqual(getSocialConnectorStatus({}), { telegram: false, wechat: false, qq: false });
  assert.deepEqual(getSocialConnectorStatus({
    TELEGRAM_BOT_TOKEN: "token",
    WECHAT_WORK_WEBHOOK_URL: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=key",
    QQ_BOT_APP_ID: "app",
    QQ_BOT_CLIENT_SECRET: "secret",
  }), { telegram: true, wechat: true, qq: true });
});

test("Telegram delivery uses the official Bot API and returns message id", async () => {
  let captured;
  const receipt = await deliverConnectorMessage(request("telegram", "@sophie_channel"), { TELEGRAM_BOT_TOKEN: "bot-token" }, async (url, init) => {
    captured = { url: String(url), body: JSON.parse(String(init?.body)) };
    return Response.json({ ok: true, result: { message_id: 88 } });
  });
  assert.equal(captured.url, "https://api.telegram.org/botbot-token/sendMessage");
  assert.deepEqual(captured.body, { chat_id: "@sophie_channel", text: "**发布完成**" });
  assert.equal(receipt.externalId, "88");
});

test("enterprise WeChat only accepts the official qyapi webhook host", async () => {
  await assert.rejects(
    deliverConnectorMessage(request("wechat", "发布群"), { WECHAT_WORK_WEBHOOK_URL: "https://example.com/hook" }, async () => Response.json({ errcode: 0 })),
    /官方机器人/,
  );
  let body;
  await deliverConnectorMessage(request("wechat", "发布群"), {
    WECHAT_WORK_WEBHOOK_URL: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=example",
  }, async (_url, init) => {
    body = JSON.parse(String(init?.body));
    return Response.json({ errcode: 0, errmsg: "ok" });
  });
  assert.deepEqual(body, { msgtype: "markdown", markdown: { content: "**发布完成**" } });
});

test("QQ delivery obtains an app token and uses the official group endpoint", async () => {
  const calls = [];
  const receipt = await deliverConnectorMessage({ ...request("qq", "group_openid_1"), metadata: { targetKind: "group" } }, {
    QQ_BOT_APP_ID: "app-id",
    QQ_BOT_CLIENT_SECRET: "client-secret",
  }, async (url, init) => {
    calls.push({ url: String(url), headers: init?.headers, body: JSON.parse(String(init?.body)) });
    if (calls.length === 1) return Response.json({ access_token: "access-token", expires_in: "7200" });
    return Response.json({ id: "qq-message-1", timestamp: 123 });
  });
  assert.equal(calls[0].url, "https://bots.qq.com/app/getAppAccessToken");
  assert.equal(calls[1].url, "https://api.sgroup.qq.com/v2/groups/group_openid_1/messages");
  assert.equal(calls[1].headers.authorization, "QQBot access-token");
  assert.deepEqual(calls[1].body, { content: "**发布完成**", msg_type: 0 });
  assert.equal(receipt.externalId, "qq-message-1");
});

test("connector credentials round-trip through AES-GCM without plaintext leakage", async () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  const value = { accessToken: "access-secret", refreshToken: "refresh-secret" };
  const ciphertext = await encryptConnectorCredential(value, key);
  assert.equal(ciphertext.includes("access-secret"), false);
  assert.deepEqual(await decryptConnectorCredential(ciphertext, key), value);
});

test("workspace snapshot v2 restores unicode metadata and Markdown body", () => {
  const row = {
    id: "workspace-1:page-1",
    workspace_id: "workspace-1",
    title: "同步设计",
    markdown: "# 同步设计\n\n保留双方。",
    revision: 4,
    updated_at: "2026-07-21T10:00:00.000Z",
  };
  const metadata = Buffer.from(JSON.stringify(row), "utf8").toString("base64url");
  const markdown = `---\nsophie: 2\nkind: workspace-snapshot\nworkspaceId: workspace-1\ngeneratedAt: 2026-07-21T10:01:00.000Z\n---\n\n<!-- sophie:snapshot-entry kind=document id=workspace-1%3Apage-1 -->\n<!-- sophie:snapshot-meta ${metadata} -->\n# 同步设计\n\n保留双方。\n<!-- /sophie:snapshot-entry -->`;
  const snapshot = parseWorkspaceSnapshotMarkdown(markdown);
  assert.equal(snapshot.version, 2);
  assert.equal(snapshot.workspaceId, "workspace-1");
  assert.equal(snapshot.entries[0].data.title, "同步设计");
  assert.match(snapshot.entries[0].markdown, /保留双方/);
});

test("workspace snapshot parser remains compatible with v1 entry markers", () => {
  const markdown = `---\nsophie: 1\nworkspaceId: default\ngeneratedAt: 2026-07-21T10:01:00.000Z\n---\n\n<!-- sophie:snapshot-entry kind=document id=legacy-page -->\n# 旧页面\n<!-- /sophie:snapshot-entry -->`;
  const snapshot = parseWorkspaceSnapshotMarkdown(markdown);
  assert.deepEqual(snapshot.entries[0].data, { id: "legacy-page" });
  assert.match(snapshot.entries[0].markdown, /旧页面/);
});

test("revision merge takes newer copies and exposes equal-revision divergence", () => {
  const base = { id: "w:doc", workspace_id: "w", title: "A", markdown: "# A", revision: 2 };
  assert.equal(decideSnapshotMerge(base, { ...base, revision: 3, markdown: "# B" }, "document"), "replace");
  assert.equal(decideSnapshotMerge(base, { ...base, revision: 1, markdown: "# old" }, "document"), "keep-local");
  assert.equal(decideSnapshotMerge(base, { ...base, markdown: "# divergent" }, "document"), "conflict");
  assert.equal(decideSnapshotMerge(base, { ...base }, "document"), "same");
});

test("outbox merge never regresses a sent message to an earlier state", () => {
  const local = { id: "o1", workspace_id: "w", channel: "telegram", payload_markdown: "hi", status: "sent" };
  assert.equal(decideSnapshotMerge(local, { ...local, status: "approved" }, "connector-outbox"), "keep-local");
  assert.equal(decideSnapshotMerge({ ...local, status: "review" }, { ...local, status: "sent" }, "connector-outbox"), "replace");
});

test("OneDrive download uses the preauthenticated content URL without forwarding credentials", async () => {
  const calls = [];
  const result = await downloadOneDriveMarkdown({
    accessToken: "access-secret",
    fileName: "SuperSophie-workspace-latest.md",
    fetcher: async (url, init) => {
      calls.push({ url: String(url), headers: init?.headers });
      if (calls.length === 1) return Response.json({
        id: "drive-item-1",
        name: "SuperSophie-workspace-latest.md",
        eTag: "etag-1",
        "@microsoft.graph.downloadUrl": "https://download.example/snapshot",
      });
      return new Response("---\nsophie: 2\nworkspaceId: w\ngeneratedAt: 2026-07-21T10:00:00.000Z\n---");
    },
  });
  assert.equal(result.id, "drive-item-1");
  assert.equal(calls[0].headers.authorization, "Bearer access-secret");
  assert.equal(calls[1].headers, undefined);
});

test("OneDrive update sends the observed eTag and surfaces concurrent writes", async () => {
  let headers;
  await uploadOneDriveMarkdown({
    accessToken: "access-secret",
    fileName: "snapshot.md",
    itemId: "drive-item-1",
    ifMatch: "etag-1",
    markdown: "# snapshot",
    fetcher: async (_url, init) => {
      headers = init?.headers;
      return Response.json({ id: "drive-item-1", eTag: "etag-2" });
    },
  });
  assert.equal(headers["if-match"], "etag-1");
  await assert.rejects(
    uploadOneDriveMarkdown({
      accessToken: "access-secret",
      fileName: "snapshot.md",
      itemId: "drive-item-1",
      ifMatch: "stale",
      markdown: "# snapshot",
      fetcher: async () => Response.json({ error: { code: "preconditionFailed" } }, { status: 412 }),
    }),
    OneDrivePreconditionError,
  );
});
