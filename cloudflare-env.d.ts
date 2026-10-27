declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    BSS_ADMIN_PASSWORD_HASH: string;
    BUCKET?: R2Bucket;
  }
}
