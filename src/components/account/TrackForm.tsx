"use client";

import { trackOrder } from "@/actions/public";
import { useResilientAction } from "@/lib/use-resilient-action";
import { useStore } from "../providers";

export function TrackForm({ defaultNumber = "" }: { defaultNumber?: string }) {
  const { d, locale } = useStore();
  const { state, pending, onSubmit } = useResilientAction(trackOrder, { retries: 2 });
  return (
    <form onSubmit={onSubmit} className="card mt-8 space-y-4 p-6">
      <input type="hidden" name="locale" value={locale} />
      <label className="block"><span className="label">{d.order.orderNumber}</span><input name="number" required defaultValue={defaultNumber} placeholder="DZ-261116-ABCDE" dir="ltr" autoComplete="off" className="field text-start uppercase" /></label>
      <label className="block"><span className="label">{d.order.emailOrPhone}</span><input name="contact" required autoComplete="tel" className="field" /></label>
      {state?.error && <p className="text-sm text-terracotta" role="alert">{state.error === "busy" ? d.common.busy : state.error === "rate" ? d.account.tooMany : d.order.notFound}</p>}
      <button className="btn-primary w-full" disabled={pending}>{d.order.find}</button>
    </form>
  );
}
