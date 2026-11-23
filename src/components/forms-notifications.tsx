"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiClientError, apiFetch } from "@/lib/client/api";

export function NotificationActions({ unread }: { unread: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function markAll() {
    setBusy(true);
    try {
      await apiFetch("/api/v1/notifications/read-all", { method: "POST", body: "{}" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={markAll}
      disabled={busy || unread === 0}
    >
      {busy ? "Marking..." : `Mark all ${unread} read`}
    </button>
  );
}

export function MarkReadButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function mark() {
    setBusy(true);
    try {
      await apiFetch(`/api/v1/notifications/${id}/read`, { method: "POST", body: "{}" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="btn btn-secondary btn-sm" onClick={mark} disabled={busy}>
      {busy ? "Saving..." : "Mark read"}
    </button>
  );
}

export function EmailPreferenceToggle({
  enabled,
  email,
}: {
  enabled: boolean;
  email: string;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(enabled);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggle(next: boolean) {
    setChecked(next);
    setBusy(true);
    setStatus(null);
    try {
      await apiFetch("/api/v1/profile/preferences", {
        method: "PATCH",
        body: JSON.stringify({ emailNotifications: next }),
      });
      setStatus(next ? "Email updates are on." : "Email updates are off. In-app notifications stay on.");
      router.refresh();
    } catch (caught) {
      setChecked(!next);
      setStatus(caught instanceof ApiClientError ? caught.message : "Could not save the preference.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4">
      <h2 className="text-lg">Email updates</h2>
      <p className="mt-1 text-sm text-muted">
        Sent to {email} from your profile. Recipients are never taken from a form.
      </p>
      <label className="mt-3 flex min-h-[44px] items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={checked}
          disabled={busy}
          onChange={(event) => toggle(event.target.checked)}
        />
        Send me email for approvals and conflict changes
      </label>
      <p aria-live="polite" className="min-h-[20px] text-xs text-muted">
        {status}
      </p>
    </div>
  );
}
