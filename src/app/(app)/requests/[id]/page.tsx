import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Info, Sparkles } from "lucide-react";
import { Badge, Card, PageHeader, StatusBadge } from "@/components/ui";
import { getSession } from "@/lib/auth/server";
import { loadStore } from "@/lib/db";
import { getRequest } from "@/lib/repo/requests";
import { explanation } from "@/lib/services/conflicts";
import { formatIst, formatIstRange } from "@/lib/time";

const STEPS = ["Submitted", "Under review", "Decision"] as const;

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.campusId) redirect("/admin/campuses");

  const { id } = await params;
  const store = await loadStore();
  const context = getRequest(store, session.campusId, id);
  if (!context) notFound();

  const isOwner = context.project.studentId === session.userId;
  const isGuide = context.project.facultyId === session.userId;
  if (!isOwner && !isGuide && session.role !== "campus_admin") notFound();

  const detail = await explanation(session, id);
  const stepIndex =
    context.request.status === "submitted"
      ? 0
      : context.request.status === "under_review"
        ? 1
        : 2;

  const bookings = store.data.bookings.filter(
    (booking) => booking.requestId === id && booking.status !== "cancelled",
  );

  return (
    <div>
      <Link className="btn btn-ghost mb-4 px-0" href={isOwner ? "/requests" : "/approvals"}>
        Back
      </Link>

      <PageHeader
        eyebrow={`${context.project.title} · ${context.studentName}`}
        title={context.equipment.name}
        description={context.request.justification}
        actions={<StatusBadge status={context.request.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-6">
          <Card className="p-4">
            <h2 className="text-lg">Request</h2>
            <ol className="mt-3 flex gap-2 text-xs">
              {STEPS.map((step, index) => (
                <li key={step} className="flex-1">
                  <span
                    className={`block h-1 rounded-sm ${index <= stepIndex ? "bg-ink" : "bg-[#d9cec6]"}`}
                    aria-hidden="true"
                  />
                  <span className={`mt-1 block ${index <= stepIndex ? "font-semibold" : "text-muted"}`}>
                    {step}
                    {index === stepIndex ? <span className="sr-only"> (current)</span> : null}
                  </span>
                </li>
              ))}
            </ol>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-widest text-muted">Window</dt>
                <dd className="text-sm">{formatIstRange(context.request.windowStart, context.request.windowEnd)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-widest text-muted">Hours needed</dt>
                <dd className="text-sm">{context.request.hoursNeeded} h</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-widest text-muted">Priority tier</dt>
                <dd className="text-sm capitalize">{context.request.priority}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-widest text-muted">Project deadline</dt>
                <dd className="text-sm">{formatIst(context.project.deadline)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-widest text-muted">Review note</dt>
                <dd className="text-sm">{context.request.reviewNote ?? "No note yet."}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-widest text-muted">Bookings from this request</dt>
                <dd className="text-sm">
                  {bookings.length === 0
                    ? "None yet."
                    : bookings
                        .map((booking) => formatIstRange(booking.startTime, booking.endTime))
                        .join("; ")}
                </dd>
              </div>
            </dl>
          </Card>

          {isGuide && context.request.status !== "approved" && context.request.status !== "rejected" ? (
            <Card className="p-4">
              <h2 className="text-lg">Decide</h2>
              <p className="mt-1 text-sm text-muted">
                Go to the approvals queue to approve, modify or reject with a note.
              </p>
              <Link className="btn btn-primary mt-3" href="/approvals">
                Open approvals
              </Link>
            </Card>
          ) : null}
        </div>

        <Card className="p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-lg">Why this outcome?</h2>
            <Badge tone="info" icon={Sparkles}>
              Explained
            </Badge>
          </div>

          <p className="mt-2 text-sm">{detail?.narrative}</p>

          {detail?.counterfactual ? (
            <div className="mt-4 rounded-sm border border-line bg-[#eae2dc] p-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">
                Smallest change that flips it
              </p>
              <p className="mt-1 text-sm font-medium">{detail.counterfactual.change.label}</p>
              <p className="text-sm">
                {detail.counterfactual.change.from} → {detail.counterfactual.change.to}
              </p>
              <p className="mt-2 text-xs text-muted">
                Computed by re-running the solver with perturbed inputs; the AI only rephrases it.
                {detail.counterfactual.wouldWin ? " Applying it flips the outcome." : " No single small change flips it."}
              </p>
            </div>
          ) : null}

          {detail?.factors.length ? (
            <div className="mt-4">
              <h3 className="text-sm font-semibold">Top contributing factors</h3>
              <ul className="mt-2 space-y-2">
                {detail.factors.map((factor) => (
                  <li key={factor.label}>
                    <div className="flex items-center justify-between text-xs">
                      <span>
                        {factor.label} <span className="text-muted">· weight {Math.round(factor.weight * 100)}%</span>
                      </span>
                      <span className="font-medium">{Math.round(factor.score * 100)}%</span>
                    </div>
                    <div
                      className="mt-1 h-1.5 w-full overflow-hidden rounded-sm bg-[#e7dfd8]"
                      role="img"
                      aria-label={`${factor.label}: score ${Math.round(factor.score * 100)} percent, weight ${Math.round(factor.weight * 100)} percent`}
                    >
                      <div className="h-full bg-ink" style={{ width: `${Math.round(factor.score * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="mt-4 flex items-start gap-2 text-xs text-muted">
            <Info aria-hidden="true" className="mt-0.5 shrink-0" size={14} strokeWidth={1.75} />
            No other student is identified here: the explanation only reports your own
            request&apos;s factors and the computed change.
          </p>
        </Card>
      </div>
    </div>
  );
}
