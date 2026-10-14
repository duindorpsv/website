import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./db/migrations",
  schema: "./db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {url: process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL || ''},
});
