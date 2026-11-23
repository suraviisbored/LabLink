import type { SeedData } from "@/lib/seed";
import type {
  AccessRequest,
  AuditEntry,
  Blackout,
  Booking,
  Campus,
  CampusSettings,
  Certification,
  Conflict,
  ConflictOption,
  Department,
  EmailOutboxEntry,
  Equipment,
  EquipmentUnit,
  FairnessWeights,
  Lab,
  MaintenanceBlock,
  Notification,
  Profile,
  Project,
  Resolution,
  WaitlistEntry,
} from "@/lib/types";

/**
 * Domain <-> Postgres mapping for the Supabase adapter.
 *
 * The SQL migrations use snake_case and normalised columns (settings is a
 * key/value table, conflict options keep their strategy in a column); the
 * application uses camelCase objects. This module is the only place that knows
 * both, so repositories never see a column name.
 *
 * Rows are encoded to plain JSON-compatible objects so the flush can compare
 * them with `JSON.stringify`. Timestamps are normalised to ISO strings on both
 * sides, otherwise a round trip would look like a change every time.
 */

export type Row = Record<string, unknown>;

const iso = (value: unknown): string | null =>
  value == null ? null : new Date(String(value)).toISOString();
const text = (value: unknown): string => (value == null ? "" : String(value));
const num = (value: unknown): number => (typeof value === "number" ? value : Number(value ?? 0));
const strArray = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);
const numArray = (value: unknown): number[] => (Array.isArray(value) ? value.map(Number) : []);
const specs = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, String(entry)]),
  );
};
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

export interface TableSpec<T = unknown> {
  table: string;
  /** Upsert target; defaults to the primary key column. */
  conflict: string;
  /** Insert/write order (parents first). Deletes run in reverse. */
  phase: number;
  /** Read the table into the in-memory snapshot at all? */
  load: boolean;
  /** Rows to write, flattened from the snapshot (settings has 4 rows per campus). */
  list: (data: SeedData) => readonly T[];
  key: (row: T) => string;
  encode: (row: T) => Row;
  /** Delete predicate: the full primary key. */
  where: (row: T) => Row;
  decode: (raw: Row) => T;
  /** Which snapshot array the decoded row belongs to. */
  into: (data: SeedData) => unknown[];
}

function spec<T>(input: Omit<TableSpec<T>, "conflict"> & { conflict?: string }): TableSpec {
  return { conflict: "id", ...input } as TableSpec;
}

const SETTING_KEYS = [
  ["weekly_hours_quota", (settings: CampusSettings) => settings.weeklyHoursQuota],
  ["cancel_cutoff_hours", (settings: CampusSettings) => settings.cancelCutoffHours],
  ["grace_minutes", (settings: CampusSettings) => settings.graceMinutes],
  ["fairness_weights", (settings: CampusSettings) => settings.fairnessWeights],
] as const;

export interface SettingsRow {
  campusId: string;
  key: string;
  value: unknown;
}

