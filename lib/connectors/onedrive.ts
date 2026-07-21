import { decryptConnectorCredential, encryptConnectorCredential } from "./crypto.ts";
import type { ConnectorBindings } from "./types.ts";

const ONEDRIVE_SCOPES = "offline_access Files.ReadWrite User.Read";

export type OneDriveCredential = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  scope: string;
  expiresAt: string;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  error?: string;
};

type GraphDriveItem = {
  id?: string;
  name?: string;
  size?: number;
  eTag?: string;
  lastModifiedDateTime?: string;
  webUrl?: string;
  "@microsoft.graph.downloadUrl"?: string;
  error?: { code?: string };
};

export class OneDrivePreconditionError extends Error {
  constructor() {
    super("OneDrive 文件在同步期间被另一台设备更新");
    this.name = "OneDrivePreconditionError";
  }
}

function requireOneDriveBindings(bindings: ConnectorBindings) {
  if (!bindings.ONEDRIVE_CLIENT_ID?.trim() || !bindings.ONEDRIVE_CLIENT_SECRET?.trim() || !bindings.CONNECTOR_ENCRYPTION_KEY?.trim()) {
    throw new Error("OneDrive OAuth 尚未配置");
  }
  return {
    clientId: bindings.ONEDRIVE_CLIENT_ID.trim(),
    clientSecret: bindings.ONEDRIVE_CLIENT_SECRET.trim(),
    encryptionKey: bindings.CONNECTOR_ENCRYPTION_KEY.trim(),
    tenant: bindings.ONEDRIVE_TENANT?.trim() || "common",
  };
}

export function getOneDriveOAuthConfig(bindings: ConnectorBindings) {
  return { ...requireOneDriveBindings(bindings), scopes: ONEDRIVE_SCOPES };
}

function tokenEndpoint(tenant: string) {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;
}

function credentialFromToken(payload: TokenResponse, previousRefreshToken?: string): OneDriveCredential {
  if (!payload.access_token || !(payload.refresh_token || previousRefreshToken)) throw new Error("Microsoft 未返回可用的访问令牌");
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || previousRefreshToken || "",
    tokenType: payload.token_type || "Bearer",
    scope: payload.scope || ONEDRIVE_SCOPES,
    expiresAt: new Date(Date.now() + Math.max(60, payload.expires_in || 3600) * 1000).toISOString(),
  };
}

export async function exchangeOneDriveCode(input: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  bindings: ConnectorBindings;
  fetcher?: typeof fetch;
}) {
  const config = requireOneDriveBindings(input.bindings);
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: input.code,
    code_verifier: input.codeVerifier,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
    scope: ONEDRIVE_SCOPES,
  });
  const response = await (input.fetcher ?? fetch)(tokenEndpoint(config.tenant), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await response.json() as TokenResponse;
  if (!response.ok) throw new Error(`Microsoft OAuth 交换失败${payload.error ? `（${payload.error}）` : ""}`);
  return credentialFromToken(payload);
}

export async function encryptOneDriveCredential(credential: OneDriveCredential, bindings: ConnectorBindings) {
  return encryptConnectorCredential(credential, requireOneDriveBindings(bindings).encryptionKey);
}

export async function getOneDriveAccessToken(input: {
  db: D1Database;
  bindings: ConnectorBindings;
  workspaceId: string;
  fetcher?: typeof fetch;
}) {
  const config = requireOneDriveBindings(input.bindings);
  const row = await input.db.prepare(
    `SELECT credential_ciphertext AS credentialCiphertext, account_label AS accountLabel
     FROM connector_credentials WHERE workspace_id = ? AND provider = 'onedrive' LIMIT 1`,
  ).bind(input.workspaceId).first<{ credentialCiphertext: string; accountLabel: string }>();
  if (!row) throw new Error("OneDrive 尚未连接");
  let credential = await decryptConnectorCredential<OneDriveCredential>(row.credentialCiphertext, config.encryptionKey);
  if (Date.parse(credential.expiresAt) <= Date.now() + 60_000) {
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: credential.refreshToken,
      grant_type: "refresh_token",
      scope: ONEDRIVE_SCOPES,
    });
    const response = await (input.fetcher ?? fetch)(tokenEndpoint(config.tenant), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const payload = await response.json() as TokenResponse;
    if (!response.ok) throw new Error(`OneDrive 令牌刷新失败${payload.error ? `（${payload.error}）` : ""}`);
    credential = credentialFromToken(payload, credential.refreshToken);
    const ciphertext = await encryptConnectorCredential(credential, config.encryptionKey);
    await input.db.prepare(
      `UPDATE connector_credentials SET credential_ciphertext = ?, scopes = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE workspace_id = ? AND provider = 'onedrive'`,
    ).bind(ciphertext, credential.scope, credential.expiresAt, input.workspaceId).run();
  }
  return { accessToken: credential.accessToken, accountLabel: row.accountLabel };
}

