import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Row } from "@/lib/db/pg/schema";

/**
 * The narrow slice of PostgREST the adapter uses. Keeping it explicit means the
 * diff/flush logic can be tested without a network, and swapping the transport
 * (pooler, PostgREST self-hosted) stays a one-file change.
 */

export interface DatabaseError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

export interface SelectResult {
  data: Row[] | null;
  error: DatabaseError | null;
}

export interface QueryBuilder {
  select(columns: string): {
    range(from: number, to: number): PromiseLike<SelectResult>;
  };
  upsert(rows: Row[], options: { onConflict: string }): PromiseLike<{ error: DatabaseError | null }>;
  delete(): {
    match(filter: Row): PromiseLike<{ error: DatabaseError | null }>;
  };
}

export interface DatabaseClient {
  from(table: string): QueryBuilder;
}

/**
 * Server-only client. It uses the service-role key because the app is a
 * server-rendered Next.js app: the browser never talks to PostgREST, sessions
 * are our own signed cookie, and every repository query is scoped by campus.
 * RLS stays enabled for anything that *does* reach PostgREST with a user JWT.
 * See docs/SECURITY.md 4.3.
 */
export function createDatabaseClient(): DatabaseClient {
  const url = env.supabaseUrl;
  const key = env.supabaseServiceKey;

  if (!url || !key) {
    throw new Error("Supabase URL and service-role key are required for Postgres mode.");
  }

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-application-name": "lablink" } },
  });

  return client as unknown as DatabaseClient;
}
