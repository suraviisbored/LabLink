import type { SeedData } from "@/lib/seed";
import type { FairnessWeights } from "@/lib/types";
import type { DatabaseClient } from "@/lib/db/pg/client";
import {
  CAMPUS_DOMAINS_TABLE,
  TABLES,
  settingsFromRows,
  type Row,
  type SettingsRow,
} from "@/lib/db/pg/schema";

/** A snapshot load: every table the repositories read, mapped to the domain. */

export const DEFAULT_WEIGHTS: FairnessWeights = {
  deadline: 0.35,
  priority: 0.25,
  recentUsage: 0.2,
  hoursEfficiency: 0.1,
  reliability: 0.1,
};

export function emptySeedData(): SeedData {
  return {
    campuses: [],
    campusDomains: [],
    departments: [],
    labs: [],
    blackouts: [],
    equipment: [],
    units: [],
    maintenance: [],
    profiles: [],
    projects: [],
    projectMembers: [],
    requests: [],
    bookings: [],
    conflicts: [],
    notifications: [],
    emailOutbox: [],
    audit: [],
    conflictOptions: [],
    resolutions: [],
    settings: [],
    waitlist: [],
    certifications: [],
    userCertifications: [],
    fairnessLedger: [],
  };
}

const PAGE = 1000;

async function readAll(client: DatabaseClient, table: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client.from(table).select("*").range(from, from + PAGE - 1);
    if (error) {
      throw new Error(`Reading ${table} failed: ${error.message ?? "unknown error"} (${error.code ?? "?"})`);
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

export async function loadSnapshot(client: DatabaseClient): Promise<SeedData> {
  const data = emptySeedData();
  const settingsRows: SettingsRow[] = [];

  for (const table of TABLES) {
    if (!table.load) continue;
    const rows = await readAll(client, table.table);

    if (table.table === "settings") {
      settingsRows.push(...(rows.map((row) => table.decode(row)) as SettingsRow[]));
      continue;
    }

    for (const raw of rows) {
      table.into(data).push(table.decode(raw) as never);
    }
  }

  // A booking belongs to a unit, and the unit says which equipment it is.
  const unitEquipment = new Map(data.units.map((unit) => [unit.id, unit.equipmentId]));
  for (const booking of data.bookings) {
    booking.equipmentId = unitEquipment.get(booking.unitId) ?? "";
  }

  data.settings = settingsFromRows(settingsRows, DEFAULT_WEIGHTS);

  const domainRows = await readAll(client, CAMPUS_DOMAINS_TABLE);
  data.campusDomains = domainRows.map((row) => ({
    domain: String(row.domain),
    campusId: String(row.campus_id),
  }));

  return data;
}
