import Link from "next/link";
import { LogoMark } from "@/components/logo";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-16">
      <LogoMark width={44} height={44} />
      <h1 className="mt-6 text-3xl">That page is not here</h1>
      <p className="mt-2 text-muted">
        The link may be out of date, or the item belongs to another campus. Nothing else changed.
      </p>
      <div className="mt-6 flex gap-2">
        <Link className="btn btn-primary" href="/equipment">
          Back to equipment
        </Link>
        <Link className="btn btn-secondary" href="/login">
          Sign in
        </Link>
      </div>
    </main>
  );
}
