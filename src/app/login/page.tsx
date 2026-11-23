import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { LogoMark, Wordmark } from "@/components/logo";
import { DemoLoginButtons, SignupForm } from "@/components/forms-auth";
import { getSession } from "@/lib/auth/server";
import { env } from "@/lib/env";
import { loadStore } from "@/lib/db";

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect(session.role === "super_admin" ? "/admin/campuses" : "/equipment");
  }

  const store = await loadStore();
  const campuses = store.data.campuses
    .filter((campus) => campus.isActive)
    .map((campus) => ({
      name: campus.name,
      domains: campus.allowedEmailDomains,
      demo: campus.isDemo,
    }));

  return (
    <main id="main" className="mx-auto flex min-h-screen w-full max-w-content flex-col gap-8 px-4 py-8 lg:flex-row lg:items-center lg:gap-16 lg:py-16">
      <section className="lg:w-1/2">
        <div className="flex items-center gap-3">
          <LogoMark width={48} height={48} />
          <div>
            <Wordmark className="text-lg" />
            <p className="text-sm text-muted">Every lab, within reach.</p>
          </div>
        </div>

        <h1 className="mt-8 max-w-xl text-4xl">
          Find the equipment your project needs, and a fair way to share it.
        </h1>
        <p className="mt-4 max-w-xl text-muted">
          LabLink is a campus-scoped catalogue of laboratories, equipment and bookable units. Students
          book slots and request project access; faculty approve; when demand exceeds capacity a
          deterministic solver proposes fair allocations and explains every decision.
        </p>

        <ul className="mt-6 grid gap-3 text-sm">
          <li className="card flex items-start gap-3 p-3">
            <Sparkles aria-hidden="true" className="mt-0.5 shrink-0" size={18} strokeWidth={1.75} />
            <span>
              <strong>AI recommends, the solver decides feasibility.</strong> The platform works with
              the model switched off.
            </span>
          </li>
          <li className="card flex items-start gap-3 p-3">
            <ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0" size={18} strokeWidth={1.75} />
            <span>
              <strong>Isolated by campus in the database.</strong> Every row carries a campus and row
              level security enforces it.
            </span>
          </li>
          <li className="card flex items-start gap-3 p-3">
            <TriangleAlert aria-hidden="true" className="mt-0.5 shrink-0" size={18} strokeWidth={1.75} />
            <span>
              <strong>Conflicts are explained.</strong> If you lose a slot you see the smallest change
              that would have flipped the outcome.
            </span>
          </li>
        </ul>

        <p className="mt-6 text-xs text-muted">
          Supported campus domains:{" "}
          {campuses.map((campus, index) => (
            <span key={campus.name}>
              <span className="font-mono">{campus.domains.join(", ")}</span> ({campus.name})
              {index < campuses.length - 1 ? " · " : ""}
            </span>
          ))}
        </p>
      </section>

      <section className="card w-full p-6 lg:w-1/2">
        <h2 className="text-2xl">Sign in</h2>
        <p className="mt-1 text-sm text-muted">
          Campus accounts use your college email. Your domain decides your campus; one domain maps to
          exactly one campus.
        </p>

        {env.demoMode ? (
          <div className="mt-4 rounded-sm border border-warning bg-[#f4ecdd] p-3">
            <p className="text-sm font-medium text-warning">Demo mode: sample data, shared accounts</p>
            <p className="mt-1 text-xs text-muted">
              These accounts live on a dedicated demo campus, isolated by the same tenancy rules. No
              real data and no email leaves this deployment.
            </p>
            <div className="mt-3">
              <DemoLoginButtons />
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-sm border border-line bg-[#eae2dc] p-3 text-sm">
            Demo access is disabled on this deployment. Sign in with your college email below.
          </p>
        )}

        <div className="mt-6 border-t border-line pt-4">
          <h3 className="text-lg">Create a student account</h3>
          <SignupForm domains={campuses.flatMap((campus) => campus.domains)} />
        </div>

        <p className="mt-4 text-xs text-muted">
          Faculty and campus admin roles are granted by a campus admin, never by signing up.{" "}
          <Link className="link" href="/equipment">
            Browse the catalogue
          </Link>{" "}
          once signed in.
        </p>
      </section>
    </main>
  );
}
