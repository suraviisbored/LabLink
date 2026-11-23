import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { Badge, Card, PageHeader } from "@/components/ui";
import { CampusForm } from "@/components/forms-admin";
import { getSession } from "@/lib/auth/server";
import { loadStore } from "@/lib/db";
import { listCampuses } from "@/lib/repo/admin";

export default async function CampusesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "super_admin") redirect("/equipment");

  const store = await loadStore();
  const campuses = listCampuses(store);

  return (
    <div>
      <PageHeader
        eyebrow="Platform"
        title="Campuses and email domains"
        description="The platform admin adds campuses and maps their email domains, and assigns the first campus admin. Campus content is never visible here."
        actions={<Badge tone="ink">super_admin</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-xl">
            <Building2 aria-hidden="true" size={20} strokeWidth={1.75} />
            Campuses
          </h2>
          <ul className="space-y-3">
            {campuses.map((campus) => {
              const users = store.data.profiles.filter((profile) => profile.campusId === campus.id);
              return (
                <Card as="li" key={campus.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-lg">{campus.name}</h3>
                      <p className="mt-1 text-sm text-muted">
                        {campus.allowedEmailDomains.map((domain) => (
                          <span key={domain} className="mr-2 font-mono text-xs">
                            {domain}
                          </span>
                        ))}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {campus.isDemo ? <Badge tone="info">Demo campus</Badge> : null}
                      <Badge tone={campus.isActive ? "success" : "muted"}>
                        {campus.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    {users.length} members · {users.filter((user) => user.role === "campus_admin").length} campus
                    admins · {store.data.equipment.filter((item) => item.campusId === campus.id).length}{" "}
                    equipment items
                  </p>
                </Card>
              );
            })}
          </ul>

          <p className="mt-4 text-xs text-muted">
            One domain maps to exactly one campus (enforced by a unique index in the database). A
            sign-up from any other domain is rejected.{" "}
            <Link className="link" href="/equipment">
              Campus content
            </Link>{" "}
            is not reachable from a platform account.
          </p>
        </section>

        <CampusForm />
      </div>
    </div>
  );
}
