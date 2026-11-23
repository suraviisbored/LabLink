import { getStore } from "@/lib/db/store";
import { flushEmails } from "@/lib/email";
import { ApiError } from "@/lib/errors";
import {
  applyOption,
  explainRequest,
  recommendForConflict,
  type RequestExplanation,
} from "@/lib/repo/conflicts";
import { notify } from "@/lib/repo/notifications";
import { getRequest } from "@/lib/repo/requests";
import type { Session } from "@/lib/auth/session";

/** Conflict service: AI recommendation, human decision, notifications, audit. */

export async function recommend(session: Session, conflictId: string) {
  if (!session.campusId) throw new ApiError("FORBIDDEN", "A campus account is required.");
  if (!["faculty", "campus_admin"].includes(session.role)) {
    throw new ApiError("FORBIDDEN", "Only faculty and campus admins can run allocation.");
  }
  const store = getStore();
  const recommendation = await recommendForConflict(
    store,
    session.campusId,
    conflictId,
    session.userId,
  );

  await flushEmails(store);
  return recommendation;
}

export async function resolve(
  session: Session,
  input: { conflictId: string; optionId: string; overrideNote?: string },
) {
  if (!session.campusId) throw new ApiError("FORBIDDEN", "A campus account is required.");
  if (!["faculty", "campus_admin"].includes(session.role)) {
    throw new ApiError("FORBIDDEN", "Only faculty and campus admins can apply an allocation.");
  }
  const store = getStore();
  const result = applyOption(store, {
    campusId: session.campusId,
    conflictId: input.conflictId,
    optionId: input.optionId,
    actorId: session.userId,
    overrideNote: input.overrideNote,
  });

  for (const userId of result.affectedUserIds) {
    const bookings = store.data.bookings.filter(
      (booking) => booking.idempotencyKey.startsWith(`conflict-${input.optionId}`) && booking.userId === userId,
    );
    notify(store, {
      campusId: session.campusId,
      userId,
      type: "conflict_resolved",
      title: "Your allocation was updated",
      body:
        bookings.length > 0
          ? "A fair allocation was applied and your new booking is on the Bookings page."
          : "The conflict affecting your request was resolved. Check your request for details.",
      link: "/bookings",
      email: true,
    });
  }

  await flushEmails(store);
  return result;
}

export async function explanation(
  session: Session,
  requestId: string,
): Promise<RequestExplanation> {
  if (!session.campusId) throw new ApiError("FORBIDDEN", "A campus account is required.");
  const store = getStore();
  const context = getRequest(store, session.campusId, requestId);
  if (!context) throw new ApiError("NOT_FOUND", "That request does not exist in your campus.");

  const isOwner = context.project.studentId === session.userId;
  const isGuide = context.project.facultyId === session.userId;
  if (!isOwner && !isGuide && session.role !== "campus_admin") {
    throw new ApiError("FORBIDDEN", "You can only read your own request explanations.");
  }

  const result = await explainRequest(
    store,
    session.campusId,
    requestId,
    session.userId,
  );
  if (!result) throw new ApiError("NOT_FOUND", "That request does not exist in your campus.");
  return result;
}
