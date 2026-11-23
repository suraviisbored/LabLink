import type { Store } from "@/lib/db/store";
import type { WaitlistEntry } from "@/lib/types";

export interface WaitlistView extends WaitlistEntry {
  equipmentName: string;
  position: number;
}

/** Waitlist reads (Stretch 3). Writes live in repo/bookings.ts. */
export function activeWaitlist(store: Store, campusId: string, userId: string): WaitlistView[] {
  const entries = store.data.waitlist
    .filter(
      (entry) =>
        entry.campusId === campusId && entry.userId === userId && entry.status === "waiting",
    )
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return entries.map((entry) => {
    const queue = store.data.waitlist
      .filter(
        (candidate) =>
          candidate.equipmentId === entry.equipmentId &&
          candidate.status === "waiting" &&
          candidate.desiredStart === entry.desiredStart,
      )
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return {
      ...entry,
      equipmentName:
        store.data.equipment.find((equipment) => equipment.id === entry.equipmentId)?.name ??
        "Equipment",
      position: queue.findIndex((candidate) => candidate.id === entry.id) + 1,
    };
  });
}
