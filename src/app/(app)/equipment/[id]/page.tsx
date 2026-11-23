import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftRight, MapPin, ShieldCheck, Wrench } from "lucide-react";
import { Badge, Card, FairnessBar, PageHeader, TierNote } from "@/components/ui";
import { BookingForm } from "@/components/forms-booking";
import { getSession } from "@/lib/auth/server";
import { loadStore } from "@/lib/db";
import {
  availabilityFor,
  equipmentUnits,
  getEquipment,
  labForEquipment,
  toEquipmentListItem,
} from "@/lib/repo/catalogue";
import { getSettings, weeklyUsageHours } from "@/lib/repo/bookings";
import { substitutesFor } from "@/lib/services/substitutes";
import { addDays, formatIst, nowIso } from "@/lib/time";
import { diffHours } from "@/lib/time";

export default async function EquipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.campusId) redirect("/admin/campuses");

  const { id } = await params;
  const store = await loadStore();
  const equipment = getEquipment(store, session.campusId, id);
  if (!equipment) notFound();

  const item = toEquipmentListItem(store, equipment);
  const lab = labForEquipment(store, equipment);
  const units = equipmentUnits(store, session.campusId, equipment.id);
  const settings = getSettings(store, session.campusId);
  const used = weeklyUsageHours(store, session.userId, nowIso());
  const quotaRemaining = Math.max(0, settings.weeklyHoursQuota - used);

  const availability = availabilityFor(store, equipment, nowIso(), addDays(nowIso(), 7), 60);
  const bookedHours = availability
    .flatMap((day) => day.slots)
    .reduce((sum, slot) => sum + (slot.totalUnits - slot.freeUnits), 0);

  const certified = store.data.userCertifications.some(
    (cert) =>
      cert.userId === session.userId &&
      cert.campusId === session.campusId &&
      (!cert.validUntil || new Date(cert.validUntil) > new Date()),
  );

  const canBook = equipment.status === "available" && units.length > 0 && (!equipment.requiresCertification || certified);
  const reasons: string[] = [];
  if (equipment.status !== "available") reasons.push("The equipment is not available right now.");
  if (equipment.requiresCertification && !certified)
    reasons.push("This equipment needs the Robot Arm Safety certification; a campus admin can record it.");
  if (units.length === 0) reasons.push("This equipment has no units.");

  const substitutes = await substitutesFor(session, equipment.id, {
    from: nowIso(),
    to: addDays(nowIso(), 2),
  });

  const maintenance = store.data.maintenance
    .filter((block) => units.some((unit) => unit.id === block.unitId))
    .filter((block) => new Date(block.endTime) > new Date())
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  return (
    <div>
      <Link className="btn btn-ghost mb-4 px-0" href="/equipment">
        <ArrowLeftRight aria-hidden="true" size={16} strokeWidth={1.75} />
        Back to catalogue
      </Link>

      <PageHeader
        eyebrow={`${item.departmentName} · ${item.labName}`}
        title={equipment.name}
        description={equipment.description}
        actions={
          <Badge tone={item.availableUnits > 0 ? "success" : "warning"}>
            {item.availableUnits} of {item.totalUnits} units available
          </Badge>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <BookingForm
            equipmentId={equipment.id}
            days={availability}
            quotaRemaining={Math.round(quotaRemaining * 10) / 10}
            canBook={canBook}
            reason={reasons.join(" ")}
          />

          <Card className="p-4">
            <h2 className="text-lg">Details</h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-widest text-muted">Lab</dt>
                <dd className="mt-1 flex items-center gap-1 text-sm">
                  <MapPin aria-hidden="true" size={14} strokeWidth={1.75} />
                  {lab.name} · {lab.location}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-widest text-muted">Opening hours</dt>
                <dd className="mt-1 text-sm">
                  {lab.availableFrom}-{lab.availableTo} ·{" "}
                  {lab.availableDays.map((day) => ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][day]).join(", ")}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-widest text-muted">Specifications</dt>
                <dd className="mt-1">
                  <table className="table">
                    <caption className="sr-only">Specifications for {equipment.name}</caption>
                    <tbody>
                      {Object.entries(equipment.specs).map(([key, value]) => (
                        <tr key={key}>
                          <th scope="row" className="w-1/2 normal-case tracking-normal">
                            {key}
                          </th>
                          <td>{value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </dd>
              </div>
            </dl>
            {equipment.requiresCertification ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-warning">
                <ShieldCheck aria-hidden="true" size={16} strokeWidth={1.75} />
                Certification required. Enforced inside the booking function, not only in this interface.
              </p>
            ) : null}
            <p className="mt-2 text-xs text-muted">
              {bookedHours} unit-hours already booked in the next 7 days.
            </p>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg">Substitutes</h2>
              <TierNote tier="Stretch 2" />
            </div>
            <p className="mt-1 text-sm text-muted">
              Equivalents matched on category, specs and campus, checked for availability in the next
              two days.
            </p>
            {substitutes.substitutes.length === 0 ? (
              <p className="mt-3 text-sm">
                No equivalent is available in that window.{" "}
                {substitutes.nextFreeWindow
                  ? `Next free window for this machine: ${formatIst(substitutes.nextFreeWindow)}.`
                  : "No free window in the next two weeks."}
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {substitutes.substitutes.map((match) => (
                  <li key={match.equipmentId} className="rounded-sm border border-line p-3">
                    <div className="flex items-start justify-between gap-2">
                      <Link className="link text-sm font-medium" href={`/equipment/${match.equipmentId}`}>
                        {match.name}
                      </Link>
                      <Badge tone="success">Available</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {match.labName} · match score {match.score}
                    </p>
                    <p className="mt-2 text-sm">{match.summary}</p>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-muted">Computed spec diff</summary>
                      <ul className="mt-1 space-y-1 text-xs">
                        {match.specDiff
                          .filter((diff) => diff.original !== diff.substitute)
                          .map((diff) => (
                            <li key={diff.key}>
                              <span className="font-medium">{diff.key}</span>: {diff.original ?? "not specified"} →{" "}
                              {diff.substitute ?? "not specified"}
                            </li>
                          ))}
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
            )}
            {substitutes.unavailable.length > 0 ? (
              <p className="mt-2 text-xs text-muted">
                Also similar but unavailable: {substitutes.unavailable.join(", ")}.
              </p>
            ) : null}
          </Card>

          <Card className="p-4">
            <h2 className="text-lg">Units</h2>
            <table className="table mt-2">
              <caption className="sr-only">Units of {equipment.name}</caption>
              <thead>
                <tr>
                  <th scope="col">Asset</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {units.map((unit) => (
                  <tr key={unit.id}>
                    <td className="font-mono text-xs">{unit.assetTag}</td>
                    <td>
                      <Badge tone={unit.status === "available" ? "success" : "warning"}>
                        {unit.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {maintenance.length > 0 ? (
              <div className="mt-3 border-t border-line pt-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Wrench aria-hidden="true" size={16} strokeWidth={1.75} />
                  Upcoming maintenance
                </p>
                <ul className="mt-1 space-y-1 text-xs text-muted">
                  {maintenance.slice(0, 3).map((block) => (
                    <li key={block.id}>
                      {formatIst(block.startTime)} - {formatIst(block.endTime)}: {block.reason || "Maintenance"}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="mt-3 text-xs text-muted">
              A booking holds one unit; the exclusion constraint makes a double booking impossible.
            </p>
          </Card>

          <Card className="p-4">
            <h2 className="text-lg">Your weekly quota</h2>
            <div className="mt-2">
              <FairnessBar
                value={Math.min(1, used / Math.max(1, settings.weeklyHoursQuota))}
                label={`${Math.round(used * 10) / 10} h of ${settings.weeklyHoursQuota} h used`}
              />
            </div>
            <p className="mt-2 text-xs text-muted">
              {diffHours(nowIso(), addDays(nowIso(), 7)) > 0
                ? "Quota resets at the start of the ISO week. Cancelling frees the hours immediately."
                : ""}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
