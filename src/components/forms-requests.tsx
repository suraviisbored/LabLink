"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiClientError, apiFetch, toIso } from "@/lib/client/api";

export interface Option {
  id: string;
  label: string;
}

export function RequestForm({
  equipment,
  projects,
  faculty,
}: {
  equipment: Option[];
  projects: Option[];
  faculty: Option[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"existing" | "new">(projects.length > 0 ? "existing" : "new");
  const [status, setStatus] = useState<{ kind: "idle" | "busy" | "error" | "done"; message?: string }>({
    kind: "idle",
  });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setStatus({ kind: "busy" });

    const windowStart = String(form.get("windowStart") ?? "");
    const windowEnd = String(form.get("windowEnd") ?? "");
    if (!windowStart || !windowEnd) {
      setStatus({ kind: "error", message: "Choose both the start and end of the window." });
      return;
    }

    const payload: Record<string, unknown> = {
      equipmentId: String(form.get("equipmentId") ?? ""),
      hoursNeeded: Number(form.get("hoursNeeded") ?? 0),
      windowStart: toIso(windowStart),
      windowEnd: toIso(windowEnd),
      justification: String(form.get("justification") ?? ""),
    };

    if (mode === "existing") {
      payload.projectId = String(form.get("projectId") ?? "");
    } else {
      payload.newProject = {
        title: String(form.get("title") ?? ""),
        description: String(form.get("description") ?? ""),
        deadline: toIso(String(form.get("deadline") ?? "")),
        facultyId: form.get("facultyId") ? String(form.get("facultyId")) : null,
      };
    }

    try {
      await apiFetch("/api/v1/requests", { method: "POST", body: JSON.stringify(payload) });
      setStatus({ kind: "done", message: "Request submitted. Your faculty guide has been notified." });
      router.refresh();
    } catch (caught) {
      setStatus({
        kind: "error",
        message: caught instanceof ApiClientError ? caught.message : "Could not submit the request.",
      });
    }
  }

  return (
    <form className="card p-4" onSubmit={onSubmit}>
      <h2 className="text-lg">New access request</h2>
      <p className="mt-1 text-sm text-muted">
        Access requests are project-based: your faculty guide approves them, and approved requests carry a
        priority tier into allocation.
      </p>

      <fieldset className="mt-4">
        <legend className="label">Project</legend>
        <div className="flex flex-wrap gap-3">
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            <input
              type="radio"
              name="projectMode"
              checked={mode === "existing"}
              onChange={() => setMode("existing")}
              disabled={projects.length === 0}
            />
            Use an existing project
          </label>
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            <input
              type="radio"
              name="projectMode"
              checked={mode === "new"}
              onChange={() => setMode("new")}
            />
            Describe a new project
          </label>
        </div>
      </fieldset>

      {mode === "existing" ? (
        <div className="mt-3">
          <label className="label" htmlFor="projectId">
            Project
          </label>
          <select className="select" id="projectId" name="projectId" required>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="title">
              Project title
            </label>
            <input className="input" id="title" name="title" required minLength={3} maxLength={140} />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="description">
              What are you building?
            </label>
            <textarea className="textarea" id="description" name="description" maxLength={2000} />
          </div>
          <div>
            <label className="label" htmlFor="deadline">
              Project deadline
            </label>
            <input className="input" id="deadline" name="deadline" type="datetime-local" required />
          </div>
          <div>
            <label className="label" htmlFor="facultyId">
              Faculty guide
            </label>
            <select className="select" id="facultyId" name="facultyId">
              <option value="">No guide yet</option>
              {faculty.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="equipmentId">
            Equipment
          </label>
          <select className="select" id="equipmentId" name="equipmentId" required>
            {equipment.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="hoursNeeded">
            Hours needed
          </label>
          <input
            className="input"
            id="hoursNeeded"
            name="hoursNeeded"
            type="number"
            min={0.5}
            max={200}
            step={0.5}
            defaultValue={4}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="windowStart">
            Window starts
          </label>
          <input className="input" id="windowStart" name="windowStart" type="datetime-local" required />
        </div>
        <div>
          <label className="label" htmlFor="windowEnd">
            Window ends
          </label>
          <input className="input" id="windowEnd" name="windowEnd" type="datetime-local" required />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="justification">
            Why do you need this?
          </label>
          <textarea
            className="textarea"
            id="justification"
            name="justification"
            minLength={5}
            maxLength={2000}
            required
            aria-describedby="justification-hint"
          />
          <p className="hint" id="justification-hint">
            Your guide sees this. Be specific about what you will run and why this equipment.
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button className="btn btn-primary" type="submit" disabled={status.kind === "busy"}>
          {status.kind === "busy" ? "Submitting..." : "Submit request"}
        </button>
      </div>
      <p
        aria-live="polite"
        className={`mt-2 min-h-[20px] text-sm ${status.kind === "error" ? "text-danger" : "text-success"}`}
      >
        {status.message}
      </p>
    </form>
  );
}

export function DecisionForm({
  requestId,
  version,
}: {
  requestId: string;
  version: number;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState<"approve" | "reject" | "modify">("approve");
  const [note, setNote] = useState("");
  const [priority, setPriority] = useState("normal");
  const [status, setStatus] = useState<{ kind: "idle" | "busy" | "error" | "done"; message?: string }>({
    kind: "idle",
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus({ kind: "busy" });
    try {
      await apiFetch(`/api/v1/requests/${requestId}/decision`, {
        method: "PATCH",
        body: JSON.stringify({
          decision,
          note: note || undefined,
          priority,
          version,
        }),
      });
      setStatus({ kind: "done", message: "Decision recorded." });
      router.refresh();
    } catch (caught) {
      setStatus({
        kind: "error",
        message:
          caught instanceof ApiClientError
            ? caught.code === "STALE_STATE"
              ? "Another reviewer already decided this. Reload to see the current state."
              : caught.message
            : "Could not record the decision.",
      });
    }
  }

  return (
    <form className="mt-3 border-t border-line pt-3" onSubmit={submit}>
      <div className="flex flex-wrap gap-2">
        {(["approve", "modify", "reject"] as const).map((value) => (
          <label key={value} className="flex min-h-[44px] items-center gap-2 text-sm">
            <input
              type="radio"
              name={`decision-${requestId}`}
              value={value}
              checked={decision === value}
              onChange={() => setDecision(value)}
            />
            {value === "approve" ? "Approve" : value === "modify" ? "Approve with changes" : "Reject"}
          </label>
        ))}
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_180px]">
        <div>
          <label className="label" htmlFor={`note-${requestId}`}>
            Note to the student {decision === "reject" ? "(required)" : "(optional)"}
          </label>
          <input
            className="input"
            id={`note-${requestId}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            required={decision === "reject"}
          />
        </div>
        <div>
          <label className="label" htmlFor={`priority-${requestId}`}>
            Priority tier
          </label>
          <select
            className="select"
            id={`priority-${requestId}`}
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
          >
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <button className="btn btn-primary btn-sm" type="submit" disabled={status.kind === "busy"}>
          {status.kind === "busy" ? "Saving..." : "Record decision"}
        </button>
        <p
          aria-live="polite"
          className={`text-xs ${status.kind === "error" ? "text-danger" : "text-success"}`}
        >
          {status.message}
        </p>
      </div>
    </form>
  );
}
