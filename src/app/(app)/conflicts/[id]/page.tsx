import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Info, Sparkles, TriangleAlert, Wrench } from "lucide-react";
import { Badge, Card, FairnessBar, PageHeader, Stat } from "@/components/ui";
import { RecommendButton, ResolveForm } from "@/components/forms-conflicts";
import { getSession } from "@/lib/auth/server";
import { loadStore } from "@/lib/db";
import { conflictSummary, getConflict, storedOptions } from "@/lib/repo/conflicts";
import { getRequest } from "@/lib/repo/requests";
import { formatIst, formatIstRange } from "@/lib/time";

export default async function ConflictDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.campusId) redirect("/admin/campuses");
  if (session.role !== "faculty" && session.role !== "campus_admin") redirect("/equipment");

  const { id } = await params;
  const store = await loadStore();

  let conflict;
  try {
    conflict = getConflict(store, session.campusId, id);
  } catch {
    notFound();
  }

  const summary = conflictSummary(store, conflict);
  const options = storedOptions(store, conflict.id);
  const resolution = store.data.resolutions.find((entry) => entry.conflictId === conflict.id);
  const resolved = conflict.status === "resolved";
  const aiRanked = options.some((option) => option.source === "ai");

  return (
    <div>
      <Link className="btn btn-ghost mb-4 px-0" href="/conflicts">
        Back to conflicts
      </Link>

      <PageHeader
        eyebrow={`${summary.conflict.requestIds.length} approved requests · ${formatIstRange(
          conflict.windowStart,
          conflict.windowEnd,
        )}`}
        title={summary.equipmentName}
        description="The solver owns every hard rule; the AI ranks and explains only the candidates it is given. Nothing is applied until a human confirms."
        actions={resolved ? <Badge tone="success">Resolved</Badge> : <RecommendButton conflictId={conflict.id} hasOptions={options.length > 0} />}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Demand" value={`${summary.demandHours} h`} hint="Sum of approved hours" />
        <Stat label="Capacity" value={`${summary.capacityHours} h`} hint="Free unit-hours in window" />
        <Stat label="Units available" value={summary.unitCount} hint="Excluding maintenance" />
        <Stat
          label="Oversubscribed by"
          value={`${Math.max(0, Math.round((summary.demandHours - summary.capacityHours) * 10) / 10)} h`}
          hint="Demand minus capacity"
        />
      </div>

      <Card className="mb-6 p-4">
        <h2 className="text-lg">Competing requests</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="table">
            <caption className="sr-only">Requests competing for this window</caption>
            <thead>
              <tr>
                <th scope="col">Student</th>
                <th scope="col">Project</th>
                <th scope="col">Hours</th>
                <th scope="col">Priority</th>
                <th scope="col">Deadline</th>
              </tr>
            </thead>
            <tbody>
              {summary.requests.map((context) => (
                <tr key={context.request.id}>
                  <td>{context.studentName}</td>
                  <td>{context.project.title}</td>
                  <td>{context.request.hoursNeeded} h</td>
                  <td className="capitalize">{context.request.priority}</td>
                  <td>{formatIst(context.project.deadline)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {resolved ? (
        <Card className="mb-6 border-success p-4">
          <h2 className="flex items-center gap-2 text-lg text-success">
            Allocation applied
          </h2>
          <p className="mt-1 text-sm">
            Applied {resolution ? formatIst(resolution.decidedAt) : ""} by{" "}
            {store.data.profiles.find((profile) => profile.id === resolution?.decidedBy)?.name ?? "staff"}.
            All allocations were re-validated against live data inside one transaction, and affected
            students were notified.
          </p>
          {resolution?.overrideNote ? (
            <p className="mt-2 text-sm text-muted">Override note: {resolution.overrideNote}</p>
          ) : null}
        </Card>
      ) : null}

      {options.length === 0 ? (
        <Card className="p-6">
          <h2 className="flex items-center gap-2 text-lg">
            <TriangleAlert aria-hidden="true" size={20} strokeWidth={1.75} />
            No recommendation yet
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Generate options to run the deterministic solver (alternate units, shifted slots, split
            hours) and have the AI rank them. If the model is unavailable, malformed, or suggests a
            candidate that fails validation, you still get the rule-based ranking with a visible banner.
          </p>
          <div className="mt-4">
            <RecommendButton conflictId={conflict.id} hasOptions={false} />
          </div>
        </Card>
      ) : (
        <section aria-labelledby="options-heading">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="options-heading" className="text-xl">
              Ranked options
            </h2>
            <div className="flex items-center gap-2">
              <Badge tone={aiRanked ? "info" : "warning"} icon={Sparkles}>
                {aiRanked ? "AI-ranked" : "Rule-based ranking"}
              </Badge>
              <span className="text-xs text-muted">
                {options.length} feasible option{options.length === 1 ? "" : "s"} ·{" "}
                {summary.conflict.requestIds.length} requests
              </span>
            </div>
          </div>

          {!aiRanked ? (
            <div className="mb-4 rounded-sm border border-warning bg-[#f4ecdd] p-3 text-sm text-warning">
              AI unavailable, showing rule-based result. Explanations are templated from the computed
              fairness scores.
            </div>
          ) : null}

          <ul className="space-y-4">
            {options.map((option) => (
              <Card as="li" key={option.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-muted">
                      Option {option.rank} · {option.strategy} order
                    </p>
                    <h3 className="mt-1 text-lg">{option.explanation}</h3>
                  </div>
                  <Badge tone={option.source === "ai" ? "info" : "warning"}>
                    {option.source === "ai" ? "AI-generated" : "Solver fallback"}
                  </Badge>
                </div>

                <div className="mt-3 max-w-sm">
                  <FairnessBar value={option.fairnessScore} />
                </div>

                <p className="mt-3 text-sm">{option.tradeoffs}</p>

                <div className="mt-3 overflow-x-auto">
                  <table className="table">
                    <caption className="sr-only">Allocations in option {option.rank}</caption>
                    <thead>
                      <tr>
                        <th scope="col">Student</th>
                        <th scope="col">Unit</th>
                        <th scope="col">Time</th>
                        <th scope="col">Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {option.allocation.map((allocation) => {
                        const context = getRequest(store, session.campusId!, allocation.requestId);
                        const unit = store.data.units.find((entry) => entry.id === allocation.unitId);
                        return (
                          <tr key={`${allocation.requestId}-${allocation.unitId}-${allocation.startTime}`}>
                            <td>
                              {context ? (
                                <Link className="link" href={`/requests/${allocation.requestId}`}>
                                  {context.studentName}
                                </Link>
                              ) : (
                                "Unknown"
                              )}
                            </td>
                            <td className="font-mono text-xs">{unit?.assetTag ?? allocation.unitId}</td>
                            <td>{formatIstRange(allocation.startTime, allocation.endTime)}</td>
                            <td>{allocation.hours} h</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {option.unallocated.length > 0 ? (
                  <div className="mt-3 rounded-sm border border-warning bg-[#f4ecdd] p-3 text-sm">
                    <p className="flex items-center gap-2 font-medium text-warning">
                      <TriangleAlert aria-hidden="true" size={16} strokeWidth={1.75} />
                      Not placed in this window
                    </p>
                    <ul className="mt-1 list-inside list-disc">
                      {option.unallocated.map((requestId) => {
                        const context = getRequest(store, session.campusId!, requestId);
                        return (
                          <li key={requestId}>
                            {context ? (
                              <Link className="link" href={`/requests/${requestId}`}>
                                {context.studentName} · {context.equipment.name}
                              </Link>
                            ) : (
                              requestId
                            )}{" "}
                            <span className="text-xs text-muted">
                              (see their counterfactual explanation)
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}

                {option.factors ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-muted">
                      Fairness factors behind this ranking
                    </summary>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      {Object.entries(option.factors).map(([requestId, factors]) => {
                        const context = getRequest(store, session.campusId!, requestId);
                        return (
                          <div key={requestId} className="rounded-sm border border-line p-3">
                            <p className="text-xs font-semibold">
                              {context?.studentName ?? requestId}
                            </p>
                            <ul className="mt-1 space-y-1 text-xs">
                              {factors.map((factor) => (
                                <li key={factor.key} className="flex justify-between gap-2">
                                  <span>
                                    {factor.label}{" "}
                                    <span className="text-muted">
                                      (weight {Math.round(factor.weight * 100)}%)
                                    </span>
                                  </span>
                                  <span className="font-medium">{Math.round(factor.score * 100)}%</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                ) : null}

                {!resolved ? (
                  <ResolveForm conflictId={conflict.id} optionId={option.id} rank={option.rank} />
                ) : null}
              </Card>
            ))}
          </ul>

          <p className="mt-4 flex items-start gap-2 text-xs text-muted">
            <Info aria-hidden="true" className="mt-0.5 shrink-0" size={14} strokeWidth={1.75} />
            Applying an option re-checks every allocation against live bookings and maintenance. If
            anything changed, the whole apply is rejected with a stale-state error and you must
            regenerate.
          </p>
        </section>
      )}

      <Card className="mt-6 p-4">
        <h2 className="flex items-center gap-2 text-base">
          <Wrench aria-hidden="true" size={16} strokeWidth={1.75} />
          How this window is constrained
        </h2>
        <p className="mt-1 text-sm text-muted">
          Capacity counts only available units, inside lab opening hours, minus maintenance blocks and
          blackouts. The solver never books a unit that is closed, under maintenance, or already held.
        </p>
      </Card>
    </div>
  );
}