export async function uploadOneDriveMarkdown(input: {
  accessToken: string;
  fileName: string;
  markdown: string;
  itemId?: string;
  ifMatch?: string;
  fetcher?: typeof fetch;
}) {
  const bytes = new TextEncoder().encode(input.markdown);
  if (bytes.byteLength > 250 * 1024 * 1024) throw new Error("OneDrive 单文件快照超过 250 MB，请改用分片上传");
  const path = encodeURIComponent(input.fileName).replace(/%2F/gi, "/");
  const target = input.itemId
    ? `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(input.itemId)}/content`
    : `https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/content`;
  const headers: Record<string, string> = {
    authorization: `Bearer ${input.accessToken}`,
    "content-type": "text/markdown; charset=utf-8",
  };
  if (input.ifMatch) headers["if-match"] = input.ifMatch;
  const response = await (input.fetcher ?? fetch)(target, {
    method: "PUT",
    headers,
    body: input.markdown,
  });
  if (response.status === 412) throw new OneDrivePreconditionError();
  const payload = await response.json() as GraphDriveItem;
  if (!response.ok || !payload.id) throw new Error(`OneDrive 上传失败${payload.error?.code ? `（${payload.error.code}）` : ""}`);
  return { id: payload.id, name: payload.name || input.fileName, webUrl: payload.webUrl, eTag: payload.eTag };
}

export async function downloadOneDriveMarkdown(input: {
  accessToken: string;
  fileName: string;
  fetcher?: typeof fetch;
}) {
  const fetcher = input.fetcher ?? fetch;
  const path = encodeURIComponent(input.fileName).replace(/%2F/gi, "/");
  const metadataResponse = await fetcher(
    `https://graph.microsoft.com/v1.0/me/drive/root:/${path}?$select=id,name,eTag,lastModifiedDateTime,webUrl,@microsoft.graph.downloadUrl`,
    { headers: { authorization: `Bearer ${input.accessToken}` } },
  );
  if (metadataResponse.status === 404) return null;
  const metadata = await metadataResponse.json() as GraphDriveItem;
  if (!metadataResponse.ok || !metadata.id) {
    throw new Error(`OneDrive 文件读取失败${metadata.error?.code ? `（${metadata.error.code}）` : ""}`);
  }
  const downloadUrl = metadata["@microsoft.graph.downloadUrl"];
  if (!downloadUrl) throw new Error("OneDrive 未返回可用的快照下载地址");
  const contentResponse = await fetcher(downloadUrl);
  if (!contentResponse.ok) throw new Error(`OneDrive 快照下载失败（HTTP ${contentResponse.status}）`);
  const markdown = await contentResponse.text();
  if (new TextEncoder().encode(markdown).byteLength > 250 * 1024 * 1024) {
    throw new Error("OneDrive 工作区快照超过 250 MB，已拒绝直接合并");
  }
  return {
    id: metadata.id,
    name: metadata.name || input.fileName,
    eTag: metadata.eTag,
    lastModifiedDateTime: metadata.lastModifiedDateTime,
    webUrl: metadata.webUrl,
    markdown,
  };
}

export async function uploadOneDriveBinary(input: {
  accessToken: string;
  fileName: string;
  bytes: ArrayBuffer;
  contentType?: string;
  fetcher?: typeof fetch;
}) {
  if (input.bytes.byteLength > 250 * 1024 * 1024) throw new Error("OneDrive 单附件超过 250 MB，请改用分片上传");
  const path = encodeURIComponent(input.fileName).replace(/%2F/gi, "/");
  const response = await (input.fetcher ?? fetch)(`https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/content`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      "content-type": input.contentType || "application/octet-stream",
    },
    body: input.bytes,
  });
  const payload = await response.json() as GraphDriveItem;
  if (!response.ok || !payload.id) throw new Error(`OneDrive 附件上传失败${payload.error?.code ? `（${payload.error.code}）` : ""}`);
  return { id: payload.id, name: payload.name || input.fileName, size: payload.size ?? input.bytes.byteLength, eTag: payload.eTag };
}

export async function downloadOneDriveBinary(input: {
  accessToken: string;
  fileName: string;
  maxBytes?: number;
  fetcher?: typeof fetch;
}) {
  const fetcher = input.fetcher ?? fetch;
  const maximum = input.maxBytes ?? 32 * 1024 * 1024;
  const path = encodeURIComponent(input.fileName).replace(/%2F/gi, "/");
  const metadataResponse = await fetcher(
    `https://graph.microsoft.com/v1.0/me/drive/root:/${path}?$select=id,name,size,eTag,lastModifiedDateTime,@microsoft.graph.downloadUrl`,
    { headers: { authorization: `Bearer ${input.accessToken}` } },
  );
  if (metadataResponse.status === 404) return null;
  const metadata = await metadataResponse.json() as GraphDriveItem;
  if (!metadataResponse.ok || !metadata.id) throw new Error(`OneDrive 附件读取失败${metadata.error?.code ? `（${metadata.error.code}）` : ""}`);
  if (typeof metadata.size === "number" && metadata.size > maximum) throw new Error("OneDrive 附件超过允许大小");
  const downloadUrl = metadata["@microsoft.graph.downloadUrl"];
  if (!downloadUrl) throw new Error("OneDrive 未返回可用的附件下载地址");
  const contentResponse = await fetcher(downloadUrl);
  if (!contentResponse.ok) throw new Error(`OneDrive 附件下载失败（HTTP ${contentResponse.status}）`);
  const bytes = await contentResponse.arrayBuffer();
  if (bytes.byteLength > maximum) throw new Error("OneDrive 附件超过允许大小");
  return {
    id: metadata.id,
    name: metadata.name || input.fileName,
    size: metadata.size ?? bytes.byteLength,
    eTag: metadata.eTag,
    lastModifiedDateTime: metadata.lastModifiedDateTime,
    bytes,
  };
}
