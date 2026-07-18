interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<unknown>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
}

interface R2ObjectBody {
  body: ReadableStream;
  httpEtag: string;
  writeHttpMetadata(headers: Headers): void;
}

interface R2Bucket {
  put(
    key: string,
    value: ArrayBuffer | ReadableStream | Blob | string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
}

declare module "cloudflare:workers" {
  export const env: {
    DB: D1Database;
    FILES: R2Bucket;
    OPENAI_API_KEY?: string;
    OPENROUTER_API_KEY?: string;
    OLLAMA_BASE_URL?: string;
    SOPHIE_MODEL_CATALOG_JSON?: string;
    TELEGRAM_BOT_TOKEN?: string;
    WECHAT_WORK_WEBHOOK_URL?: string;
    QQ_BOT_APP_ID?: string;
    QQ_BOT_CLIENT_SECRET?: string;
    ONEDRIVE_CLIENT_ID?: string;
    ONEDRIVE_CLIENT_SECRET?: string;
    ONEDRIVE_TENANT?: string;
    CONNECTOR_ENCRYPTION_KEY?: string;
  };
}
