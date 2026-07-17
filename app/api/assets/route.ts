import { env } from "cloudflare:workers";
import { ensureSchema } from "../../../db/ensure";

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  try {
    if (!env.FILES) throw new Error("R2 binding FILES is unavailable");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "file is required" }, { status: 400 });
    const bytes = await file.arrayBuffer();
    const sha256 = hex(await crypto.subtle.digest("SHA-256", bytes));
    const key = `assets/${sha256}/${encodeURIComponent(file.name)}`;
    await env.FILES.put(key, bytes, { httpMetadata: { contentType: file.type || "application/octet-stream" } });
    await ensureSchema();
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO assets (id, name, mime, size, sha256, r2_key) VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(id, file.name, file.type || "application/octet-stream", file.size, sha256, key).run();
    return Response.json({ id, key, sha256, name: file.name }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to upload asset" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (!env.FILES) return new Response("R2 binding FILES is unavailable", { status: 500 });
  const key = new URL(request.url).searchParams.get("key");
  if (!key) return new Response("key is required", { status: 400 });
  const object = await env.FILES.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
}

