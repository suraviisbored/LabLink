import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { DecisionForm } from "@/components/forms-requests";
import { getSession } from "@/lib/auth/server";
import { approvalQueue } from "@/lib/services/requests";
import { formatIstRange } from "@/lib/time";

export default async function ApprovalsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.campusId) redirect("/admin/campuses");
  if (session.role !== "faculty" && session.role !== "campus_admin") redirect("/equipment");

  const queue = approvalQueue(session);

  return (
    <div>
      <PageHeader
        eyebrow={session.campusName}
        title="Approval queue"
        description={
          session.role === "campus_admin"
            ? "Every pending request in your campus. Approvals carry a priority tier into allocation."
            : "Requests from projects you guide. Approvals carry a priority tier into allocation."
        }
        actions={
          <Badge tone="warning" icon={ClipboardCheck}>
            {queue.length} pending
          </Badge>
        }
      />

      {queue.length === 0 ? (
        <EmptyState
          title="Nothing waiting"
          description="When a student requests access for one of your projects, it appears here and you get a notification."
          action={{ href: "/equipment", label: "Browse the catalogue" }}
        />
      ) : (
        <ul className="space-y-4">
          {queue.map(({ request, project, equipment, studentName }) => (
            <Card as="li" key={request.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg">
                    <Link className="link" href={`/requests/${request.id}`}>
                      {equipment.name}
                    </Link>
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {studentName} · {project.title}
                  </p>
                </div>
                <StatusBadge status={request.status} />
              </div>

              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs uppercase tracking-widest text-muted">Window</dt>
                  <dd>{formatIstRange(request.windowStart, request.windowEnd)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-widest text-muted">Hours</dt>
                  <dd>{request.hoursNeeded} h</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-widest text-muted">Deadline</dt>
                  <dd>{formatIstRange(project.deadline, project.deadline)}</dd>
                </div>
              </dl>

              <p className="mt-3 text-sm">{request.justification}</p>

              <div className="mt-3">
                <Badge tone="muted">Version {request.version}</Badge>{" "}
                <span className="text-xs text-muted">
                  Decisions are version-checked, so two reviewers cannot both win.
                </span>
              </div>

              <DecisionForm requestId={request.id} version={request.version} />
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
