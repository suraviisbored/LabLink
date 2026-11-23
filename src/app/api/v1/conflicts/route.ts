import { ok, withApi } from "@/lib/api/handler";
import { requireRole } from "@/lib/auth/server";
import { getStore } from "@/lib/db/store";
import { detectOpenConflicts, listConflicts, storedOptions } from "@/lib/repo/conflicts";

export async function GET(): Promise<Response> {
  return withApi(async () => {
    const session = await requireRole("faculty", "campus_admin");
    const store = getStore();
    return ok({
      conflicts: detectOpenConflicts(store, session.campusId!),
      resolved: listConflicts(store, session.campusId!).filter(
        (conflict) => conflict.status === "resolved",
      ),
      options: listConflicts(store, session.campusId!).flatMap((conflict) =>
        storedOptions(store, conflict.id).map((option) => ({
          conflictId: conflict.id,
          optionId: option.id,
          rank: option.rank,
        })),
      ),
    });
  });
}
