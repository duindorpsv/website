declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    SPORTLINK_CLIENT_ID?: string;
  }
}
