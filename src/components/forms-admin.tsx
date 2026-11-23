"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiClientError, apiFetch, toIso } from "@/lib/client/api";
import type { CampusSettings } from "@/lib/types";

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "idle" | "error" | "done"; message?: string }>({
    kind: "idle",
  });

  async function run(fn: () => Promise<void>, successMessage: string) {
    setBusy(true);
    setStatus({ kind: "idle" });
    try {
      await fn();
      setStatus({ kind: "done", message: successMessage });
      router.refresh();
    } catch (caught) {
      setStatus({
        kind: "error",
        message: caught instanceof ApiClientError ? caught.message : "That did not go through.",
      });
    } finally {
      setBusy(false);
    }
  }

  return { busy, status, run };
}

function StatusLine({ status }: { status: { kind: "idle" | "error" | "done"; message?: string } }) {
  return (
    <p
      aria-live="polite"
      className={`mt-2 min-h-[20px] text-sm ${status.kind === "error" ? "text-danger" : "text-success"}`}
    >
      {status.message}
    </p>
  );
}

export function SettingsForm({ settings }: { settings: CampusSettings }) {
  const { busy, status, run } = useAction();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fairnessWeights = {
      deadline: Number(form.get("deadline")),
      priority: Number(form.get("priority")),
      recentUsage: Number(form.get("recentUsage")),
      hoursEfficiency: Number(form.get("hoursEfficiency")),
      reliability: Number(form.get("reliability")),
    };
    await run(async () => {
      await apiFetch("/api/v1/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({
          weeklyHoursQuota: Number(form.get("weeklyHoursQuota")),
          cancelCutoffHours: Number(form.get("cancelCutoffHours")),
          graceMinutes: Number(form.get("graceMinutes")),
          fairnessWeights,
        }),
      });
    }, "Policy saved.");
  }

  return (
    <form className="card p-4" onSubmit={onSubmit}>
      <h2 className="text-lg">Policy and fairness weights</h2>
      <p className="mt-1 text-sm text-muted">
        Weights must add up to 1.00. They drive the solver&apos;s ranking; the AI only explains it.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="weeklyHoursQuota">
            Weekly quota (h)
          </label>
          <input
            className="input"
            id="weeklyHoursQuota"
            name="weeklyHoursQuota"
            type="number"
            min={1}
            max={60}
            step={0.5}
            defaultValue={settings.weeklyHoursQuota}
          />
        </div>
        <div>
          <label className="label" htmlFor="cancelCutoffHours">
            Cancel cutoff (h)
          </label>
          <input
            className="input"
            id="cancelCutoffHours"
            name="cancelCutoffHours"
            type="number"
            min={0}
            max={48}
            defaultValue={settings.cancelCutoffHours}
          />
        </div>
        <div>
          <label className="label" htmlFor="graceMinutes">
            Check-in grace (min)
          </label>
          <input
            className="input"
            id="graceMinutes"
            name="graceMinutes"
            type="number"
            min={0}
            max={60}
            defaultValue={settings.graceMinutes}
          />
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-5">
        {(
          [
            ["deadline", "Deadline"],
            ["priority", "Priority"],
            ["recentUsage", "Recent usage"],
            ["hoursEfficiency", "Hours efficiency"],
            ["reliability", "Reliability"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <label className="label" htmlFor={key}>
              {label}
            </label>
            <input
              className="input"
              id={key}
              name={key}
              type="number"
              min={0}
              max={1}
              step={0.05}
              defaultValue={settings.fairnessWeights[key]}
            />
          </div>
        ))}
      </div>
      <div className="mt-3">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Saving..." : "Save policy"}
        </button>
        <StatusLine status={status} />
      </div>
    </form>
  );
}

