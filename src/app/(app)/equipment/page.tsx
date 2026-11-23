import Link from "next/link";
import {
  CalendarClock,
  FlaskConical,
  MapPin,
  Search,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireCampus } from "@/lib/auth/server";
import { searchEquipment } from "@/lib/services/search";
import { formatIst } from "@/lib/time";

export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireCampus();
  const params = await searchParams;
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const q = first(params.q) ?? "";
  const departmentId = first(params.dept);
  const category = first(params.cat);

  const { result, parsed } = await searchEquipment(session, {
    q: q || undefined,
    departmentId,
    category,
    limit: 24,
  });

  return (
    <div>
      <PageHeader
        eyebrow={session.campusName}
        title="Equipment catalogue"
        description="Every lab, equipment item and bookable unit in your campus. Search in plain language, or filter by department."
        actions={
          <Link className="btn btn-secondary" href="/bookings">
            <CalendarClock aria-hidden="true" size={16} strokeWidth={1.75} />
            My bookings
          </Link>
        }
      />

      <form className="card mb-6 grid gap-3 p-4 md:grid-cols-[1fr_200px_200px_auto]" role="search">
        <div>
          <label className="label" htmlFor="q">
            Search
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-3 text-muted"
              size={18}
              strokeWidth={1.75}
            />
            <input
              className="input pl-10"
              id="q"
              name="q"
              defaultValue={q}
              placeholder={'e.g. "edge AI kit with a camera"'}
              aria-describedby="q-hint"
            />
          </div>
          <p className="hint" id="q-hint">
            Natural language becomes a filter; the database returns the results.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="dept">
            Department
          </label>
          <select className="select" id="dept" name="dept" defaultValue={departmentId ?? ""}>
            <option value="">All departments</option>
            {result.departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="cat">
            Category
          </label>
          <select className="select" id="cat" name="cat" defaultValue={category ?? ""}>
            <option value="">All categories</option>
            {result.categories.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button className="btn btn-primary w-full" type="submit">
            Search catalogue
          </button>
        </div>
      </form>

      {parsed && q ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={parsed.source === "ai" ? "info" : "muted"} icon={Sparkles}>
            {parsed.source === "ai" ? "AI filter" : "Keyword fallback"}
          </Badge>
          {parsed.category ? <Badge tone="ink">Category: {parsed.category}</Badge> : null}
          {parsed.tags.map((tag) => (
            <Badge key={tag} tone="ink">
              {tag}
            </Badge>
          ))}
          <span className="text-muted">
            {result.total} result{result.total === 1 ? "" : "s"}
          </span>
        </div>
      ) : (
        <p className="mb-4 text-sm text-muted">
          {result.total} item{result.total === 1 ? "" : "s"} in your campus catalogue.
        </p>
      )}

      {result.items.length === 0 ? (
        <EmptyState
          title="Nothing matched that search"
          description="Try a broader term, clear the filters, or ask your campus admin to add the equipment."
          action={{ href: "/equipment", label: "Clear filters" }}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {result.items.map((item) => (
            <Card as="li" key={item.equipment.id} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted">
                    {item.equipment.category}
                  </p>
                  <h2 className="mt-1 text-lg leading-snug">
                    <Link className="link" href={`/equipment/${item.equipment.id}`}>
                      {item.equipment.name}
                    </Link>
                  </h2>
                </div>
                <Badge tone={item.availableUnits > 0 ? "success" : "warning"}>
                  {item.availableUnits}/{item.totalUnits} units
                </Badge>
              </div>

              <p className="mt-2 flex items-center gap-1 text-sm text-muted">
                <MapPin aria-hidden="true" size={14} strokeWidth={1.75} />
                {item.labName} · {item.departmentName}
              </p>

              <p className="mt-2 line-clamp-3 text-sm text-muted">{item.equipment.description}</p>

              <div className="mt-3 flex flex-wrap gap-1">
                {item.equipment.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="badge badge-muted">
                    {tag}
                  </span>
                ))}
                {item.equipment.requiresCertification ? (
                  <Badge tone="warning" icon={ShieldCheck}>
                    Certification needed
                  </Badge>
                ) : null}
              </div>

              <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-muted">
                <span className="flex items-center gap-1">
                  <CalendarClock aria-hidden="true" size={14} strokeWidth={1.75} />
                  {item.nextAvailable
                    ? `Next free ${formatIst(item.nextAvailable)}`
                    : "No free slot in 14 days"}
                </span>
                <Link className="btn btn-secondary btn-sm" href={`/equipment/${item.equipment.id}`}>
                  View
                </Link>
              </div>
            </Card>
          ))}
        </ul>
      )}

      <p className="mt-6 flex items-center gap-2 text-xs text-muted">
        <FlaskConical aria-hidden="true" size={14} strokeWidth={1.75} />
        Only your campus is ever queried: catalogue, bookings and conflicts are all scoped by campus.
      </p>
    </div>
  );
}
