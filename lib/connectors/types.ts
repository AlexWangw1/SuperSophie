export const SOCIAL_CHANNELS = ["telegram", "wechat", "qq"] as const;

export type SocialChannel = (typeof SOCIAL_CHANNELS)[number];
export type QqTargetKind = "group" | "user";

export type ConnectorBindings = {
  TELEGRAM_BOT_TOKEN?: string;
  WECHAT_WORK_WEBHOOK_URL?: string;
  QQ_BOT_APP_ID?: string;
  QQ_BOT_CLIENT_SECRET?: string;
  ONEDRIVE_CLIENT_ID?: string;
  ONEDRIVE_CLIENT_SECRET?: string;
  ONEDRIVE_TENANT?: string;
  CONNECTOR_ENCRYPTION_KEY?: string;
};

export type DeliveryRequest = {
  outboxId: string;
  channel: SocialChannel;
  target: string;
  markdown: string;
  metadata?: { targetKind?: QqTargetKind };
};

export type DeliveryReceipt = {
  channel: SocialChannel;
  externalId?: string;
  deliveredAt: string;
};

export class ConnectorConfigurationError extends Error {
  code = "CONNECTOR_NOT_CONFIGURED" as const;
}

export class ConnectorDeliveryError extends Error {
  code = "CONNECTOR_DELIVERY_FAILED" as const;
  readonly externalCode?: string;

  constructor(message: string, externalCode?: string) {
    super(message);
    this.externalCode = externalCode;
  }
}