export function EquipmentForm({ labs }: { labs: { id: string; label: string }[] }) {
  const { busy, status, run } = useAction();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const specs: Record<string, string> = {};
    const rawSpecs = String(form.get("specs") ?? "");
    for (const line of rawSpecs.split("\n")) {
      const [key, ...rest] = line.split("=");
      if (key?.trim() && rest.length > 0) specs[key.trim()] = rest.join("=").trim();
    }
    await run(async () => {
      await apiFetch("/api/v1/equipment", {
        method: "POST",
        body: JSON.stringify({
          labId: String(form.get("labId")),
          name: String(form.get("name")),
          category: String(form.get("category")),
          description: String(form.get("description") ?? ""),
          specs,
          tags: String(form.get("tags") ?? "")
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          requiresCertification: form.get("requiresCertification") === "on",
          units: Number(form.get("units") ?? 1),
        }),
      });
    }, "Equipment added.");
  }

  return (
    <form className="card p-4" onSubmit={onSubmit}>
      <h2 className="text-lg">Add equipment</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="eq-lab">
            Lab
          </label>
          <select className="select" id="eq-lab" name="labId" required>
            {labs.map((lab) => (
              <option key={lab.id} value={lab.id}>
                {lab.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="eq-name">
            Name
          </label>
          <input className="input" id="eq-name" name="name" required minLength={2} />
        </div>
        <div>
          <label className="label" htmlFor="eq-category">
            Category
          </label>
          <input className="input" id="eq-category" name="category" required defaultValue="Development Kit" />
        </div>
        <div>
          <label className="label" htmlFor="eq-units">
            Units
          </label>
          <input className="input" id="eq-units" name="units" type="number" min={1} max={30} defaultValue={2} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="eq-description">
            Description
          </label>
          <input className="input" id="eq-description" name="description" />
        </div>
        <div>
          <label className="label" htmlFor="eq-tags">
            Tags (comma separated)
          </label>
          <input className="input" id="eq-tags" name="tags" placeholder="ai, vision" />
        </div>
        <div>
          <label className="label" htmlFor="eq-specs">
            Specs (one key=value per line)
          </label>
          <textarea className="textarea" id="eq-specs" name="specs" placeholder={"ram=64 GB\ncompute=275 TOPS"} />
        </div>
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input type="checkbox" name="requiresCertification" />
          Requires a safety certification
        </label>
      </div>
      <div className="mt-3">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Adding..." : "Add equipment"}
        </button>
        <StatusLine status={status} />
      </div>
    </form>
  );
}

export function MaintenanceForm({ units }: { units: { id: string; label: string }[] }) {
  const { busy, status, run } = useAction();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      await apiFetch("/api/v1/admin/maintenance", {
        method: "POST",
        body: JSON.stringify({
          unitId: String(form.get("unitId")),
          startTime: toIso(String(form.get("startTime"))),
          endTime: toIso(String(form.get("endTime"))),
          reason: String(form.get("reason") ?? ""),
        }),
      });
    }, "Maintenance block added.");
  }

  return (
    <form className="card p-4" onSubmit={onSubmit}>
      <h2 className="text-lg">Maintenance block</h2>
      <p className="mt-1 text-sm text-muted">Blocked time is excluded from availability and from the solver.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="m-unit">
            Unit
          </label>
          <select className="select" id="m-unit" name="unitId" required>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="m-start">
            Starts
          </label>
          <input className="input" id="m-start" name="startTime" type="datetime-local" required />
        </div>
        <div>
          <label className="label" htmlFor="m-end">
            Ends
          </label>
          <input className="input" id="m-end" name="endTime" type="datetime-local" required />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="m-reason">
            Reason
          </label>
          <input className="input" id="m-reason" name="reason" maxLength={200} />
        </div>
      </div>
      <div className="mt-3">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Adding..." : "Add block"}
        </button>
        <StatusLine status={status} />
      </div>
    </form>
  );
}

export function FacultyGrantForm({ members }: { members: { id: string; label: string }[] }) {
  const { busy, status, run } = useAction();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      await apiFetch("/api/v1/admin/faculty", {
        method: "POST",
        body: JSON.stringify({ userId: String(form.get("userId")) }),
      });
    }, "Faculty role granted.");
  }

  return (
    <form className="card p-4" onSubmit={onSubmit}>
      <h2 className="text-lg">Grant faculty role</h2>
      <p className="mt-1 text-sm text-muted">
        Roles are granted here, never inferred from an email address.
      </p>
      <div className="mt-3">
        <label className="label" htmlFor="faculty-user">
          Member
        </label>
        <select className="select" id="faculty-user" name="userId" required>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.label}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Granting..." : "Grant faculty"}
        </button>
        <StatusLine status={status} />
      </div>
    </form>
  );
}

export function CampusForm() {
  const { busy, status, run } = useAction();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const domains = String(form.get("domains") ?? "")
      .split(",")
      .map((domain) => domain.trim())
      .filter(Boolean);
    await run(async () => {
      await apiFetch("/api/v1/campuses", {
        method: "POST",
        body: JSON.stringify({ name: String(form.get("name")), domains }),
      });
    }, "Campus created. A domain can only map to one campus.");
  }

  return (
    <form className="card p-4" onSubmit={onSubmit}>
      <h2 className="text-lg">Add a campus</h2>
      <p className="mt-1 text-sm text-muted">
        A sign-up is accepted only from these domains. The platform admin never sees campus content.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="campus-name">
            Campus name
          </label>
          <input className="input" id="campus-name" name="name" required minLength={2} />
        </div>
        <div>
          <label className="label" htmlFor="campus-domains">
            Email domains (comma separated)
          </label>
          <input className="input" id="campus-domains" name="domains" required placeholder="college.edu.in" />
        </div>
      </div>
      <div className="mt-3">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Creating..." : "Create campus"}
        </button>
        <StatusLine status={status} />
      </div>
    </form>
  );
}
