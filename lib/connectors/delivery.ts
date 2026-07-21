import {
  ConnectorConfigurationError,
  ConnectorDeliveryError,
  type ConnectorBindings,
  type DeliveryReceipt,
  type DeliveryRequest,
  type QqTargetKind,
  type SocialChannel,
} from "./types.ts";

type Fetcher = typeof fetch;

type JsonRecord = Record<string, unknown>;

async function readJson(response: Response): Promise<JsonRecord> {
  try {
    return (await response.json()) as JsonRecord;
  } catch {
    return {};
  }
}

function requireValue(value: string | undefined, label: string) {
  if (!value?.trim()) throw new ConnectorConfigurationError(`${label} 尚未配置`);
  return value.trim();
}

function safeExternalCode(payload: JsonRecord) {
  const candidate = payload.error_code ?? payload.errcode ?? payload.code;
  return typeof candidate === "string" || typeof candidate === "number" ? String(candidate) : undefined;
}

function validateTelegramTarget(target: string) {
  if (!/^-?\d+$/.test(target) && !/^@[A-Za-z0-9_]{5,}$/.test(target)) {
    throw new ConnectorDeliveryError("Telegram 目标必须是 chat_id 或 @channel_username");
  }
}

async function sendTelegram(request: DeliveryRequest, bindings: ConnectorBindings, fetcher: Fetcher) {
  const token = requireValue(bindings.TELEGRAM_BOT_TOKEN, "TELEGRAM_BOT_TOKEN");
  validateTelegramTarget(request.target);
  const response = await fetcher(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: request.target, text: request.markdown }),
  });
  const payload = await readJson(response);
  if (!response.ok || payload.ok !== true) {
    throw new ConnectorDeliveryError("Telegram 拒绝了这条消息", safeExternalCode(payload));
  }
  const result = typeof payload.result === "object" && payload.result ? payload.result as JsonRecord : {};
  return typeof result.message_id === "number" ? String(result.message_id) : undefined;
}

export function validateWeChatWebhook(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.hostname !== "qyapi.weixin.qq.com" || url.pathname !== "/cgi-bin/webhook/send" || !url.searchParams.get("key")) {
    throw new ConnectorConfigurationError("WECHAT_WORK_WEBHOOK_URL 必须是企业微信官方机器人 Webhook");
  }
  return url.toString();
}

async function sendWeChat(request: DeliveryRequest, bindings: ConnectorBindings, fetcher: Fetcher) {
  const webhook = validateWeChatWebhook(requireValue(bindings.WECHAT_WORK_WEBHOOK_URL, "WECHAT_WORK_WEBHOOK_URL"));
  const response = await fetcher(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ msgtype: "markdown", markdown: { content: request.markdown } }),
  });
  const payload = await readJson(response);
  if (!response.ok || payload.errcode !== 0) {
    throw new ConnectorDeliveryError("企业微信机器人拒绝了这条消息", safeExternalCode(payload));
  }
}

async function getQqAccessToken(bindings: ConnectorBindings, fetcher: Fetcher) {
  const appId = requireValue(bindings.QQ_BOT_APP_ID, "QQ_BOT_APP_ID");
  const clientSecret = requireValue(bindings.QQ_BOT_CLIENT_SECRET, "QQ_BOT_CLIENT_SECRET");
  const response = await fetcher("https://bots.qq.com/app/getAppAccessToken", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ appId, clientSecret }),
  });
  const payload = await readJson(response);
  if (!response.ok || typeof payload.access_token !== "string") {
    throw new ConnectorDeliveryError("QQ 机器人鉴权失败", safeExternalCode(payload));
  }
  return { appId, accessToken: payload.access_token };
}

function qqEndpoint(kind: QqTargetKind, target: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(target)) throw new ConnectorDeliveryError("QQ 目标 openid 格式无效");
  return kind === "user"
    ? `https://api.sgroup.qq.com/v2/users/${encodeURIComponent(target)}/messages`
    : `https://api.sgroup.qq.com/v2/groups/${encodeURIComponent(target)}/messages`;
}

async function sendQq(request: DeliveryRequest, bindings: ConnectorBindings, fetcher: Fetcher) {
  const { appId, accessToken } = await getQqAccessToken(bindings, fetcher);
  const targetKind = request.metadata?.targetKind === "user" ? "user" : "group";
  const response = await fetcher(qqEndpoint(targetKind, request.target), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `QQBot ${accessToken}`,
      "x-union-appid": appId,
    },
    body: JSON.stringify({ content: request.markdown, msg_type: 0 }),
  });
  const payload = await readJson(response);
  if (!response.ok || typeof payload.id !== "string") {
    throw new ConnectorDeliveryError("QQ 机器人拒绝了这条消息", safeExternalCode(payload));
  }
  return payload.id;
}

export function getSocialConnectorStatus(bindings: ConnectorBindings) {
  return {
    telegram: Boolean(bindings.TELEGRAM_BOT_TOKEN?.trim()),
    wechat: Boolean(bindings.WECHAT_WORK_WEBHOOK_URL?.trim()),
    qq: Boolean(bindings.QQ_BOT_APP_ID?.trim() && bindings.QQ_BOT_CLIENT_SECRET?.trim()),
  } satisfies Record<SocialChannel, boolean>;
}

export async function deliverConnectorMessage(
  request: DeliveryRequest,
  bindings: ConnectorBindings,
  fetcher: Fetcher = fetch,
): Promise<DeliveryReceipt> {
  if (!request.markdown.trim()) throw new ConnectorDeliveryError("消息内容不能为空");
  if (request.markdown.length > 4000) throw new ConnectorDeliveryError("单条消息不能超过 4000 个字符");

  let externalId: string | undefined;
  if (request.channel === "telegram") externalId = await sendTelegram(request, bindings, fetcher);
  else if (request.channel === "wechat") await sendWeChat(request, bindings, fetcher);
  else if (request.channel === "qq") externalId = await sendQq(request, bindings, fetcher);
  else throw new ConnectorDeliveryError("不支持的消息渠道");

  return { channel: request.channel, externalId, deliveredAt: new Date().toISOString() };
}

export function deliveryReceiptMarkdown(receipt: DeliveryReceipt) {
  return [
    "---",
    "sophie: 1",
    "kind: connector-delivery-receipt",
    `channel: ${receipt.channel}`,
    `deliveredAt: ${receipt.deliveredAt}`,
    receipt.externalId ? `externalId: ${receipt.externalId}` : undefined,
    "---",
    "",
    "消息已由用户批准并投递。",
  ].filter((line): line is string => line !== undefined).join("\n");
}

export function deliveryFailureMarkdown(channel: string, message: string, externalCode?: string) {
  return [
    "---",
    "sophie: 1",
    "kind: connector-delivery-failure",
    `channel: ${channel}`,
    `failedAt: ${new Date().toISOString()}`,
    externalCode ? `externalCode: ${externalCode}` : undefined,
    "---",
    "",
    message,
  ].filter((line): line is string => line !== undefined).join("\n");
}
