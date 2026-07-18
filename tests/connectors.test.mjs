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
