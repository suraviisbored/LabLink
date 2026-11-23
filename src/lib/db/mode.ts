import { env } from "@/lib/env";

/**
 * Which adapter is active. Postgres needs a URL, an anon key and the
 * service-role key (the adapter writes from the server, never the browser).
 * Anything less falls back to the seeded in-memory store so the demo never
 * breaks because of a half-filled .env.
 */
export function postgresMode(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey && env.supabaseServiceKey);
}

export function databaseLabel(): "postgres" | "memory" {
  return postgresMode() ? "postgres" : "memory";
}
