import { getStore } from "@/lib/db/store";
import { parseSearchQuery, type ParsedFilter } from "@/lib/ai";
import { listEquipment, type EquipmentListResult } from "@/lib/repo/catalogue";
import type { Session } from "@/lib/auth/session";

/**
 * FR-1 discovery. The AI converts language into a filter; the database returns
 * the equipment. The model never chooses results.
 */
export async function searchEquipment(
  session: Session,
  params: {
    q?: string;
    departmentId?: string;
    category?: string;
    status?: string;
    labId?: string;
    availableFrom?: string;
    availableTo?: string;
    offset?: number;
    limit?: number;
    naturalLanguage?: boolean;
  },
): Promise<{ result: EquipmentListResult; parsed: ParsedFilter | null }> {
  const store = getStore();
  const campusId = session.campusId;
  if (!campusId) {
    return {
      result: { items: [], total: 0, categories: [], tags: [], departments: [] },
      parsed: null,
    };
  }

  const base = listEquipment(store, campusId, { limit: 60 });
  let parsed: ParsedFilter | null = null;

  if (params.q && params.naturalLanguage !== false) {
    parsed = await parseSearchQuery(
      params.q,
      { categories: base.categories, tags: base.tags },
      session.userId,
    );
  }

  const result = listEquipment(store, campusId, {
    q: params.naturalLanguage === false ? params.q : undefined,
    departmentId: params.departmentId,
    category: params.category ?? parsed?.category ?? undefined,
    status: params.status,
    labId: params.labId,
    tags: parsed?.tags.length ? parsed.tags : undefined,
    availableFrom: params.availableFrom,
    availableTo: params.availableTo,
    offset: params.offset,
    limit: params.limit,
  });

  return { result, parsed };
}