export const TABLES: TableSpec[] = [
  spec<Campus>({
    table: "campuses",
    phase: 1,
    load: true,
    list: (data) => data.campuses,
    key: (row) => row.id,
    encode: (row) => ({
      id: row.id,
      name: row.name,
      timezone: row.timezone,
      allowed_email_domains: row.allowedEmailDomains,
      is_demo: row.isDemo,
      is_active: row.isActive,
    }),
    where: (row) => ({ id: row.id }),
    decode: (raw) => ({
      id: text(raw.id),
      name: text(raw.name),
      timezone: text(raw.timezone) || "Asia/Kolkata",
      allowedEmailDomains: strArray(raw.allowed_email_domains),
      isDemo: Boolean(raw.is_demo),
      isActive: raw.is_active === undefined ? true : Boolean(raw.is_active),
    }),
    into: (data) => data.campuses,
  }),

  spec<Department>({
    table: "departments",
    phase: 2,
    load: true,
    list: (data) => data.departments,
    key: (row) => row.id,
    encode: (row) => ({ id: row.id, campus_id: row.campusId, name: row.name }),
    where: (row) => ({ id: row.id }),
    decode: (raw) => ({
      id: text(raw.id),
      campusId: text(raw.campus_id),
      name: text(raw.name),
    }),
    into: (data) => data.departments,
  }),

  spec<Lab>({
    table: "labs",
    phase: 3,
    load: true,
    list: (data) => data.labs,
    key: (row) => row.id,
    encode: (row) => ({
      id: row.id,
      campus_id: row.campusId,
      department_id: row.departmentId,
      name: row.name,
      location: row.location,
      available_from: row.availableFrom,
      available_to: row.availableTo,
      available_days: row.availableDays,
    }),
    where: (row) => ({ id: row.id }),
    decode: (raw) => ({
      id: text(raw.id),
      campusId: text(raw.campus_id),
      departmentId: text(raw.department_id),
      name: text(raw.name),
      location: text(raw.location),
      availableFrom: text(raw.available_from).slice(0, 5),
      availableTo: text(raw.available_to).slice(0, 5),
      availableDays: numArray(raw.available_days),
    }),
    into: (data) => data.labs,
  }),

  spec<Equipment>({
    table: "equipment",
    phase: 4,
    load: true,
    list: (data) => data.equipment,
    key: (row) => row.id,
    encode: (row) => ({
      id: row.id,
      campus_id: row.campusId,
      lab_id: row.labId,
      name: row.name,
      category: row.category,
      description: row.description,
      specs_json: row.specs,
      tags: row.tags,
      requires_certification: row.requiresCertification,
      status: row.status,
    }),
    where: (row) => ({ id: row.id }),
    decode: (raw) => ({
      id: text(raw.id),
      campusId: text(raw.campus_id),
      labId: text(raw.lab_id),
      name: text(raw.name),
      category: text(raw.category),
      description: text(raw.description),
      specs: specs(raw.specs_json),
      tags: strArray(raw.tags),
      requiresCertification: Boolean(raw.requires_certification),
      status: (text(raw.status) || "available") as Equipment["status"],
    }),
    into: (data) => data.equipment,
  }),

  spec<EquipmentUnit>({
    table: "equipment_units",
    phase: 5,
    load: true,
    list: (data) => data.units,
    key: (row) => row.id,
    encode: (row) => ({
      id: row.id,
      campus_id: row.campusId,
      equipment_id: row.equipmentId,
      asset_tag: row.assetTag,
      status: row.status,
    }),
    where: (row) => ({ id: row.id }),
    decode: (raw) => ({
      id: text(raw.id),
      campusId: text(raw.campus_id),
      equipmentId: text(raw.equipment_id),
      assetTag: text(raw.asset_tag),
      status: (text(raw.status) || "available") as EquipmentUnit["status"],
    }),
    into: (data) => data.units,
  }),

  spec<Blackout>({
    table: "blackouts",
    phase: 6,
    load: true,
    list: (data) => data.blackouts,
    key: (row) => row.id,
    encode: (row) => ({
      id: row.id,
      campus_id: row.campusId,
      lab_id: row.labId,
      start_time: iso(row.startTime),
      end_time: iso(row.endTime),
      reason: row.reason,
    }),
    where: (row) => ({ id: row.id }),
    decode: (raw) => ({
      id: text(raw.id),
      campusId: text(raw.campus_id),
      labId: text(raw.lab_id),
      startTime: iso(raw.start_time) ?? "",
      endTime: iso(raw.end_time) ?? "",
      reason: text(raw.reason),
    }),
    into: (data) => data.blackouts,
  }),

  spec<MaintenanceBlock>({
    table: "maintenance_blocks",
    phase: 7,
    load: true,
    list: (data) => data.maintenance,
    key: (row) => row.id,
    encode: (row) => ({
      id: row.id,
      campus_id: row.campusId,
      unit_id: row.unitId,
      start_time: iso(row.startTime),
      end_time: iso(row.endTime),
      reason: row.reason,
    }),
    where: (row) => ({ id: row.id }),
    decode: (raw) => ({
      id: text(raw.id),
      campusId: text(raw.campus_id),
      unitId: text(raw.unit_id),
      startTime: iso(raw.start_time) ?? "",
      endTime: iso(raw.end_time) ?? "",
      reason: text(raw.reason),
    }),
    into: (data) => data.maintenance,
  }),

  spec<Certification>({
    table: "certifications",
    phase: 8,
    load: true,
    list: (data) => data.certifications,
    key: (row) => row.id,
    encode: (row) => ({ id: row.id, campus_id: row.campusId, name: row.name }),
    where: (row) => ({ id: row.id }),
    decode: (raw) => ({
      id: text(raw.id),
      campusId: text(raw.campus_id),
      name: text(raw.name),
    }),
    into: (data) => data.certifications,
  }),

  spec<Profile>({
    table: "profiles",
    phase: 9,
    load: true,
    list: (data) => data.profiles,
    key: (row) => row.id,
    encode: (row) => ({
      id: row.id,
      campus_id: row.campusId,
      name: row.name,
      email: row.email,
      role: row.role,
      department_id: row.departmentId,
      email_notifications: row.emailNotifications,
    }),
    where: (row) => ({ id: row.id }),
    decode: (raw) => ({
      id: text(raw.id),
      campusId: raw.campus_id == null ? null : text(raw.campus_id),
      name: text(raw.name),
      email: text(raw.email),
      role: (text(raw.role) || "student") as Profile["role"],
      departmentId: raw.department_id == null ? null : text(raw.department_id),
      emailNotifications: raw.email_notifications === undefined ? true : Boolean(raw.email_notifications),
    }),
    into: (data) => data.profiles,
  }),

  spec<SeedData["projectMembers"][number]>({
    table: "project_members",
    conflict: "project_id,user_id",
    phase: 11,
    load: true,
    list: (data) => data.projectMembers,
    key: (row) => `${row.projectId}:${row.userId}`,
    encode: (row) => ({
      project_id: row.projectId,
      user_id: row.userId,
      campus_id: row.campusId,
      role: row.role,
    }),
    where: (row) => ({ project_id: row.projectId, user_id: row.userId }),
    decode: (raw) => ({
      projectId: text(raw.project_id),
      userId: text(raw.user_id),
      campusId: text(raw.campus_id),
      role: text(raw.role) || "member",
    }),
    into: (data) => data.projectMembers,
  }),

  spec<Project>({
    table: "projects",
    phase: 10,
    load: true,
    list: (data) => data.projects,
    key: (row) => row.id,
    encode: (row) => ({
      id: row.id,
      campus_id: row.campusId,
      student_id: row.studentId,
      faculty_id: row.facultyId,
      title: row.title,
      description: row.description,
      deadline: iso(row.deadline),
      status: row.status,
      created_at: iso(row.createdAt),
    }),
    where: (row) => ({ id: row.id }),
    decode: (raw) => ({
      id: text(raw.id),
      campusId: text(raw.campus_id),
      studentId: text(raw.student_id),
      facultyId: raw.faculty_id == null ? null : text(raw.faculty_id),
      title: text(raw.title),
      description: text(raw.description),
      deadline: iso(raw.deadline) ?? "",
      status: (text(raw.status) || "active") as Project["status"],
      createdAt: iso(raw.created_at) ?? "",
    }),
    into: (data) => data.projects,
  }),

  spec<AccessRequest>({
    table: "access_requests",
    phase: 12,
    load: true,
    list: (data) => data.requests,
    key: (row) => row.id,
    encode: (row) => ({
      id: row.id,
      campus_id: row.campusId,
      project_id: row.projectId,
      equipment_id: row.equipmentId,
      hours_needed: row.hoursNeeded,
      window_start: iso(row.windowStart),
      window_end: iso(row.windowEnd),
      justification: row.justification,
      status: row.status,
      priority: row.priority,
      reviewed_by: row.reviewedBy,
      review_note: row.reviewNote,
      version: row.version,
      created_at: iso(row.createdAt),
    }),
    where: (row) => ({ id: row.id }),
    decode: (raw) => ({
      id: text(raw.id),
      campusId: text(raw.campus_id),
      projectId: text(raw.project_id),
      equipmentId: text(raw.equipment_id),
      hoursNeeded: num(raw.hours_needed),
      windowStart: iso(raw.window_start) ?? "",
      windowEnd: iso(raw.window_end) ?? "",
      justification: text(raw.justification),
      status: (text(raw.status) || "submitted") as AccessRequest["status"],
      priority: (text(raw.priority) || "normal") as AccessRequest["priority"],
      reviewedBy: raw.reviewed_by == null ? null : text(raw.reviewed_by),
      reviewNote: raw.review_note == null ? null : text(raw.review_note),
      version: num(raw.version) || 1,
      createdAt: iso(raw.created_at) ?? "",
    }),
    into: (data) => data.requests,
  }),

  spec<Booking>({
    table: "bookings",
    phase: 13,
    load: true,
    list: (data) => data.bookings,
    key: (row) => row.id,
    encode: (row) => ({
      id: row.id,
      campus_id: row.campusId,
      unit_id: row.unitId,
      user_id: row.userId,
      request_id: row.requestId,
      series_id: row.seriesId,
      start_time: iso(row.startTime),
      end_time: iso(row.endTime),
      status: row.status,
      checked_in_at: iso(row.checkedInAt),
      idempotency_key: row.idempotencyKey,
      version: row.version,
      created_at: iso(row.createdAt),
    }),
    where: (row) => ({ id: row.id }),
    decode: (raw) => ({
      id: text(raw.id),
      campusId: text(raw.campus_id),
      unitId: text(raw.unit_id),
      userId: text(raw.user_id),
      requestId: raw.request_id == null ? null : text(raw.request_id),
      seriesId: raw.series_id == null ? null : text(raw.series_id),
      startTime: iso(raw.start_time) ?? "",
      endTime: iso(raw.end_time) ?? "",
      status: (text(raw.status) || "confirmed") as Booking["status"],
      checkedInAt: iso(raw.checked_in_at),
      idempotencyKey: text(raw.idempotency_key),
      version: num(raw.version) || 1,
      createdAt: iso(raw.created_at) ?? "",
      // Bookings do not store equipment_id; load.ts backfills it from the unit.
      equipmentId: "",
    }),
    into: (data) => data.bookings,
  }),

  spec<Conflict>({
    table: "conflicts",
    phase: 14,
    load: true,
    list: (data) => data.conflicts,
    key: (row) => row.id,
    encode: (row) => ({
      id: row.id,
      campus_id: row.campusId,
      equipment_id: row.equipmentId,
      window_start: iso(row.windowStart),
      window_end: iso(row.windowEnd),
      request_ids: row.requestIds,
      status: row.status,
      version: row.version,
      created_at: iso(row.createdAt),
    }),
    where: (row) => ({ id: row.id }),
    decode: (raw) => ({
      id: text(raw.id),
      campusId: text(raw.campus_id),
      equipmentId: text(raw.equipment_id),
      windowStart: iso(raw.window_start) ?? "",
      windowEnd: iso(raw.window_end) ?? "",
      requestIds: strArray(raw.request_ids),
      status: (text(raw.status) || "open") as Conflict["status"],
      version: num(raw.version) || 1,
      createdAt: iso(raw.created_at) ?? "",
    }),
    into: (data) => data.conflicts,
  }),

  spec<ConflictOption>({
    table: "conflict_options",
    phase: 15,
    load: true,
    list: (data) => data.conflictOptions,
    key: (row) => row.id,
    encode: (row) => ({
      id: row.id,
      conflict_id: row.conflictId,
      campus_id: row.campusId,
      strategy: row.strategy,
      allocation_json: row.allocation,
      fairness_score: row.fairnessScore,
      explanation: row.explanation,
      tradeoffs: row.tradeoffs,
      rank: row.rank,
      source: row.source,
      unallocated_ids: row.unallocated,
      counterfactual_json: row.counterfactual ?? null,
    }),
    where: (row) => ({ id: row.id }),
    decode: (raw) => {
      const id = text(raw.id);
      // Strategy is stored in its own column; older rows carry it in the id.
      const strategy =
        text(raw.strategy) || (/^opt-.*-(.+)$/.exec(id)?.[1] ?? "fairness");
      return {
        id,
        conflictId: text(raw.conflict_id),
        campusId: text(raw.campus_id),
        strategy,
        allocation: (Array.isArray(raw.allocation_json)
          ? raw.allocation_json
          : []) as ConflictOption["allocation"],
        unallocated: strArray(raw.unallocated_ids ?? raw.unallocated),
        fairnessScore: num(raw.fairness_score),
        explanation: text(raw.explanation),
        tradeoffs: text(raw.tradeoffs),
        rank: num(raw.rank) || 1,
        source: (text(raw.source) || "solver") as ConflictOption["source"],
        counterfactual: (raw.counterfactual_json ?? null) as ConflictOption["counterfactual"],
      };
    },
    into: (data) => data.conflictOptions,
  }),

  spec<Resolution>({
    table: "resolutions",
    phase: 16,
    load: true,
    list: (data) => data.resolutions,
    key: (row) => row.id,
    encode: (row) => ({
      id: row.id,
      conflict_id: row.conflictId,
      // `campus_id` is NOT NULL in the table but carried by the resolver's
      // record at runtime; the domain type only keeps the conflict link.
      campus_id: (row as Resolution & { campusId?: string }).campusId ?? null,
      chosen_option_id: row.optionId,
      decided_by: row.decidedBy,
      override_note: row.overrideNote,
      decided_at: iso(row.decidedAt),
    }),
    where: (row) => ({ id: row.id }),
    decode: (raw) => ({
      id: text(raw.id),
      conflictId: text(raw.conflict_id),
      optionId: text(raw.chosen_option_id),
      decidedBy: text(raw.decided_by),
      overrideNote: raw.override_note == null ? null : text(raw.override_note),
      decidedAt: iso(raw.decided_at) ?? "",
    }),
    into: (data) => data.resolutions,
  }),

  spec<WaitlistEntry>({
    table: "waitlist",
    phase: 17,
    load: true,
    list: (data) => data.waitlist,
    key: (row) => row.id,
    encode: (row) => ({
      id: row.id,
      campus_id: row.campusId,
      equipment_id: row.equipmentId,
      user_id: row.userId,
      desired_start: iso(row.desiredStart),
      desired_end: iso(row.desiredEnd),
      status: row.status,
      created_at: iso(row.createdAt),
    }),
    where: (row) => ({ id: row.id }),
    decode: (raw) => ({
      id: text(raw.id),
      campusId: text(raw.campus_id),
      equipmentId: text(raw.equipment_id),
      userId: text(raw.user_id),
      desiredStart: iso(raw.desired_start) ?? "",
      desiredEnd: iso(raw.desired_end) ?? "",
      status: (text(raw.status) || "waiting") as WaitlistEntry["status"],
      createdAt: iso(raw.created_at) ?? "",
    }),
    into: (data) => data.waitlist,
  }),

  spec<Notification>({
    table: "notifications",
    phase: 18,
    load: true,
    list: (data) => data.notifications,
    key: (row) => row.id,
    encode: (row) => ({
      id: row.id,
      campus_id: row.campusId,
      user_id: row.userId,
      type: row.type,
      title: row.title,
      body: row.body,
      link: row.link,
      read: row.read,
      created_at: iso(row.createdAt),
    }),
    where: (row) => ({ id: row.id }),
    decode: (raw) => ({
      id: text(raw.id),
      campusId: text(raw.campus_id),
      userId: text(raw.user_id),
      type: text(raw.type),
      title: text(raw.title),
      body: text(raw.body),
      link: raw.link == null ? null : text(raw.link),
      read: Boolean(raw.read),
      createdAt: iso(raw.created_at) ?? "",
    }),
    into: (data) => data.notifications,
  }),

  spec<EmailOutboxEntry>({
    table: "email_outbox",
    phase: 19,
    load: true,
    list: (data) => data.emailOutbox,
    key: (row) => row.id,
    encode: (row) => ({
      id: row.id,
      campus_id: row.campusId,
      notification_id: row.notificationId,
      to_user_id: row.toUserId,
      subject: row.subject,
      status: row.status,
      provider_message_id: row.providerMessageId,
      error: row.error,
      attempts: row.attempts,
      created_at: iso(row.createdAt),
      sent_at: iso(row.sentAt),
    }),
    where: (row) => ({ id: row.id }),
    decode: (raw) => ({
      id: text(raw.id),
      campusId: text(raw.campus_id),
      notificationId: raw.notification_id == null ? null : text(raw.notification_id),
      toUserId: text(raw.to_user_id),
      subject: text(raw.subject),
      status: (text(raw.status) || "pending") as EmailOutboxEntry["status"],
      providerMessageId: raw.provider_message_id == null ? null : text(raw.provider_message_id),
      error: raw.error == null ? null : text(raw.error),
      attempts: num(raw.attempts),
      createdAt: iso(raw.created_at) ?? "",
      sentAt: iso(raw.sent_at),
    }),
    into: (data) => data.emailOutbox,
  }),

  spec<AuditEntry>({
    table: "audit_log",
    phase: 20,
    load: true,
    list: (data) => data.audit,
    key: (row) => row.id,
    encode: (row) => ({
      id: row.id,
      campus_id: row.campusId,
      actor_id: row.actorId,
      action: row.action,
      entity: row.entity,
      entity_id: row.entityId,
      metadata_json: row.metadata,
      created_at: iso(row.createdAt),
    }),
    where: (row) => ({ id: row.id }),
    decode: (raw) => ({
      id: text(raw.id),
      campusId: raw.campus_id == null ? null : text(raw.campus_id),
      actorId: raw.actor_id == null ? null : text(raw.actor_id),
      action: text(raw.action),
      entity: text(raw.entity),
      entityId: raw.entity_id == null ? null : text(raw.entity_id),
      metadata: record(raw.metadata_json),
      createdAt: iso(raw.created_at) ?? "",
    }),
    into: (data) => data.audit,
  }),

  spec<SeedData["fairnessLedger"][number]>({
    table: "fairness_ledger",
    phase: 21,
    load: true,
    list: (data) => data.fairnessLedger,
    key: (row) => row.id,
    encode: (row) => ({
      id: row.id,
      campus_id: row.campusId,
      user_id: row.userId,
      event: row.event,
      delta: row.delta,
      created_at: iso(row.createdAt),
    }),
    where: (row) => ({ id: row.id }),
    decode: (raw) => ({
      id: text(raw.id),
      campusId: text(raw.campus_id),
      userId: text(raw.user_id),
      event: text(raw.event),
      delta: num(raw.delta),
      createdAt: iso(raw.created_at) ?? "",
    }),
    into: (data) => data.fairnessLedger,
  }),

  spec<SeedData["userCertifications"][number]>({
    table: "user_certifications",
    conflict: "user_id,certification_id",
    phase: 22,
    load: true,
    list: (data) => data.userCertifications,
    key: (row) => `${row.userId}:${row.certificationId}`,
    encode: (row) => ({
      user_id: row.userId,
      certification_id: row.certificationId,
      campus_id: row.campusId,
      valid_until: iso(row.validUntil),
    }),
    where: (row) => ({ user_id: row.userId, certification_id: row.certificationId }),
    decode: (raw) => ({
      userId: text(raw.user_id),
      certificationId: text(raw.certification_id),
      campusId: text(raw.campus_id),
      validUntil: iso(raw.valid_until),
    }),
    into: (data) => data.userCertifications,
  }),

  /**
   * Settings are a key/value table but a single object in the domain, so one
   * campus writes four rows. Kept last: it has no foreign keys of its own.
   */
  spec<SettingsRow>({
    table: "settings",
    conflict: "campus_id,key",
    phase: 23,
    load: true,
    list: (data) =>
      data.settings.flatMap((settings) =>
        SETTING_KEYS.map(([key, pick]) => ({
          campusId: settings.campusId,
          key,
          value: pick(settings),
        })),
      ),
    key: (row) => `${row.campusId}:${row.key}`,
    encode: (row) => ({ campus_id: row.campusId, key: row.key, value: row.value }),
    where: (row) => ({ campus_id: row.campusId, key: row.key }),
    decode: (raw) => ({
      campusId: text(raw.campus_id),
      key: text(raw.key),
      value: raw.value,
    }),
    into: () => [],
  }),
];

