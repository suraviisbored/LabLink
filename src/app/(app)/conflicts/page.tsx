import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { getSession } from "@/lib/auth/server";
import { loadStore } from "@/lib/db";
import { detectOpenConflicts } from "@/lib/repo/conflicts";
import { formatIstRange } from "@/lib/time";

export default async function ConflictsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.campusId) redirect("/admin/campuses");
  if (session.role !== "faculty" && session.role !== "campus_admin") redirect("/equipment");

  const store = await loadStore();
  const open = detectOpenConflicts(store, session.campusId);

  return (
    <div>
      <PageHeader
        eyebrow={session.campusName}
        title="Allocation conflicts"
        description="Where approved demand exceeds the capacity of a window, the solver proposes feasible allocations and the AI ranks and explains them. A human decides."
      />

      {open.length === 0 ? (
        <EmptyState
          title="No open conflicts"
          description="Every approved request currently fits inside its window. A conflict appears when demand exceeds the units and hours available."
          action={{ href: "/equipment", label: "Browse equipment" }}
        />
      ) : (
        <ul className="space-y-4">
          {open.map((entry) => (
            <Card as="li" key={entry.conflict.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg">
                    <Link className="link" href={`/conflicts/${entry.conflict.id}`}>
                      {entry.equipmentName}
                    </Link>
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {formatIstRange(entry.conflict.windowStart, entry.conflict.windowEnd)} ·{" "}
                    {entry.conflict.requestIds.length} approved requests
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {entry.oversubscribed ? (
                    <Badge tone="warning" icon={TriangleAlert}>
                      Oversubscribed
                    </Badge>
                  ) : (
                    <Badge tone="success">Fits</Badge>
                  )}
                  <Badge tone={entry.options > 0 ? "info" : "muted"}>
                    {entry.options > 0 ? `${entry.options} options ready` : "Not recommended yet"}
                  </Badge>
                </div>
              </div>

              <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <dt className="text-xs uppercase tracking-widest text-muted">Demand</dt>
                  <dd className="text-lg font-semibold">{entry.demandHours} h</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-widest text-muted">Capacity in window</dt>
                  <dd className="text-lg font-semibold">{entry.capacityHours} h</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-widest text-muted">Status</dt>
                  <dd className="capitalize">{entry.conflict.status}</dd>
                </div>
              </dl>

              <div className="mt-3 border-t border-line pt-3">
                <Link className="btn btn-secondary btn-sm" href={`/conflicts/${entry.conflict.id}`}>
                  Open conflict
                  <ArrowRight aria-hidden="true" size={14} strokeWidth={1.75} />
                </Link>
              </div>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
