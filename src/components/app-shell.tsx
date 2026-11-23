import Link from "next/link";
import {
  Bell,
  CalendarClock,
  ClipboardCheck,
  FlaskConical,
  LayoutDashboard,
  Menu,
  TriangleAlert,
  Building2,
} from "lucide-react";
import { LogoMark, Wordmark } from "@/components/logo";
import { LogoutButton } from "@/components/forms-auth";
import type { Session } from "@/lib/auth/session";
import type { Role } from "@/lib/types";
import { getStore } from "@/lib/db/store";
import { unreadCount } from "@/lib/repo/notifications";

interface NavItem {
  href: string;
  label: string;
  icon: typeof FlaskConical;
  roles: Role[];
  badge?: number;
}

function navItems(session: Session): NavItem[] {
  const unread = session.campusId
    ? unreadCount(getStore(), session.campusId, session.userId)
    : 0;

  const items: NavItem[] = [
    { href: "/equipment", label: "Equipment", icon: FlaskConical, roles: ["student", "faculty", "campus_admin"] },
    { href: "/bookings", label: "Bookings", icon: CalendarClock, roles: ["student", "faculty", "campus_admin"] },
    { href: "/requests", label: "My requests", icon: ClipboardCheck, roles: ["student"] },
    { href: "/approvals", label: "Approvals", icon: ClipboardCheck, roles: ["faculty", "campus_admin"] },
    { href: "/conflicts", label: "Conflicts", icon: TriangleAlert, roles: ["faculty", "campus_admin"] },
    { href: "/admin", label: "Campus admin", icon: LayoutDashboard, roles: ["campus_admin"] },
    { href: "/admin/campuses", label: "Campuses", icon: Building2, roles: ["super_admin"] },
    { href: "/notifications", label: "Notifications", icon: Bell, roles: ["student", "faculty", "campus_admin"], badge: unread },
  ];

  return items.filter((item) => item.roles.includes(session.role));
}

/**
 * Navigation list. `rail` renders icon-only links (labels hidden) for the
 * 64px sidebar rail that appears between md and lg; the mobile disclosure
 * keeps the labels.
 */
function NavList({ items, rail = false }: { items: NavItem[]; rail?: boolean }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-label={item.badge ? `${item.label}, ${item.badge} unread notifications` : item.label}
          title={rail ? item.label : undefined}
          className={`nav-link${rail ? " md:justify-center lg:justify-start" : ""}`}
        >
          <item.icon aria-hidden="true" size={20} strokeWidth={1.75} className="shrink-0" />
          <span className={`flex-1${rail ? " hidden lg:block" : ""}`}>{item.label}</span>
          {item.badge ? (
            <span
              className={`badge badge-info${rail ? " hidden lg:inline-flex" : ""}`}
              aria-label={`${item.badge} unread notifications`}
            >
              {item.badge}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

export function AppShell({
  session,
  children,
}: {
  session: Session;
  children: React.ReactNode;
}) {
  const items = navItems(session);
  const unread = session.campusId
    ? unreadCount(getStore(), session.campusId, session.userId)
    : 0;

  return (
    <div className="min-h-screen md:flex">
      {/* Sidebar: icon rail from md, full from lg. */}
      <aside className="hidden shrink-0 border-r border-line bg-surface md:flex md:w-16 md:flex-col lg:w-64">
        <div className="flex items-center gap-3 border-b border-line px-4 py-4">
          <LogoMark className="shrink-0" />
          <span className="hidden lg:block">
            <Wordmark className="text-sm" />
            <span className="mt-0.5 block text-xs text-muted">Every lab, within reach.</span>
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavList items={items} rail />
        </div>
        <div className="border-t border-line p-3">
          <p className="mb-1 hidden text-xs uppercase tracking-widest text-muted lg:block">
            Campus
          </p>
          <p className="mb-3 hidden text-sm font-medium lg:block">{session.campusName}</p>
          <p className="mb-1 hidden truncate text-xs text-muted lg:block">{session.email}</p>
          <div className="flex flex-col items-center gap-2 lg:flex-row lg:justify-between">
            <span className="badge badge-ink hidden capitalize lg:inline-flex">
              {session.role.replace("_", " ")}
            </span>
            <span className="lg:hidden">
              <LogoutButton iconOnly />
            </span>
            <span className="hidden lg:inline">
              <LogoutButton compact />
            </span>
          </div>
        </div>
      </aside>

      {/* Mobile top bar with a disclosure "hamburger". */}
      <div className="md:hidden">
        <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3">
          <Link href="/equipment" className="flex items-center gap-2">
            <LogoMark width={32} />
            <Wordmark className="text-xs" />
          </Link>
          <span className="badge badge-ink">{session.campusName}</span>
        </header>
        <details className="border-b border-line bg-surface">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm font-medium">
            <Menu aria-hidden="true" size={20} strokeWidth={1.75} />
            Menu
            {unread ? <span className="badge badge-info">{unread} unread</span> : null}
          </summary>
          <div className="px-2 pb-3">
            <NavList items={items} />
            <div className="mt-2 flex items-center justify-between gap-2 px-2">
              <span className="badge badge-ink capitalize">{session.role.replace("_", " ")}</span>
              <LogoutButton compact />
            </div>
          </div>
        </details>
      </div>

      <div className="min-w-0 flex-1">
        <header className="hidden items-center justify-between border-b border-line bg-surface px-6 py-3 md:flex">
          <p className="text-sm text-muted">
            Signed in as <span className="font-medium text-ink">{session.name}</span>
            {session.campusId ? (
              <>
                {" "}
                &middot; <span className="font-medium text-ink">{session.campusName}</span>
              </>
            ) : null}
          </p>
          <div className="flex items-center gap-3">
            <Link href="/notifications" className="btn btn-secondary btn-sm" aria-label={`Notifications, ${unread} unread`}>
              <Bell aria-hidden="true" size={16} strokeWidth={1.75} />
              {unread} unread
            </Link>
            <LogoutButton />
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-content px-4 py-6 md:px-6">
          {children}
        </main>
        <footer className="mx-auto w-full max-w-content px-4 pb-8 text-xs text-muted md:px-6">
          <p>
            LabLink &middot; campus-scoped laboratory sharing. Times are shown in IST; stored in UTC.
          </p>
          <p className="mt-1">
            Demo deployment: sample data on a dedicated demo campus, isolated by the same tenancy rules.
          </p>
        </footer>
      </div>
    </div>
  );
}
