import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ACCESS_KEY_ITERATIONS,
  MAX_PBKDF2_ITERATIONS,
  deriveAccessKey,
  normalizeHandle,
  randomSecret,
  sha256,
  verifyAccessKey,
} from "../lib/auth-crypto.ts";
import { publicResourceId, scopedResourceId } from "../lib/workspace-resource.ts";

test("derives and verifies access keys within the Cloudflare PBKDF2 limit", async () => {
  const accessKey = "SS-a-long-random-access-key-for-sophie";
  const derived = await deriveAccessKey(accessKey);
  assert.equal(derived.iterations, ACCESS_KEY_ITERATIONS);
  assert.equal(ACCESS_KEY_ITERATIONS, 100_000);
  assert.equal(MAX_PBKDF2_ITERATIONS, 100_000);
  assert.notEqual(derived.hash, accessKey);
  assert.equal(await verifyAccessKey(accessKey, derived.hash, derived.salt, derived.iterations), true);
  assert.equal(await verifyAccessKey(`${accessKey}-wrong`, derived.hash, derived.salt, derived.iterations), false);
  await assert.rejects(
    deriveAccessKey(accessKey, derived.salt, MAX_PBKDF2_ITERATIONS + 1),
    /access_key_work_factor_unsupported/,
  );
});

test("creates high-entropy session material and normalizes account handles", async () => {
  const first = randomSecret(32);
  const second = randomSecret(32);
  assert.notEqual(first, second);
  assert.ok(first.length >= 43);
  assert.notEqual(await sha256(first), first);
  assert.equal(normalizeHandle("  Sophie_01 "), "sophie_01");
});

test("namespaces user-controlled resource ids without changing their public markdown id", () => {
  assert.equal(scopedResourceId("default", "page-one"), "page-one");
  assert.equal(scopedResourceId("workspace-a", "page-one"), "workspace-a:page-one");
  assert.equal(scopedResourceId("workspace-a", "workspace-a:page-one"), "workspace-a:page-one");
  assert.equal(publicResourceId("workspace-a", "workspace-a:page-one"), "page-one");
});

test("all workspace data route handlers enforce server-side membership", async () => {
  const routes = [
    "../app/api/assets/route.ts",
    "../app/api/chat/route.ts",
    "../app/api/code/route.ts",
    "../app/api/connectors/route.ts",
    "../app/api/connectors/send/route.ts",
    "../app/api/connectors/onedrive/authorize/route.ts",
    "../app/api/connectors/onedrive/conflicts/route.ts",
    "../app/api/connectors/onedrive/route.ts",
    "../app/api/connectors/onedrive/sync/route.ts",
    "../app/api/database/route.ts",
    "../app/api/models/route.ts",
    "../app/api/outbox/route.ts",
    "../app/api/pages/route.ts",
  ];
  for (const route of routes) {
    const source = await readFile(new URL(route, import.meta.url), "utf8");
    assert.match(source, /requireWorkspace\(request/, `${route} must authenticate from the request`);
    assert.doesNotMatch(source, /workspace_id\s*=\s*'default'/, `${route} must not query the shared legacy workspace`);
  }
  const callback = await readFile(new URL("../app/api/connectors/onedrive/callback/route.ts", import.meta.url), "utf8");
  assert.match(callback, /workspace_id AS workspaceId/);
  assert.match(callback, /WHERE state = \? AND provider = 'onedrive'/);
});

test("keeps session tokens out of browser storage and stores Markdown security evidence", async () => {
  const [gate, auth, schema] = await Promise.all([
    readFile(new URL("../app/auth-gate.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/ensure.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(gate, /localStorage\.(setItem|getItem)/);
  assert.match(gate, /创建新访问密钥/);
  assert.match(gate, /navigator\.clipboard\.writeText\(newKey\)/);
  assert.match(auth, /HttpOnly; SameSite=Strict/);
  assert.match(auth, /kind: security-event/);
  for (const table of ["users", "workspaces", "workspace_members", "sessions", "security_events", "asset_ownership", "connector_sync_conflicts", "workspace_tombstones"]) {
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
});

test("uses only SuperSophie authentication and rate-limits public registration", async () => {
  const [page, gate, register, desktop] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/auth-gate.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/register/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../desktop/main.cjs", import.meta.url), "utf8"),
  ]);
  assert.match(page, /<AuthGate>/);
  assert.match(gate, /\/api\/auth\/register/);
  assert.match(gate, /\/api\/auth\/login/);
  assert.match(register, /MAX_REGISTRATIONS_PER_WINDOW/);
  assert.match(register, /too_many_registration_attempts/);
  assert.doesNotMatch(register, /600_000|600000/);
  assert.doesNotMatch(desktop, /auth\.openai\.com|chatgpt\.com/);
  await assert.rejects(
    readFile(new URL("../app/chatgpt-auth.ts", import.meta.url), "utf8"),
    (error) => error && typeof error === "object" && "code" in error && error.code === "ENOENT",
  );
});
