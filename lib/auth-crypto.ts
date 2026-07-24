// Cloudflare Workers Web Crypto rejects PBKDF2 counts above 100,000.
// SuperSophie access keys are high-entropy random secrets, so PBKDF2 is a
// database-compromise defense rather than the primary source of entropy.
export const ACCESS_KEY_ITERATIONS = 100_000;
export const MAX_PBKDF2_ITERATIONS = 100_000;

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function randomSecret(byteLength = 32) {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function deriveAccessKey(accessKey: string, salt = randomSecret(16), iterations = ACCESS_KEY_ITERATIONS) {
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_PBKDF2_ITERATIONS) {
    throw new Error("access_key_work_factor_unsupported");
  }
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(accessKey),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: base64UrlToBytes(salt), iterations },
    keyMaterial,
    256,
  );
  return { hash: bytesToBase64Url(new Uint8Array(bits)), salt, iterations };
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

export async function verifyAccessKey(accessKey: string, expectedHash: string, salt: string, iterations: number) {
  const derived = await deriveAccessKey(accessKey, salt, iterations);
  return constantTimeEqual(derived.hash, expectedHash);
}

export function normalizeHandle(value: string) {
  return value.trim().toLowerCase();
}
