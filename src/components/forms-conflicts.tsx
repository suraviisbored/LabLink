"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { ApiClientError, apiFetch } from "@/lib/client/api";

export function RecommendButton({ conflictId, hasOptions }: { conflictId: string; hasOptions: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/conflicts/${conflictId}/recommend`, { method: "POST", body: "{}" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Could not generate options.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" className="btn btn-primary" onClick={run} disabled={busy}>
        <Sparkles aria-hidden="true" size={16} strokeWidth={1.75} />
        {busy ? "Working..." : hasOptions ? "Regenerate options" : "Recommend allocations"}
      </button>
      {error ? (
        <p aria-live="polite" className="mt-1 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ResolveForm({
  conflictId,
  optionId,
  rank,
}: {
  conflictId: string;
  optionId: string;
  rank: number;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    if (!window.confirm(`Apply option ${rank}? This books the allocations and notifies students.`)) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/conflicts/${conflictId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ optionId, overrideNote: note || undefined }),
      });
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.code === "STALE_STATE"
            ? "This option is stale. Regenerate the recommendation."
            : caught.message
          : "Could not apply the allocation.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="label" htmlFor={`note-${optionId}`}>
            Override note (optional, kept in the audit log)
          </label>
          <input
            className="input"
            id={`note-${optionId}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
          />
        </div>
        <button type="button" className="btn btn-primary" onClick={apply} disabled={busy}>
          {busy ? "Applying..." : "Apply this allocation"}
        </button>
      </div>
      {error ? (
        <p aria-live="polite" className="mt-1 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
