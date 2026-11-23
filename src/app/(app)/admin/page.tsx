import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, Mail, ScrollText, Settings2, Users } from "lucide-react";
import { Badge, Card, PageHeader, Stat, TierNote } from "@/components/ui";
import {
  EquipmentForm,
  FacultyGrantForm,
  MaintenanceForm,
  SettingsForm,
} from "@/components/forms-admin";
import { getSession } from "@/lib/auth/server";
import { loadStore } from "@/lib/db";
import { campusMembers, listAudit, utilisation } from "@/lib/repo/admin";
import { getSettings } from "@/lib/repo/bookings";
import { listLabs } from "@/lib/repo/catalogue";
import { emailLog } from "@/lib/repo/notifications";
import { addDays, formatIst, formatIstDate, nowIso } from "@/lib/time";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "campus_admin") redirect("/equipment");
  if (!session.campusId) redirect("/login");

  const store = await loadStore();
  const campusId = session.campusId;
  const settings = getSettings(store, campusId);
  const report = utilisation(store, campusId, nowIso(), addDays(nowIso(), 7));
  const logs = emailLog(store, campusId, 30);
  const audits = listAudit(store, campusId, 30);
  const labs = listLabs(store, campusId);
  const members = campusMembers(store, campusId);
  const units = store.data.units
    .filter((unit) => unit.campusId === campusId)
    .map((unit) => ({
      id: unit.id,
      label: `${store.data.equipment.find((item) => item.id === unit.equipmentId)?.name ?? "Unit"} · ${unit.assetTag} · ${unit.status}`,
    }));

  return (
    <div>
      <PageHeader
        eyebrow={session.campusName}
        title="Campus administration"
        description="Equipment, availability, maintenance, quota, fairness weights, faculty roles, utilisation, the audit trail and the email log."
        actions={<Badge tone="ink">campus_admin</Badge>}
      />

      <nav aria-label="Admin sections" className="mb-6 flex flex-wrap gap-2">
        {[
          ["#policy", "Policy", Settings2],
          ["#equipment", "Equipment", Activity],
          ["#utilisation", "Utilisation", Activity],
          ["#people", "People", Users],
          ["#email", "Email log", Mail],
          ["#audit", "Audit", ScrollText],
        ].map(([href, label]) => (
          <a key={String(href)} className="btn btn-secondary btn-sm" href={String(href)}>
            {String(label)}
          </a>
        ))}
      </nav>

      <section id="policy" className="mb-8 scroll-mt-6">
        <SettingsForm settings={settings} />
      </section>

      <section id="equipment" className="mb-8 scroll-mt-6">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-xl">Equipment and maintenance</h2>
          <TierNote tier="Build" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <EquipmentForm
            labs={labs.map((lab) => ({ id: lab.id, label: `${lab.name} · ${lab.location}` }))}
          />
          <MaintenanceForm units={units} />
        </div>
      </section>

      <section id="utilisation" className="mb-8 scroll-mt-6">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-xl">Utilisation, next 7 days</h2>
          <TierNote tier="Build" />
        </div>
        <div className="mb-3 grid gap-3 sm:grid-cols-4">
          <Stat label="Utilisation" value={`${report.totals.utilisationPct}%`} />
          <Stat label="Booked hours" value={report.totals.bookedHours} />
          <Stat label="Idle assets" value={report.totals.idleAssets} />
          <Stat label="Peak hour" value={report.totals.peakHour ?? "—"} />
        </div>
        <Card className="p-4">
          <div className="overflow-x-auto">
            <table className="table">
              <caption className="sr-only">Utilisation per equipment item</caption>
              <thead>
                <tr>
                  <th scope="col">Equipment</th>
                  <th scope="col">Lab</th>
                  <th scope="col">Units</th>
                  <th scope="col">Booked</th>
                  <th scope="col">Capacity</th>
                  <th scope="col">Utilisation</th>
                  <th scope="col">Peak</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.equipmentId}>
                    <td>{row.name}</td>
                    <td>{row.labName}</td>
                    <td>{row.units}</td>
                    <td>{row.bookedHours} h</td>
                    <td>{row.capacityHours} h</td>
                    <td>
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{row.utilisationPct}%</span>
                        {row.idle ? <Badge tone="warning">Idle</Badge> : null}
                      </span>
                    </td>
                    <td>{row.peakHour ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report.byHour.length > 0 ? (
            <p className="mt-3 text-xs text-muted">
              Peak hours by demand:{" "}
              {report.byHour
                .slice(0, 4)
                .map((entry) => `${entry.hour} (${entry.hours} h)`)
                .join(" · ")}
            </p>
          ) : (
            <p className="mt-3 text-xs text-muted">No bookings in this window yet.</p>
          )}
        </Card>
      </section>

      <section id="people" className="mb-8 scroll-mt-6">
        <h2 className="mb-3 text-xl">People</h2>
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <FacultyGrantForm
            members={members
              .filter((member) => member.role === "student")
              .map((member) => ({ id: member.id, label: `${member.name} · ${member.email}` }))}
          />
          <Card className="p-4">
            <h2 className="text-lg">Members</h2>
            <table className="table mt-2">
              <caption className="sr-only">Campus members</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Role</th>
                  <th scope="col">Email</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id}>
                    <td>{member.name}</td>
                    <td className="capitalize">{member.role.replace("_", " ")}</td>
                    <td className="text-xs">{member.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </section>

      <section id="email" className="mb-8 scroll-mt-6">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-xl">Email log</h2>
          <Badge tone="muted">{logs.length} entries</Badge>
        </div>
        <Card className="p-4">
          {logs.length === 0 ? (
            <p className="text-sm text-muted">
              No email has been queued on this campus yet. Approvals and conflict changes create outbox
              rows; every attempt is recorded here with a status.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <caption className="sr-only">Email outbox</caption>
                <thead>
                  <tr>
                    <th scope="col">Queued</th>
                    <th scope="col">Recipient</th>
                    <th scope="col">Subject</th>
                    <th scope="col">Status</th>
                    <th scope="col">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((entry) => (
                    <tr key={entry.id}>
                      <td className="text-xs">{formatIst(entry.createdAt)}</td>
                      <td>
                        {entry.recipientName}
                        <span className="block text-xs text-muted">{entry.recipientEmail}</span>
                      </td>
                      <td>{entry.subject}</td>
                      <td>
                        <Badge
                          tone={
                            entry.status === "sent"
                              ? "success"
                              : entry.status === "failed"
                                ? "danger"
                                : entry.status === "skipped"
                                  ? "muted"
                                  : "warning"
                          }
                        >
                          {entry.status}
                        </Badge>
                      </td>
                      <td className="text-xs text-muted">{entry.error ?? entry.providerMessageId ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      <section id="audit" className="mb-8 scroll-mt-6">
        <h2 className="mb-3 text-xl">Audit log</h2>
        <Card className="p-4">
          <p className="mb-2 text-sm text-muted">
            Append-only: no role can update or delete an entry. Bookings, decisions, AI recommendations,
            overrides and the final choice are all recorded.
          </p>
          <div className="overflow-x-auto">
            <table className="table">
              <caption className="sr-only">Recent audit entries</caption>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Action</th>
                  <th scope="col">Entity</th>
                </tr>
              </thead>
              <tbody>
                {audits.map((entry) => (
                  <tr key={entry.id}>
                    <td className="text-xs">{formatIst(entry.createdAt)}</td>
                    <td>
                      {store.data.profiles.find((profile) => profile.id === entry.actorId)?.name ?? "System"}
                    </td>
                    <td className="font-mono text-xs">{entry.action}</td>
                    <td className="text-xs">
                      {entry.entity}
                      {entry.entityId ? ` · ${entry.entityId.slice(0, 12)}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <Card className="p-4">
        <h2 className="text-lg">Delivery status</h2>
        <p className="mt-1 text-sm text-muted">
          Built: tenancy, discovery, booking, requests, approvals, conflict solver with AI ranking and
          fallback, N4 explanations, utilisation, notifications and email outbox, audit and admin.
          Stretch 1-3: check-in and no-show release, smart substitution, waitlist. Specified but not
          built: project-to-plan, consent swaps, certification records, team projects, recurring
          bookings. Out: cross-campus access.
        </p>
        <p className="mt-2 text-xs text-muted">
          Window used for this report: {formatIstDate(report.from)} to {formatIstDate(report.to)}.{" "}
          <Link className="link" href="/conflicts">
            Open conflicts
          </Link>
          {" · "}
          <Link className="link" href="/approvals">
            Approvals
          </Link>
        </p>
      </Card>
    </div>
  );
}

