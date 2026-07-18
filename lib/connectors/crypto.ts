type EncryptedEnvelope = {
  version: 1;
  algorithm: "AES-GCM";
  iv: string;
  ciphertext: string;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function importEncryptionKey(encodedKey: string) {
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(encodedKey.trim());
  } catch {
    throw new Error("CONNECTOR_ENCRYPTION_KEY 必须是 Base64 编码");
  }
  if (bytes.byteLength !== 32) throw new Error("CONNECTOR_ENCRYPTION_KEY 解码后必须恰好为 32 字节");
  const keyMaterial = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return crypto.subtle.importKey("raw", keyMaterial, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptConnectorCredential(value: unknown, encodedKey: string) {
  const key = await importEncryptionKey(encodedKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return JSON.stringify({
    version: 1,
    algorithm: "AES-GCM",
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  } satisfies EncryptedEnvelope);
}

export async function decryptConnectorCredential<T>(source: string, encodedKey: string): Promise<T> {
  const envelope = JSON.parse(source) as EncryptedEnvelope;
  if (envelope.version !== 1 || envelope.algorithm !== "AES-GCM") throw new Error("不支持的凭据密文版本");
  const key = await importEncryptionKey(encodedKey);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(envelope.iv) },
    key,
    base64ToBytes(envelope.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

export function createPkceVerifier() {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(48)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function createPkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return bytesToBase64(new Uint8Array(digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
