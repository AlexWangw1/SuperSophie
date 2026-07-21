import { z } from "zod";
import { readWorkspaceSecret } from "../workspace-secrets.ts";
import { validateWeChatWebhook } from "./delivery.ts";
import type { ConnectorBindings, SocialChannel } from "./types.ts";

export const SOCIAL_SECRET_PROVIDERS = {
  telegram: "social-telegram",
  wechat: "social-wechat",
  qq: "social-qq",
} as const satisfies Record<SocialChannel, string>;

export const TelegramSecretSchema = z.object({ token: z.string().trim().regex(/^\d+:[A-Za-z0-9_-]{20,}$/, "Telegram Bot Token 格式无效").max(512) });
export const WeChatSecretSchema = z.object({ webhookUrl: z.string().trim().max(1_000).refine((value) => {
  try { validateWeChatWebhook(value); return true; } catch { return false; }
}, "企业微信 Webhook 必须使用 qyapi.weixin.qq.com 官方地址") });
export const QqSecretSchema = z.object({ appId: z.string().trim().min(2).max(100), clientSecret: z.string().trim().min(8).max(1_000) });

type SecretBindings = Record<string, unknown> & ConnectorBindings;

export async function workspaceSocialBindings(db: D1Database, workspaceId: string, bindings: SecretBindings) {
  const [telegramRaw, wechatRaw, qqRaw] = await Promise.all([
    readWorkspaceSecret<unknown>({ db, workspaceId, provider: SOCIAL_SECRET_PROVIDERS.telegram, bindings }),
    readWorkspaceSecret<unknown>({ db, workspaceId, provider: SOCIAL_SECRET_PROVIDERS.wechat, bindings }),
    readWorkspaceSecret<unknown>({ db, workspaceId, provider: SOCIAL_SECRET_PROVIDERS.qq, bindings }),
  ]);
  const telegram = telegramRaw ? TelegramSecretSchema.parse(telegramRaw) : undefined;
  const wechat = wechatRaw ? WeChatSecretSchema.parse(wechatRaw) : undefined;
  const qq = qqRaw ? QqSecretSchema.parse(qqRaw) : undefined;
  const effective = Object.assign(Object.create(bindings) as SecretBindings, bindings);
  if (telegram) effective.TELEGRAM_BOT_TOKEN = telegram.token;
  if (wechat) effective.WECHAT_WORK_WEBHOOK_URL = wechat.webhookUrl;
  if (qq) { effective.QQ_BOT_APP_ID = qq.appId; effective.QQ_BOT_CLIENT_SECRET = qq.clientSecret; }
  return {
    bindings: effective,
    sources: {
      telegram: telegram ? "workspace" : bindings.TELEGRAM_BOT_TOKEN?.trim() ? "environment" : null,
      wechat: wechat ? "workspace" : bindings.WECHAT_WORK_WEBHOOK_URL?.trim() ? "environment" : null,
      qq: qq ? "workspace" : bindings.QQ_BOT_APP_ID?.trim() && bindings.QQ_BOT_CLIENT_SECRET?.trim() ? "environment" : null,
    } satisfies Record<SocialChannel, "workspace" | "environment" | null>,
  };
}
