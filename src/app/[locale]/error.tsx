"use client";

import { usePathname, useRouter } from "next/navigation";
import { startTransition } from "react";

const TEXT = {
  fr: { title: "Cette page n'a pas pu se charger", body: "Le serveur était occupé. Réessayez : cela fonctionne en général tout de suite.", retry: "Réessayer", home: "Accueil" },
  ar: { title: "تعذّر تحميل هذه الصفحة", body: "كان الخادم مشغولاً. أعد المحاولة، غالباً ما تنجح فوراً.", retry: "أعد المحاولة", home: "الرئيسية" },
  en: { title: "This page could not load", body: "The server was busy. Try again: it usually works right away.", retry: "Try again", home: "Home" },
};

export default function StoreError({ reset }: { error: Error; reset: () => void }) {
  const path = usePathname() || "/fr";
  const locale = (["fr", "ar", "en"].find((l) => path.split("/")[1] === l) || "fr") as keyof typeof TEXT;
  const t = TEXT[locale];
  const router = useRouter();
  return (
    <div className="container flex min-h-[50vh] flex-col items-center justify-center gap-4 py-20 text-center">
      <h1 className="font-display text-3xl font-semibold">{t.title}</h1>
      <p className="max-w-md text-charcoal-600">{t.body}</p>
      <div className="flex gap-3">
        <button className="btn-primary" onClick={() => startTransition(() => { router.refresh(); reset(); })}>{t.retry}</button>
        <a href={`/${locale}`} className="btn-outline">{t.home}</a>
      </div>
    </div>
  );
}
