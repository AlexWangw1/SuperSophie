import { decryptConnectorCredential, encryptConnectorCredential } from "./connectors/crypto.ts";

type SecretBindings = Record<string, unknown> & { CONNECTOR_ENCRYPTION_KEY?: string };

function encryptionKey(bindings: SecretBindings) {
  const value = bindings.CONNECTOR_ENCRYPTION_KEY;
  if (typeof value !== "string" || !value.trim()) throw new Error("工作区密钥库尚未配置 CONNECTOR_ENCRYPTION_KEY");
  return value.trim();
}

function assertProvider(provider: string) {
  if (!/^[a-z][a-z0-9:-]{1,79}$/.test(provider)) throw new Error("密钥提供商标识无效");
}

export async function readWorkspaceSecret<T>(input: {
  db: D1Database;
  workspaceId: string;
  provider: string;
  bindings: SecretBindings;
}) {
  assertProvider(input.provider);
  const row = await input.db.prepare(
    `SELECT credential_ciphertext AS ciphertext
     FROM connector_credentials WHERE workspace_id = ? AND provider = ? LIMIT 1`,
  ).bind(input.workspaceId, input.provider).first<{ ciphertext: string }>();
  if (!row) return undefined;
  return decryptConnectorCredential<T>(row.ciphertext, encryptionKey(input.bindings));
}

export async function writeWorkspaceSecret(input: {
  db: D1Database;
  workspaceId: string;
  provider: string;
  value: unknown;
  label?: string;
  bindings: SecretBindings;
}) {
  assertProvider(input.provider);
  const ciphertext = await encryptConnectorCredential(input.value, encryptionKey(input.bindings));
  await input.db.prepare(
    `INSERT INTO connector_credentials
      (id, workspace_id, provider, credential_ciphertext, account_label, scopes, expires_at)
     VALUES (?, ?, ?, ?, ?, '', NULL)
     ON CONFLICT(workspace_id, provider) DO UPDATE SET
       credential_ciphertext = excluded.credential_ciphertext,
       account_label = excluded.account_label,
       scopes = '',
       expires_at = NULL,
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(crypto.randomUUID(), input.workspaceId, input.provider, ciphertext, (input.label ?? "").slice(0, 160)).run();
}

export async function deleteWorkspaceSecret(input: { db: D1Database; workspaceId: string; provider: string }) {
  assertProvider(input.provider);
  await input.db.prepare(
    `DELETE FROM connector_credentials WHERE workspace_id = ? AND provider = ?`,
  ).bind(input.workspaceId, input.provider).run();
}