/** Domains only populate part of the settings table, so they need a reducer. */
export function settingsFromRows(
  rows: SettingsRow[],
  defaults: FairnessWeights,
): CampusSettings[] {
  const byCampus = new Map<string, CampusSettings>();
  for (const row of rows) {
    const current =
      byCampus.get(row.campusId) ??
      ({
        campusId: row.campusId,
        weeklyHoursQuota: 10,
        cancelCutoffHours: 2,
        graceMinutes: 15,
        fairnessWeights: { ...defaults },
      } satisfies CampusSettings);

    if (row.key === "weekly_hours_quota") current.weeklyHoursQuota = num(row.value);
    else if (row.key === "cancel_cutoff_hours") current.cancelCutoffHours = num(row.value);
    else if (row.key === "grace_minutes") current.graceMinutes = num(row.value);
    else if (row.key === "fairness_weights" && row.value && typeof row.value === "object") {
      current.fairnessWeights = {
        ...current.fairnessWeights,
        ...(row.value as Partial<FairnessWeights>),
      };
    }

    byCampus.set(row.campusId, current);
  }
  return [...byCampus.values()];
}

/** `public.campus_email_domains`, loaded (never written: a trigger owns it). */
export const CAMPUS_DOMAINS_TABLE = "campus_email_domains";
