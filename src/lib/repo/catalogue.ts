import type { Store } from "@/lib/db/store";
import { ApiError } from "@/lib/errors";
import { availabilityGrid } from "@/lib/solver/slots";
import type {
  Blackout,
  Department,
  Equipment,
  EquipmentListItem,
  EquipmentUnit,
  Lab,
  MaintenanceBlock,
} from "@/lib/types";
import { addDays, nowIso, overlaps } from "@/lib/time";

/**
 * Catalogue reads and admin writes. Every query takes `campusId` and filters on
 * it first: the repository never returns another campus's rows, which is what
 * the tenant isolation tests assert.
 */

export interface EquipmentFilters {
  q?: string;
  departmentId?: string;
  category?: string;
  status?: string;
  labId?: string;
  tags?: string[];
  availableFrom?: string;
  availableTo?: string;
  limit?: number;
  offset?: number;
}

export interface EquipmentListResult {
  items: EquipmentListItem[];
  total: number;
  categories: string[];
  tags: string[];
  departments: Department[];
}

export function listDepartments(store: Store, campusId: string): Department[] {
  return store.data.departments
    .filter((department) => department.campusId === campusId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function listLabs(store: Store, campusId: string): Lab[] {
  return store.data.labs
    .filter((lab) => lab.campusId === campusId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function equipmentUnits(store: Store, campusId: string, equipmentId: string): EquipmentUnit[] {
  return store.data.units.filter(
    (unit) => unit.campusId === campusId && unit.equipmentId === equipmentId,
  );
}

export function getEquipment(store: Store, campusId: string, equipmentId: string): Equipment | null {
  return (
    store.data.equipment.find(
      (item) => item.id === equipmentId && item.campusId === campusId,
    ) ?? null
  );
}

export function requireEquipment(store: Store, campusId: string, equipmentId: string): Equipment {
  const equipment = getEquipment(store, campusId, equipmentId);
  if (!equipment) throw new ApiError("NOT_FOUND", "That equipment does not exist in your campus.");
  return equipment;
}

export function busyIntervals(
  store: Store,
  equipmentId: string,
): { unitId: string; start: string; end: string }[] {
  return store.data.bookings
    .filter(
      (booking) =>
        booking.equipmentId === equipmentId &&
        (booking.status === "confirmed" || booking.status === "checked_in"),
    )
    .map((booking) => ({
      unitId: booking.unitId,
      start: booking.startTime,
      end: booking.endTime,
    }));
}

export function maintenanceIntervals(
  store: Store,
  equipmentId: string,
): { unitId: string; start: string; end: string }[] {
  const unitIds = new Set(equipmentUnits(store, equipmentIdCampus(store, equipmentId), equipmentId).map((unit) => unit.id));
  return store.data.maintenance
    .filter((block) => unitIds.has(block.unitId))
    .map((block) => ({ unitId: block.unitId, start: block.startTime, end: block.endTime }));
}

function equipmentIdCampus(store: Store, equipmentId: string): string {
  return store.data.equipment.find((item) => item.id === equipmentId)?.campusId ?? "";
}

export function labForEquipment(store: Store, equipment: Equipment): Lab {
  const lab = store.data.labs.find((item) => item.id === equipment.labId);
  if (!lab) throw new ApiError("NOT_FOUND", "That equipment's lab is missing.");
  return lab;
}

export function blackoutsForLab(store: Store, labId: string): Blackout[] {
  return store.data.blackouts.filter((block) => block.labId === labId);
}

export function availabilityFor(
  store: Store,
  equipment: Equipment,
  from: string,
  to: string,
  slotMinutes = 60,
): { date: string; slots: { start: string; end: string; freeUnits: number; totalUnits: number }[] }[] {
  const lab = labForEquipment(store, equipment);
  const units = equipmentUnits(store, equipment.campusId, equipment.id).filter(
    (unit) => unit.status === "available",
  );
  return availabilityGrid({
    unitIds: units.map((unit) => unit.id),
    from,
    to,
    lab: {
      availableFrom: lab.availableFrom,
      availableTo: lab.availableTo,
      availableDays: lab.availableDays,
    },
    busy: busyIntervals(store, equipment.id),
    blackouts: blackoutsForLab(store, lab.id).map((block) => ({
      start: block.startTime,
      end: block.endTime,
    })),
    slotMinutes,
  });
}

export function nextAvailableFor(
  store: Store,
  equipment: Equipment,
  from: string = nowIso(),
): string | null {
  const grid = availabilityFor(store, equipment, from, addDays(from, 14), 60);
  for (const day of grid) {
    const slot = day.slots.find((entry) => entry.freeUnits > 0);
    if (slot) return slot.start;
  }
  return null;
}

export function toEquipmentListItem(store: Store, equipment: Equipment): EquipmentListItem {
  const lab = store.data.labs.find((item) => item.id === equipment.labId);
  const department = lab
    ? store.data.departments.find((item) => item.id === lab.departmentId)
    : undefined;
  const campus = store.data.campuses.find((item) => item.id === equipment.campusId);
  const units = equipmentUnits(store, equipment.campusId, equipment.id);
  const available = units.filter((unit) => unit.status === "available").length;

  return {
    equipment,
    labName: lab?.name ?? "Unknown lab",
    departmentName: department?.name ?? "Unassigned",
    campusName: campus?.name ?? "Unknown campus",
    totalUnits: units.length,
    availableUnits: available,
    nextAvailable: nextAvailableFor(store, equipment),
  };
}

export function listEquipment(
  store: Store,
  campusId: string,
  filters: EquipmentFilters = {},
): EquipmentListResult {
  const departments = listDepartments(store, campusId);
  const labs = listLabs(store, campusId);
  const labIds = new Set(labs.map((lab) => lab.id));

  const all = store.data.equipment.filter(
    (item) => item.campusId === campusId && labIds.has(item.labId),
  );

  const categories = [...new Set(all.map((item) => item.category))].sort();
  const tags = [...new Set(all.flatMap((item) => item.tags))].sort();

  const searchTerm = filters.q?.trim().toLowerCase();
  let filtered = all.filter((item) => {
    const lab = labs.find((entry) => entry.id === item.labId);
    if (filters.departmentId && lab?.departmentId !== filters.departmentId) return false;
    if (filters.labId && item.labId !== filters.labId) return false;
    if (filters.category && item.category !== filters.category) return false;
    if (filters.status && item.status !== filters.status) return false;
    if (filters.tags?.length && !filters.tags.some((tag) => item.tags.includes(tag))) return false;

    if (searchTerm) {
      const haystack = [
        item.name,
        item.category,
        item.description,
        ...item.tags,
        ...Object.entries(item.specs).map(([key, value]) => `${key} ${value}`),
        lab?.name ?? "",
      ]
        .join(" ")
        .toLowerCase();
      const words = searchTerm.split(/\s+/).filter(Boolean);
      if (!words.every((word) => haystack.includes(word))) return false;
    }
    return true;
  });

  if (filters.availableFrom && filters.availableTo) {
    filtered = filtered.filter((item) => {
      const units = equipmentUnits(store, campusId, item.id).filter(
        (unit) => unit.status === "available",
      );
      return units.some((unit) => {
        const blocked = store.data.bookings.some(
          (booking) =>
            booking.unitId === unit.id &&
            (booking.status === "confirmed" || booking.status === "checked_in") &&
            overlaps(booking.startTime, booking.endTime, filters.availableFrom!, filters.availableTo!),
        );
        const maintenance = store.data.maintenance.some(
          (block) =>
            block.unitId === unit.id &&
            overlaps(block.startTime, block.endTime, filters.availableFrom!, filters.availableTo!),
        );
        return !blocked && !maintenance;
      });
    });
  }

  filtered.sort((a, b) => a.name.localeCompare(b.name));

  const total = filtered.length;
  const offset = filters.offset ?? 0;
  const limit = Math.min(filters.limit ?? 24, 60);
  const page = filtered.slice(offset, offset + limit);

  return {
    items: page.map((item) => toEquipmentListItem(store, item)),
    total,
    categories,
    tags,
    departments,
  };
}

export function createEquipment(
  store: Store,
  campusId: string,
  input: {
    labId: string;
    name: string;
    category: string;
    description: string;
    specs: Record<string, string>;
    tags: string[];
    requiresCertification: boolean;
    units: number;
    assetPrefix?: string;
  },
): Equipment {
  const lab = store.data.labs.find((item) => item.id === input.labId && item.campusId === campusId);
  if (!lab) throw new ApiError("VALIDATION_ERROR", "Choose a lab in your campus.");

  const equipment: Equipment = {
    id: store.nextId("eq"),
    campusId,
    labId: input.labId,
    name: input.name,
    category: input.category,
    description: input.description,
    specs: input.specs,
    tags: input.tags,
    requiresCertification: input.requiresCertification,
    status: "available",
  };
  store.data.equipment.push(equipment);

  const prefix =
    input.assetPrefix?.trim() ||
    input.name
      .replace(/[^a-zA-Z0-9 ]/g, "")
      .split(/\s+/)
      .map((word) => word.slice(0, 3).toUpperCase())
      .slice(0, 2)
      .join("") ||
    "AST";

  for (let index = 0; index < Math.min(Math.max(input.units, 1), 30); index += 1) {
    store.data.units.push({
      id: store.nextId("unit"),
      campusId,
      equipmentId: equipment.id,
      assetTag: `${prefix}-${String(index + 1).padStart(2, "0")}`,
      status: "available",
    });
  }

  return equipment;
}

export function updateEquipment(
  store: Store,
  campusId: string,
  equipmentId: string,
  patch: Partial<Pick<Equipment, "name" | "description" | "category" | "status">>,
): Equipment {
  const equipment = requireEquipment(store, campusId, equipmentId);
  Object.assign(equipment, patch);
  return equipment;
}

export function setUnitStatus(
  store: Store,
  campusId: string,
  unitId: string,
  status: EquipmentUnit["status"],
): EquipmentUnit {
  const unit = store.data.units.find((entry) => entry.id === unitId && entry.campusId === campusId);
  if (!unit) throw new ApiError("NOT_FOUND", "That unit does not exist in your campus.");
  unit.status = status;
  return unit;
}

export function addMaintenance(
  store: Store,
  campusId: string,
  input: { unitId: string; startTime: string; endTime: string; reason: string },
): MaintenanceBlock {
  const unit = store.data.units.find(
    (entry) => entry.id === input.unitId && entry.campusId === campusId,
  );
  if (!unit) throw new ApiError("NOT_FOUND", "That unit does not exist in your campus.");
  if (new Date(input.endTime) <= new Date(input.startTime)) {
    throw new ApiError("VALIDATION_ERROR", "The maintenance block must end after it starts.");
  }
  const block: MaintenanceBlock = {
    id: store.nextId("maint"),
    campusId,
    unitId: input.unitId,
    startTime: input.startTime,
    endTime: input.endTime,
    reason: input.reason,
  };
  store.data.maintenance.push(block);
  return block;
}

export function addBlackout(
  store: Store,
  campusId: string,
  input: { labId: string; startTime: string; endTime: string; reason: string },
): Blackout {
  const lab = store.data.labs.find((entry) => entry.id === input.labId && entry.campusId === campusId);
  if (!lab) throw new ApiError("NOT_FOUND", "That lab does not exist in your campus.");
  const block: Blackout = {
    id: store.nextId("blackout"),
    campusId,
    labId: input.labId,
    startTime: input.startTime,
    endTime: input.endTime,
    reason: input.reason,
  };
  store.data.blackouts.push(block);
  return block;
}
