import fs from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

async function loadEnvFile(fileName) {
  try {
    const contents = await fs.readFile(path.join(process.cwd(), fileName), "utf8");

    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separator = trimmed.indexOf("=");

      if (separator <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separator).trim();
      const rawValue = trimmed.slice(separator + 1).trim();
      const value = rawValue.replace(/^["']|["']$/g, "");

      process.env[key] ??= value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

await loadEnvFile(".env.local");
await loadEnvFile(".env");

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required. Copy .env.example to .env.local and set DATABASE_URL.");
  process.exit(1);
}

const schemaPath = path.join(process.cwd(), "db", "schema.sql");
const schema = await fs.readFile(schemaPath, "utf8");
const sql = postgres(databaseUrl, {
  max: 1,
  ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? false : "require",
});

try {
  await sql.unsafe(schema);
  console.log("Database schema applied.");
} finally {
  await sql.end();
}
