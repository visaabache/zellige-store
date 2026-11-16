"use client";

import { adminLogin } from "@/actions/account";
import { useResilientAction } from "@/lib/use-resilient-action";

export function AdminLoginForm({ next }: { next?: string }) {
  const { state, pending, onSubmit } = useResilientAction(adminLogin, { retries: 2, hardRedirect: true });
  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-6">
      {next && <input type="hidden" name="next" value={next} />}
      <label className="block"><span className="label">Email</span><input name="email" type="email" required autoComplete="username" className="field" /></label>
      <label className="block"><span className="label">Password</span><input name="password" type="password" required autoComplete="current-password" className="field" /></label>
      {state?.error && <p className="text-sm text-terracotta" role="alert">{state.error === "busy" ? "The server is busy. Please try again in a moment." : state.error}</p>}
      <button className="btn-primary w-full" disabled={pending || !!state?.redirect}>{pending || state?.redirect ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
