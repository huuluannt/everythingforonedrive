import postgres from "postgres";

let client: ReturnType<typeof postgres> | null = null;

export function getSql() {
  if (!client) {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required");
    }

    client = postgres(databaseUrl, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? false : "require",
    });
  }

  return client;
}
