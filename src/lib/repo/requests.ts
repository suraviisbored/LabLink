import type { Store } from "@/lib/db/store";
import { ApiError } from "@/lib/errors";
import { requireEquipment } from "@/lib/repo/catalogue";
import type {
  AccessRequest,
  Priority,
  Project,
  RequestStatus,
  RequestWithContext,
  Role,
} from "@/lib/types";
import { nowIso } from "@/lib/time";

/** Projects and access requests (PRD FR-3 / FR-4). */

export interface CreateProjectInput {
  title: string;
  description: string;
  deadline: string;
  facultyId: string | null;
}

export function createProject(
  store: Store,
  campusId: string,
  studentId: string,
  input: CreateProjectInput,
): Project {
  if (new Date(input.deadline) <= new Date()) {
    throw new ApiError("VALIDATION_ERROR", "The deadline must be in the future.");
  }

  if (input.facultyId) {
    const faculty = store.data.profiles.find(
      (profile) =>
        profile.id === input.facultyId &&
        profile.campusId === campusId &&
        profile.role === "faculty",
    );
    if (!faculty) {
      throw new ApiError("VALIDATION_ERROR", "Choose a faculty guide from your campus.");
    }
  }

  const project: Project = {
    id: store.nextId("proj"),
    campusId,
    studentId,
    facultyId: input.facultyId,
    title: input.title.trim(),
    description: input.description.trim(),
    deadline: input.deadline,
    status: "active",
    createdAt: store.now(),
  };
  store.data.projects.push(project);
  return project;
}

export interface CreateRequestInput {
  projectId: string;
  equipmentId: string;
  hoursNeeded: number;
  windowStart: string;
  windowEnd: string;
  justification: string;
}

export function createAccessRequest(
  store: Store,
  campusId: string,
  studentId: string,
  input: CreateRequestInput,
): AccessRequest {
  const project = store.data.projects.find(
    (entry) => entry.id === input.projectId && entry.campusId === campusId,
  );
  if (!project) throw new ApiError("NOT_FOUND", "That project does not exist in your campus.");
  if (project.studentId !== studentId) {
    throw new ApiError("FORBIDDEN", "You can only request access for your own project.");
  }

  requireEquipment(store, campusId, input.equipmentId);

  if (new Date(input.windowEnd) <= new Date(input.windowStart)) {
    throw new ApiError("VALIDATION_ERROR", "The window must end after it starts.");
  }
  if (input.hoursNeeded <= 0) {
    throw new ApiError("VALIDATION_ERROR", "Hours needed must be greater than zero.");
  }

  const request: AccessRequest = {
    id: store.nextId("req"),
    campusId,
    projectId: project.id,
    equipmentId: input.equipmentId,
    hoursNeeded: Math.round(input.hoursNeeded * 100) / 100,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    justification: input.justification.trim(),
    status: "submitted",
    priority: "normal",
    reviewedBy: null,
    reviewNote: null,
    version: 1,
    createdAt: store.now(),
  };
  store.data.requests.push(request);
  return request;
}

export interface RequestFilters {
  status?: RequestStatus | "pending" | "all";
  facultyId?: string;
  studentId?: string;
  equipmentId?: string;
  limit?: number;
}

export function toRequestContext(store: Store, request: AccessRequest): RequestWithContext {
  const project = store.data.projects.find((entry) => entry.id === request.projectId);
  const equipment = store.data.equipment.find((entry) => entry.id === request.equipmentId);
  const student = project
    ? store.data.profiles.find((entry) => entry.id === project.studentId)
    : undefined;

  if (!project || !equipment) {
    throw new ApiError("NOT_FOUND", "That request references a missing project or equipment.");
  }

  return {
    request,
    project,
    equipment,
    studentName: student?.name ?? "Unknown student",
    studentId: project.studentId,
  };
}

