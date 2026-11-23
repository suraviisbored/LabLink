import { env } from "@/lib/env";
import type { EmailProvider } from "@/lib/email/provider";
import { ConsoleEmailProvider, ResendEmailProvider } from "@/lib/email/provider";
import { renderNotificationEmail } from "@/lib/email/templates";
import type { Store } from "@/lib/db/store";

/**
 * Outbox-driven email (PRD FR-9). A queued row is written in the same service
 * call as the state change; sending happens afterwards and can never roll the
 * user's action back. Failures stay in the outbox for the admin Email log.
 */

let provider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (!provider) {
    provider =
      env.emailProvider === "resend" && env.emailApiKey
        ? new ResendEmailProvider(env.emailApiKey, env.emailFrom)
        : new ConsoleEmailProvider(env.emailFrom);
  }
  return provider;
}

export function setEmailProviderForTests(next: EmailProvider | null): void {
  provider = next;
}

export function queueEmail(
  store: Store,
  params: {
    campusId: string;
    userId: string;
    notificationId: string | null;
    title: string;
    body: string;
  },
): string {
  const id = store.nextId("email");
  store.data.emailOutbox.push({
    id,
    campusId: params.campusId,
    notificationId: params.notificationId,
    toUserId: params.userId,
    subject: `${params.title} - LabLink`,
    status: "pending",
    providerMessageId: null,
    error: null,
    attempts: 0,
    createdAt: store.now(),
    sentAt: null,
  });
  return id;
}

/**
 * Attempts delivery for every pending row. Returns the number sent.
 * Demo accounts are marked `skipped (demo)` and never leave the building.
 */
export async function flushEmails(store: Store, limit = 20): Promise<number> {
  const pending = store.data.emailOutbox.filter((entry) => entry.status === "pending").slice(0, limit);
  let sent = 0;

  for (const entry of pending) {
    const user = store.data.profiles.find((profile) => profile.id === entry.toUserId);
    const campus = store.data.campuses.find((item) => item.id === entry.campusId);

    if (!user) {
      entry.status = "failed";
      entry.error = "Recipient profile no longer exists";
      continue;
    }

    if (campus?.isDemo) {
      entry.status = "skipped";
      entry.error = "skipped (demo)";
      continue;
    }

    if (!user.emailNotifications) {
      entry.status = "skipped";
      entry.error = "Recipient opted out of email";
      continue;
    }

    entry.attempts += 1;
    const notification = entry.notificationId
      ? store.data.notifications.find((item) => item.id === entry.notificationId)
      : undefined;

    const content = renderNotificationEmail({
      notification: {
        title: notification?.title ?? entry.subject.replace(/ - LabLink$/, ""),
        body: notification?.body ?? "You have an update in LabLink.",
        link: notification?.link ?? "/notifications",
      },
      recipientName: user.name,
      campusName: campus?.name ?? "LabLink",
      appOrigin: env.appOrigin,
    });

    try {
      const result = await getEmailProvider().send({
        to: user.email,
        subject: content.subject,
        html: content.html,
        text: content.text,
      });
      entry.status = "sent";
      entry.providerMessageId = result.id;
      entry.sentAt = store.now();
      entry.error = null;
      sent += 1;
    } catch (error) {
      entry.status = "failed";
      entry.error = error instanceof Error ? error.message.slice(0, 300) : "Unknown provider error";
    }
  }

  return sent;
}
