/**
 * Environment access in one place. Nothing here is ever sent to the browser:
 * only NEXT_PUBLIC_* values are readable client-side, and only the Supabase
 * anon key is public (docs/SECURITY.md 4.2).
 */

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export const env = {
  get demoMode(): boolean {
    return read("DEMO_MODE") !== "false";
  },
  get appOrigin(): string {
    return read("APP_ORIGIN") ?? "http://localhost:3000";
  },
  get sessionSecret(): string {
    return read("APP_SECRET") ?? "lablink-development-secret-change-in-production";
  },
  get supabaseUrl(): string | undefined {
    return read("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey(): string | undefined {
    return read("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get supabaseServiceKey(): string | undefined {
    return read("SUPABASE_SERVICE_ROLE_KEY");
  },
  get supabaseConfigured(): boolean {
    return Boolean(read("NEXT_PUBLIC_SUPABASE_URL") && read("NEXT_PUBLIC_SUPABASE_ANON_KEY"));
  },
  get geminiKey(): string | undefined {
    return read("GEMINI_API_KEY");
  },
  get geminiModel(): string {
    return read("GEMINI_MODEL") ?? "gemini-2.0-flash";
  },
  get emailProvider(): string {
    return read("EMAIL_PROVIDER") ?? "console";
  },
  get emailApiKey(): string | undefined {
    return read("EMAIL_API_KEY");
  },
  get emailFrom(): string {
    return read("EMAIL_FROM") ?? "no-reply@lablink.example";
  },
  get demoEmails() {
    return {
      student: read("DEMO_STUDENT_EMAIL") ?? "student@demo.lablink.example",
      faculty: read("DEMO_FACULTY_EMAIL") ?? "faculty@demo.lablink.example",
      admin: read("DEMO_ADMIN_EMAIL") ?? "admin@demo.lablink.example",
    };
  },
};