export function listRequests(
  store: Store,
  campusId: string,
  filters: RequestFilters = {},
): RequestWithContext[] {
  const projects = store.data.projects.filter((project) => project.campusId === campusId);
  const projectIds = new Set(projects.map((project) => project.id));

  return store.data.requests
    .filter((request) => request.campusId === campusId && projectIds.has(request.projectId))
    .filter((request) => {
      if (filters.equipmentId && request.equipmentId !== filters.equipmentId) return false;
      if (filters.status && filters.status !== "all") {
        if (filters.status === "pending") {
          if (request.status !== "submitted" && request.status !== "under_review") return false;
        } else if (request.status !== filters.status) return false;
      }
      const project = projects.find((entry) => entry.id === request.projectId);
      if (filters.facultyId && project?.facultyId !== filters.facultyId) return false;
      if (filters.studentId && project?.studentId !== filters.studentId) return false;
      return true;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, filters.limit ?? 100)
    .map((request) => toRequestContext(store, request));
}

export function getRequest(
  store: Store,
  campusId: string,
  requestId: string,
): RequestWithContext | null {
  const request = store.data.requests.find(
    (entry) => entry.id === requestId && entry.campusId === campusId,
  );
  return request ? toRequestContext(store, request) : null;
}

export interface DecisionInput {
  requestId: string;
  campusId: string;
  actorId: string;
  actorRole: Role;
  decision: "approve" | "reject" | "modify";
  note?: string;
  priority?: Priority;
  hoursNeeded?: number;
  windowStart?: string;
  windowEnd?: string;
  /** Optimistic concurrency: the version the reviewer saw. */
  version?: number;
}

/** Faculty decision with an optimistic version check (STALE_STATE on a race). */
export function decideRequest(store: Store, input: DecisionInput): AccessRequest {
  const context = getRequest(store, input.campusId, input.requestId);
  if (!context) throw new ApiError("NOT_FOUND", "That request does not exist in your campus.");

  const isAdmin = input.actorRole === "campus_admin";
  const isGuide = context.project.facultyId === input.actorId;
  if (!isAdmin && !isGuide) {
    throw new ApiError("FORBIDDEN", "Only the faculty guide for this project can decide.");
  }

  if (input.version !== undefined && input.version !== context.request.version) {
    throw new ApiError("STALE_STATE", "Another reviewer already decided this request.", {
      currentVersion: context.request.version,
    });
  }

  if (["approved", "rejected"].includes(context.request.status)) {
    throw new ApiError("STALE_STATE", "This request has already been decided.");
  }

  const request = context.request;
  if (input.decision === "reject") {
    if (!input.note?.trim()) {
      throw new ApiError("VALIDATION_ERROR", "Add a short reason so the student knows what to change.");
    }
    request.status = "rejected";
    request.reviewNote = input.note.trim();
  } else if (input.decision === "modify") {
    if (!input.note?.trim() && !input.hoursNeeded && !input.windowStart && !input.windowEnd) {
      throw new ApiError("VALIDATION_ERROR", "Describe the change you are approving.");
    }
    if (input.hoursNeeded !== undefined) request.hoursNeeded = input.hoursNeeded;
    if (input.windowStart) request.windowStart = input.windowStart;
    if (input.windowEnd) request.windowEnd = input.windowEnd;
    request.status = "modified";
    request.reviewNote = input.note?.trim() ?? "Approved with changes.";
  } else {
    request.status = "approved";
    request.reviewNote = input.note?.trim() ?? "Approved.";
  }

  if (input.priority) request.priority = input.priority;
  request.reviewedBy = input.actorId;
  request.version += 1;
  return request;
}

export function pendingCountForFaculty(store: Store, campusId: string, facultyId: string): number {
  return listRequests(store, campusId, { facultyId, status: "pending" }).length;
}

export function facultyForCampus(store: Store, campusId: string) {
  return store.data.profiles.filter(
    (profile) => profile.campusId === campusId && profile.role === "faculty",
  );
}

export function projectForStudent(store: Store, campusId: string, studentId: string): Project[] {
  return store.data.projects
    .filter((project) => project.campusId === campusId && project.studentId === studentId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function addFacultyRole(store: Store, campusId: string, userId: string): void {
  const profile = store.data.profiles.find(
    (entry) => entry.id === userId && entry.campusId === campusId,
  );
  if (!profile) throw new ApiError("NOT_FOUND", "That user is not in your campus.");
  profile.role = "faculty";
}

export function timestamp(): string {
  return nowIso();
}
