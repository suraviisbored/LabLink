/**
 * Domain types shared by the repositories, services, API and UI.
 *
 * Naming is camelCase here; the SQL migrations use snake_case. The Supabase
 * adapter is responsible for the mapping (see src/lib/supabase/).
 *
 * Every campus-owned entity carries `campusId`; repositories always scope
 * queries by it. That is the application half of the tenancy contract whose
 * other half is RLS (supabase/migrations/0002_rls_tenancy.sql).
 */

export type Role = "student" | "faculty" | "campus_admin" | "super_admin";

export type BookingStatus =
  | "confirmed"
  | "checked_in"
  | "completed"
  | "cancelled"
  | "no_show";

export type RequestStatus =
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "modified";

export type Priority = "low" | "normal" | "high";

export interface Campus {
  id: string;
  name: string;
  timezone: string;
  allowedEmailDomains: string[];
  isDemo: boolean;
  isActive: boolean;
}

export interface Profile {
  id: string;
  campusId: string | null;
  name: string;
  email: string;
  role: Role;
  departmentId: string | null;
  emailNotifications: boolean;
}

export interface Department {
  id: string;
  campusId: string;
  name: string;
}

export interface Lab {
  id: string;
  campusId: string;
  departmentId: string;
  name: string;
  location: string;
  /** "HH:MM" in the campus timezone. */
  availableFrom: string;
  availableTo: string;
  /** ISO weekday numbers, 1 = Monday. */
  availableDays: number[];
}

export interface Equipment {
  id: string;
  campusId: string;
  labId: string;
  name: string;
  category: string;
  description: string;
  specs: Record<string, string>;
  tags: string[];
  requiresCertification: boolean;
  status: "available" | "unavailable" | "retired";
}

export interface EquipmentUnit {
  id: string;
  campusId: string;
  equipmentId: string;
  assetTag: string;
  status: "available" | "maintenance" | "retired";
}

export interface MaintenanceBlock {
  id: string;
  campusId: string;
  unitId: string;
  startTime: string;
  endTime: string;
  reason: string;
}

export interface Blackout {
  id: string;
  campusId: string;
  labId: string;
  startTime: string;
  endTime: string;
  reason: string;
}

export interface Booking {
  id: string;
  campusId: string;
  unitId: string;
  equipmentId: string;
  userId: string;
  requestId: string | null;
  seriesId: string | null;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  checkedInAt: string | null;
  idempotencyKey: string;
  version: number;
  createdAt: string;
}

export interface Project {
  id: string;
  campusId: string;
  studentId: string;
  facultyId: string | null;
  title: string;
  description: string;
  deadline: string;
  status: "active" | "completed" | "archived";
  createdAt: string;
}

export interface AccessRequest {
  id: string;
  campusId: string;
  projectId: string;
  equipmentId: string;
  hoursNeeded: number;
  windowStart: string;
  windowEnd: string;
  justification: string;
  status: RequestStatus;
  priority: Priority;
  reviewedBy: string | null;
  reviewNote: string | null;
  version: number;
  createdAt: string;
}

export interface Conflict {
  id: string;
  campusId: string;
  equipmentId: string;
  windowStart: string;
  windowEnd: string;
  requestIds: string[];
  status: "open" | "recommended" | "resolved";
  version: number;
  createdAt: string;
}

/** One request's slice of a candidate allocation. */
export interface Allocation {
  requestId: string;
  unitId: string;
  startTime: string;
  endTime: string;
  hours: number;
}

export interface FairnessFactor {
  key: "deadline" | "priority" | "recentUsage" | "hoursEfficiency" | "reliability";
  label: string;
  /** Configured weight, 0..1. */
  weight: number;
  /** Normalised contribution, 0..1. */
  score: number;
}

export interface ConflictOption {
  id: string;
  conflictId: string;
  /** Solver strategy that produced this allocation (fairness, deadline, ...). */
  strategy: string;
  campusId: string;
  allocation: Allocation[];
  unallocated: string[];
  fairnessScore: number;
  explanation: string;
  tradeoffs: string;
  rank: number;
  source: "solver" | "ai";
  counterfactual?: Counterfactual | null;
  /** Per-request fairness breakdown, used by N4 and the UI fairness bar. */
  factors?: Record<string, FairnessFactor[]>;
}

export interface Counterfactual {
  requestId: string;
  /** The single smallest change that flips the outcome. */
  change: {
    kind: "deadline" | "hours" | "windowStart" | "priority";
    label: string;
    from: string;
    to: string;
    /** Machine-readable value, so the reported change can be re-applied. */
    value: string | number;
  };
  factors: FairnessFactor[];
  wouldWin: boolean;
}

export interface Resolution {
  id: string;
  conflictId: string;
  optionId: string;
  decidedBy: string;
  overrideNote: string | null;
  decidedAt: string;
}

export interface Notification {
  id: string;
  campusId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export type EmailStatus = "pending" | "sent" | "failed" | "skipped";

export interface EmailOutboxEntry {
  id: string;
  campusId: string;
  notificationId: string | null;
  toUserId: string;
  subject: string;
  status: EmailStatus;
  providerMessageId: string | null;
  error: string | null;
  attempts: number;
  createdAt: string;
  sentAt: string | null;
}

export interface AuditEntry {
  id: string;
  campusId: string | null;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface FairnessWeights {
  deadline: number;
  priority: number;
  recentUsage: number;
  hoursEfficiency: number;
  reliability: number;
}

export interface CampusSettings {
  campusId: string;
  weeklyHoursQuota: number;
  cancelCutoffHours: number;
  graceMinutes: number;
  fairnessWeights: FairnessWeights;
}

export interface WaitlistEntry {
  id: string;
  campusId: string;
  equipmentId: string;
  userId: string;
  desiredStart: string;
  desiredEnd: string;
  status: "waiting" | "promoted" | "cancelled";
  createdAt: string;
}

export interface Certification {
  id: string;
  campusId: string;
  name: string;
}

export interface UserCertification {
  userId: string;
  certificationId: string;
  campusId: string;
  validUntil: string | null;
}

export interface PlanDraft {
  id: string;
  campusId: string;
  userId: string;
  input: Record<string, unknown>;
  plan: Record<string, unknown>;
  createdAt: string;
}

export interface RequestWithContext {
  request: AccessRequest;
  project: Project;
  equipment: Equipment;
  studentName: string;
  studentId: string;
}

export interface EquipmentListItem {
  equipment: Equipment;
  labName: string;
  departmentName: string;
  campusName: string;
  totalUnits: number;
  availableUnits: number;
  nextAvailable: string | null;
}
