"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { ApiClientError, apiFetch } from "@/lib/client/api";

const DEMO_ROLES = [
  { role: "student", label: "Continue as Student", hint: "Aarav Sharma · demo campus" },
  { role: "faculty", label: "Continue as Faculty", hint: "Dr. Meera Iyer · approvals" },
  { role: "campus_admin", label: "Continue as Campus Admin", hint: "Sana Qureshi · full campus" },
  { role: "super_admin", label: "Continue as Platform Admin", hint: "Campuses and domains only" },
] as const;

export function DemoLoginButtons() {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(role: string) {
    setPending(role);
    setError(null);
    try {
      await apiFetch("/api/v1/auth/demo", {
        method: "POST",
        body: JSON.stringify({ role }),
      });
      router.push(role === "super_admin" ? "/admin/campuses" : "/equipment");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Could not sign in.");
      setPending(null);
    }
  }

  return (
    <div>
      <div className="grid gap-2">
        {DEMO_ROLES.map((entry) => (
          <button
            key={entry.role}
            type="button"
            className="btn btn-primary w-full justify-between"
            onClick={() => signIn(entry.role)}
            disabled={pending !== null}
          >
            <span>{entry.label}</span>
            <span className="text-xs font-normal text-[#e9e1db]">{entry.hint}</span>
          </button>
        ))}
      </div>
      <p aria-live="polite" className="mt-3 min-h-[20px] text-sm text-danger">
        {error}
      </p>
    </div>
  );
}

export function SignupForm({ domains }: { domains: string[] }) {
  const router = useRouter();
  const [state, setState] = useState<{ kind: "idle" | "busy" | "error" | "done"; message?: string }>(
    { kind: "idle" },
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState({ kind: "busy" });
    try {
      await apiFetch("/api/v1/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          name: String(form.get("name") ?? ""),
          email: String(form.get("email") ?? ""),
        }),
      });
      setState({ kind: "done", message: "Account created. Taking you to the catalogue..." });
      router.push("/equipment");
      router.refresh();
    } catch (caught) {
      setState({
        kind: "error",
        message: caught instanceof ApiClientError ? caught.message : "Could not create the account.",
      });
    }
  }

  return (
    <form className="mt-6 space-y-3" onSubmit={onSubmit} noValidate>
      <div>
        <label className="label" htmlFor="signup-name">
          Full name
        </label>
        <input className="input" id="signup-name" name="name" required minLength={2} autoComplete="name" />
      </div>
      <div>
        <label className="label" htmlFor="signup-email">
          College email
        </label>
        <input
          className="input"
          id="signup-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          aria-describedby="signup-email-hint"
        />
        <p className="hint" id="signup-email-hint">
          Your domain decides your campus: {domains.join(", ")}. Other domains are rejected.
        </p>
      </div>
      <button className="btn btn-primary w-full" type="submit" disabled={state.kind === "busy"}>
        {state.kind === "busy" ? "Creating account..." : "Create student account"}
      </button>
      <p
        aria-live="polite"
        className={`min-h-[20px] text-sm ${state.kind === "error" ? "text-danger" : "text-success"}`}
      >
        {state.message}
      </p>
    </form>
  );
}

export function LogoutButton({
  compact = false,
  iconOnly = false,
}: {
  compact?: boolean;
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await apiFetch("/api/v1/auth/logout", { method: "POST", body: "{}" });
      router.push("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={signOut}
        className="btn btn-secondary btn-sm w-10 px-0"
        disabled={busy}
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut aria-hidden="true" size={16} strokeWidth={1.75} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className={compact ? "btn btn-secondary btn-sm" : "btn btn-secondary"}
      disabled={busy}
      aria-label="Sign out"
    >
      {busy ? "Signing out..." : "Sign out"}
    </button>
  );
}
