import type { Store } from "@/lib/db/store";
import { queueEmail } from "@/lib/email";
import { ApiError } from "@/lib/errors";
import type { EmailOutboxEntry, Notification } from "@/lib/types";
import { nowIso } from "@/lib/time";

/** In-app notifications plus the email outbox (PRD FR-9). */

export interface NotifyInput {
  campusId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string | null;
  /** FR-9 matrix: only some events also produce an email. */
  email?: boolean;
}

export function notify(store: Store, input: NotifyInput): Notification {
  const notification: Notification = {
    id: store.nextId("notif"),
    campusId: input.campusId,
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    link: input.link ?? null,
    read: false,
    createdAt: nowIso(),
  };
  store.data.notifications.push(notification);

  if (input.email) {
    queueEmail(store, {
      campusId: input.campusId,
      userId: input.userId,
      notificationId: notification.id,
      title: notification.title,
      body: notification.body,
    });
  }

  return notification;
}

export function listNotifications(
  store: Store,
  campusId: string,
  userId: string,
  limit = 50,
): Notification[] {
  return store.data.notifications
    .filter((entry) => entry.campusId === campusId && entry.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

export function unreadCount(store: Store, campusId: string, userId: string): number {
  return store.data.notifications.filter(
    (entry) => entry.campusId === campusId && entry.userId === userId && !entry.read,
  ).length;
}

export function markRead(
  store: Store,
  campusId: string,
  userId: string,
  notificationId: string,
): Notification {
  const notification = store.data.notifications.find(
    (entry) =>
      entry.id === notificationId && entry.campusId === campusId && entry.userId === userId,
  );
  if (!notification) throw new ApiError("NOT_FOUND", "That notification is not yours.");
  notification.read = true;
  return notification;
}

export function markAllRead(store: Store, campusId: string, userId: string): number {
  let count = 0;
  for (const entry of store.data.notifications) {
    if (entry.campusId === campusId && entry.userId === userId && !entry.read) {
      entry.read = true;
      count += 1;
    }
  }
  return count;
}

export function updateEmailPreference(
  store: Store,
  userId: string,
  enabled: boolean,
): void {
  const profile = store.data.profiles.find((entry) => entry.id === userId);
  if (!profile) throw new ApiError("NOT_FOUND", "Profile not found.");
  profile.emailNotifications = enabled;
}

export interface EmailLogRow extends EmailOutboxEntry {
  recipientName: string;
  recipientEmail: string;
  campusName: string;
}

export function emailLog(store: Store, campusId: string, limit = 100): EmailLogRow[] {
  const campus = store.data.campuses.find((entry) => entry.id === campusId);
  return store.data.emailOutbox
    .filter((entry) => entry.campusId === campusId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit)
    .map((entry) => {
      const profile = store.data.profiles.find((user) => user.id === entry.toUserId);
      return {
        ...entry,
        recipientName: profile?.name ?? "Unknown",
        recipientEmail: profile?.email ?? "—",
        campusName: campus?.name ?? "—",
      };
    });
}
