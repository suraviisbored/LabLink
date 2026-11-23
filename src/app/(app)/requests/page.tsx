import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { RequestForm } from "@/components/forms-requests";
import { getSession } from "@/lib/auth/server";
import { loadStore } from "@/lib/db";
import { listEquipment } from "@/lib/repo/catalogue";
import { facultyForCampus, projectForStudent } from "@/lib/repo/requests";
import { formatIstRange } from "@/lib/time";

export default async function RequestsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.campusId) redirect("/admin/campuses");
  if (session.role !== "student") redirect("/approvals");

  const store = await loadStore();
  const equipment = listEquipment(store, session.campusId, { limit: 60 }).items;
  const projects = projectForStudent(store, session.campusId, session.userId);
  const faculty = facultyForCampus(store, session.campusId);

  const myRequests = store.data.requests
    .filter(
      (request) =>
        request.campusId === session.campusId &&
        projects.some((project) => project.id === request.projectId),
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div>
      <PageHeader
        eyebrow={session.campusName}
        title="Project access requests"
        description="Request equipment for a project. Your faculty guide approves, rejects with a reason, or approves with changes."
      />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <RequestForm
          equipment={equipment.map((item) => ({
            id: item.equipment.id,
            label: `${item.equipment.name} · ${item.labName}`,
          }))}
          projects={projects.map((project) => ({
            id: project.id,
            label: project.title,
          }))}
          faculty={faculty.map((entry) => ({ id: entry.id, label: entry.name }))}
        />

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-xl">
            <ClipboardCheck aria-hidden="true" size={20} strokeWidth={1.75} />
            My requests
          </h2>
          {myRequests.length === 0 ? (
            <EmptyState
              title="No requests yet"
              description="Describe your project and the equipment you need. Your guide is notified right away."
            />
          ) : (
            <ul className="space-y-3">
              {myRequests.map((request) => {
                const equipmentName =
                  store.data.equipment.find((item) => item.id === request.equipmentId)?.name ??
                  "Equipment";
                const project = projects.find((entry) => entry.id === request.projectId);
                return (
                  <Card as="li" key={request.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base">
                          <Link className="link" href={`/requests/${request.id}`}>
                            {equipmentName}
                          </Link>
                        </h3>
                        <p className="mt-1 text-xs text-muted">
                          {project?.title} · {formatIstRange(request.windowStart, request.windowEnd)} ·{" "}
                          {request.hoursNeeded} h
                        </p>
                      </div>
                      <StatusBadge status={request.status} />
                    </div>
                    {request.reviewNote ? (
                      <p className="mt-2 text-sm text-muted">“{request.reviewNote}”</p>
                    ) : null}
                  </Card>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
