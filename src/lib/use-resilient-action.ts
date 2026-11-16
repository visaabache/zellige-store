"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Result = { ok?: boolean; error?: string; redirect?: string } | null;

/**
 * Calls a server action from a form without letting a failed request crash the page.
 * On Cloudflare Workers a request can be cut off (CPU limit); the browser then receives an error page instead of
 * the action's answer. Safe actions (sign-in, order lookup, newsletter) are retried; otherwise { error: "busy" }.
 * A returned `redirect` is followed on the client.
 */
export function useResilientAction(action: (prev: Result, fd: FormData) => Promise<Result>, opts: { retries?: number; hardRedirect?: boolean } = {}) {
  const [state, setState] = useState<Result>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const submit = (fd: FormData) =>
    start(async () => {
      let result: Result = { error: "busy" };
      for (let attempt = 0; attempt <= (opts.retries ?? 0); attempt++) {
        try {
          result = await action(null, fd);
          break;
        } catch {
          if (attempt < (opts.retries ?? 0)) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        }
      }
      setState(result);
      if (result?.redirect) {
        if (opts.hardRedirect) window.location.assign(result.redirect);
        else router.push(result.redirect);
      }
    });
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    submit(new FormData(e.currentTarget));
  };
  return { state, pending, onSubmit };
}
