"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({ text, label, done }: { text: string; label: string; done: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* clipboard blocked: the code stays visible to copy by hand */
        }
      }}
      className="btn-outline btn-sm"
    >
      {copied ? <Check className="h-4 w-4 text-emerald" /> : <Copy className="h-4 w-4" />}
      {copied ? done : label}
    </button>
  );
}
