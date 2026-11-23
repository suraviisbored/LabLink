import { getStore } from "@/lib/db/store";
import { flushEmails } from "@/lib/email";
import { ApiError } from "@/lib/errors";
import { audit } from "@/lib/repo/admin";
import {
  createAccessRequest,
  createProject,
  decideRequest,
  getRequest,
  listRequests,
  toRequestContext,
} from "@/lib/repo/requests";
import { notify } from "@/lib/repo/notifications";
import { requireEquipment } from "@/lib/repo/catalogue";
import type { Session } from "@/lib/auth/session";
import type { AccessRequest, Priority, RequestWithContext } from "@/lib/types";
import { formatIstRange } from "@/lib/time";

/** Project + access-request service (PRD FR-3, FR-4, FR-9). */

export async function submitRequest(
  session: Session,
  input: {
    projectId?: string;
    newProject?: {
      title: string;
      description: string;
      deadline: string;
      facultyId: string | null;
    };
    equipmentId: string;
    hoursNeeded: number;
    windowStart: string;
    windowEnd: string;
    justification: string;
  },
): Promise<{ request: AccessRequest; projectId: string }> {
  if (!session.campusId) throw new ApiError("FORBIDDEN", "A campus account is required.");
  const store = getStore();

  let projectId = input.projectId;
  let facultyId: string | null = null;

  if (!projectId) {
    if (!input.newProject) {
      throw new ApiError("VALIDATION_ERROR", "Choose a project or describe a new one.");
    }
    const project = createProject(store, session.campusId, session.userId, input.newProject);
    projectId = project.id;
    facultyId = project.facultyId;
  } else {
    const project = store.data.projects.find(
      (entry) => entry.id === projectId && entry.campusId === session.campusId,
    );
    if (!project) throw new ApiError("NOT_FOUND", "That project does not exist.");
    if (project.studentId !== session.userId) {
      throw new ApiError("FORBIDDEN", "You can only request access for your own project.");
    }
    facultyId = project.facultyId;
  }

  const request = createAccessRequest(store, session.campusId, session.userId, {
    projectId,
    equipmentId: input.equipmentId,
    hoursNeeded: input.hoursNeeded,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    justification: input.justification,
  });

  const context = toRequestContext(store, request);
  const equipmentName = requireEquipment(store, session.campusId, input.equipmentId).name;

  if (facultyId) {
    notify(store, {
      campusId: session.campusId,
      userId: facultyId,
      type: "request_submitted",
      title: "New access request",
      body: `${session.name} requested ${equipmentName} for ${formatIstRange(input.windowStart, input.windowEnd)} (${input.hoursNeeded} h).`,
      link: "/approvals",
      email: true,
    });
  }

  audit(store, {
    campusId: session.campusId,
    actorId: session.userId,
    action: "request.submitted",
    entity: "access_requests",
    entityId: request.id,
    metadata: { projectId, equipmentId: input.equipmentId, hours: input.hoursNeeded },
  });

  await flushEmails(store);
  return { request, projectId: context.project.id };
}

export async function decide(
  session: Session,
  input: {
    requestId: string;
    decision: "approve" | "reject" | "modify";
    note?: string;
    priority?: Priority;
    hoursNeeded?: number;
    windowStart?: string;
    windowEnd?: string;
    version?: number;
  },
): Promise<RequestWithContext> {
  if (!session.campusId) throw new ApiError("FORBIDDEN", "A campus account is required.");
  const store = getStore();

  const request = decideRequest(store, {
    requestId: input.requestId,
    campusId: session.campusId,
    actorId: session.userId,
    actorRole: session.role,
    decision: input.decision,
    note: input.note,
    priority: input.priority,
    hoursNeeded: input.hoursNeeded,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    version: input.version,
  });

  const context = toRequestContext(store, request);
  const label =
    request.status === "approved"
      ? "approved"
      : request.status === "rejected"
        ? "rejected"
        : "approved with changes";

  notify(store, {
    campusId: session.campusId,
    userId: context.studentId,
    type: "request_decided",
    title: `Request ${label}`,
    body: `${context.equipment.name}: ${request.reviewNote ?? "See the request for details."}`,
    link: `/requests/${request.id}`,
    email: true,
  });

  audit(store, {
    campusId: session.campusId,
    actorId: session.userId,
    action: `request.${request.status}`,
    entity: "access_requests",
    entityId: request.id,
    metadata: {
      decision: input.decision,
      priority: request.priority,
      note: request.reviewNote,
      version: request.version,
    },
  });

  await flushEmails(store);
  return context;
}

export function myRequests(session: Session): RequestWithContext[] {
  if (!session.campusId) return [];
  return listRequests(getStore(), session.campusId, {
    studentId: session.userId,
    status: "all",
  });
}

export function approvalQueue(session: Session): RequestWithContext[] {
  if (!session.campusId) return [];
  return listRequests(getStore(), session.campusId, {
    facultyId: session.role === "campus_admin" ? undefined : session.userId,
    status: "pending",
  });
}

export function requestById(session: Session, requestId: string): RequestWithContext | null {
  if (!session.campusId) return null;
  return getRequest(getStore(), session.campusId, requestId);
}

/** Owner, the project's faculty guide, or a campus admin may read a request. */
export function canReadRequest(session: Session, context: RequestWithContext): boolean {
  if (session.role === "campus_admin") return true;
  if (context.project.studentId === session.userId) return true;
  return context.project.facultyId === session.userId;
}
