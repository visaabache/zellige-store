"use client";

import { useRouter } from "next/navigation";
import { startTransition } from "react";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-display text-3xl font-semibold">Something interrupted this page</h1>
      <p className="max-w-md text-sm text-charcoal-600">The server was busy or the request was cut off. Nothing you saved is lost: try again, and check the last change you made.</p>
      {error.digest && <p className="font-mono text-xs text-charcoal-400">ref {error.digest}</p>}
      <div className="flex gap-3">
        <button className="btn-primary btn-sm" onClick={() => startTransition(() => { router.refresh(); reset(); })}>Try again</button>
        <a href="/admin" className="btn-outline btn-sm">Dashboard</a>
      </div>
    </div>
  );
}
