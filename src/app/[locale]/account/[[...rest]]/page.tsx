import { redirect } from "next/navigation";
import { asLocale } from "@/lib/i18n/config";

/** Customer accounts are off: orders are followed with the tracking code. Old account links land on the tracking page. */
export default async function AccountRedirect({ params }: { params: Promise<{ locale: string }> }) {
  redirect(`/${asLocale((await params).locale)}/track`);
}
