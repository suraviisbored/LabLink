import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, BellRing } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import {
  EmailPreferenceToggle,
  MarkReadButton,
  NotificationActions,
} from "@/components/forms-notifications";
import { getSession } from "@/lib/auth/server";
import { loadStore } from "@/lib/db";
import { listNotifications, unreadCount } from "@/lib/repo/notifications";
import { formatIst, relativeTime } from "@/lib/time";

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.campusId) redirect("/admin/campuses");

  const store = await loadStore();
  const notifications = listNotifications(store, session.campusId, session.userId);
  const unread = unreadCount(store, session.campusId, session.userId);

  return (
    <div>
      <PageHeader
        eyebrow={session.campusName}
        title="Notifications"
        description="Approvals, conflict outcomes and booking changes. In-app notifications stay on even if you turn email off."
        actions={<NotificationActions unread={unread} />}
      />

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section aria-labelledby="list-heading">
          <h2 id="list-heading" className="mb-3 flex items-center gap-2 text-xl">
            <Bell aria-hidden="true" size={20} strokeWidth={1.75} />
            Inbox
            {unread ? (
              <Badge tone="info" icon={BellRing}>
                {unread} unread
              </Badge>
            ) : null}
          </h2>

          {notifications.length === 0 ? (
            <EmptyState
              title="Nothing yet"
              description="Approvals, conflict results and booking changes land here."
              action={{ href: "/equipment", label: "Browse equipment" }}
            />
          ) : (
            <ul className="space-y-3">
              {notifications.map((notification) => (
                <Card
                  as="li"
                  key={notification.id}
                  className={`p-4 ${notification.read ? "" : "border-l-4 border-l-info"}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">
                        {notification.read ? "" : <span className="sr-only">Unread: </span>}
                        {notification.title}
                      </p>
                      <p className="mt-1 text-sm text-muted">{notification.body}</p>
                      <p className="mt-2 text-xs text-muted">
                        {formatIst(notification.createdAt)} · {relativeTime(notification.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {!notification.read ? <MarkReadButton id={notification.id} /> : <Badge tone="muted">Read</Badge>}
                    </div>
                  </div>
                  {notification.link ? (
                    <Link className="link mt-2 inline-block text-sm" href={notification.link}>
                      Open
                    </Link>
                  ) : null}
                </Card>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          <EmailPreferenceToggle enabled={session.emailNotifications} email={session.email} />
          <Card className="p-4">
            <h2 className="text-lg">How email works</h2>
            <ul className="mt-2 space-y-2 text-sm text-muted">
              <li>Recipients come from your profile, never from a form.</li>
              <li>Every send is recorded in the campus admin email log with a status.</li>
              <li>Email is sent after the database change, so a provider failure never undoes an action.</li>
              <li>Demo accounts are marked “skipped (demo)” and never leave the deployment.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
