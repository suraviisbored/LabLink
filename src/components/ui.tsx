import Link from "next/link";
import clsx from "clsx";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleDashed,
  Clock3,
  LogIn,
  Pencil,
  ShieldCheck,
  Undo2,
  UserX,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

export function Card({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "li";
}) {
  return <Tag className={clsx("card", className)}>{children}</Tag>;
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? (
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

type Tone = "ink" | "success" | "warning" | "danger" | "info" | "muted";

export function Badge({
  children,
  tone = "ink",
  icon: Icon,
}: {
  children: ReactNode;
  tone?: Tone;
  icon?: LucideIcon;
}) {
  return (
    <span className={`badge badge-${tone}`}>
      {Icon ? <Icon aria-hidden="true" size={14} strokeWidth={1.75} /> : null}
      {children}
    </span>
  );
}

const STATUS_MAP: Record<
  string,
  { label: string; tone: Tone; icon: LucideIcon }
> = {
  confirmed: { label: "Confirmed", tone: "success", icon: CheckCircle2 },
  checked_in: { label: "Checked in", tone: "success", icon: LogIn },
  completed: { label: "Completed", tone: "muted", icon: ShieldCheck },
  cancelled: { label: "Cancelled", tone: "muted", icon: Ban },
  no_show: { label: "No-show", tone: "danger", icon: UserX },
  submitted: { label: "Submitted", tone: "warning", icon: Clock3 },
  under_review: { label: "Under review", tone: "warning", icon: Clock3 },
  approved: { label: "Approved", tone: "success", icon: CheckCircle2 },
  rejected: { label: "Rejected", tone: "danger", icon: XCircle },
  modified: { label: "Modified", tone: "info", icon: Pencil },
  waiting: { label: "Waiting", tone: "warning", icon: CircleDashed },
  promoted: { label: "Promoted", tone: "success", icon: CheckCircle2 },
  open: { label: "Open", tone: "warning", icon: AlertTriangle },
  recommended: { label: "Recommended", tone: "info", icon: AlertTriangle },
  resolved: { label: "Resolved", tone: "success", icon: CheckCircle2 },
};

export function StatusBadge({ status }: { status: string }) {
  const entry = STATUS_MAP[status] ?? {
    label: status.replace(/_/g, " "),
    tone: "ink" as Tone,
    icon: CircleDashed,
  };
  return (
    <Badge tone={entry.tone} icon={entry.icon}>
      {entry.label}
    </Badge>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="card p-8 text-center">
      <p className="text-lg font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{description}</p>
      {action ? (
        <Link className="btn btn-primary mt-4" href={action.href}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

/**
 * Fairness bar: the number is always written next to the bar, so the meaning
 * does not depend on colour or width alone.
 */
export function FairnessBar({ value, label = "Fairness score" }: { value: number; label?: string }) {
  const pct = Math.round(value * 1000) / 10;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-semibold">{pct}%</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-sm border border-line bg-[#e7dfd8]"
        role="img"
        aria-label={`${label}: ${pct} percent`}
      >
        <div className="h-full bg-ink" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? (
        <p className="hint" id={`${htmlFor}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="mt-1 text-xs font-medium text-danger" id={`${htmlFor}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TierNote({ tier }: { tier: "Build" | "Stretch 1" | "Stretch 2" | "Stretch 3" | "Specified" }) {
  const tone: Tone =
    tier === "Build" ? "success" : tier === "Specified" ? "muted" : "info";
  return <Badge tone={tone}>{tier}</Badge>;
}

export function ArrowLeft() {
  return <Undo2 aria-hidden="true" size={16} strokeWidth={1.75} />;
}
