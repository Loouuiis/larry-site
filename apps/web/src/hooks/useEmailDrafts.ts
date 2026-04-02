import { useCallback, useEffect, useState } from "react";
import type { EmailDraft } from "@/app/dashboard/types";

export function useEmailDrafts() {
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/workspace/email/drafts", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setDrafts((data.items ?? data.drafts ?? []).filter((d: EmailDraft) => d.state === "draft"));
      }
    } catch {
      // keep empty
    } finally {
      setLoading(false);
    }
  }, []);

  const send = useCallback(async (draftId: string) => {
    setSending(draftId);
    try {
      const res = await fetch("/api/workspace/email/drafts/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId }),
      });
      if (res.ok) {
        setDrafts((prev) => prev.filter((d) => d.id !== draftId));
      }
    } finally {
      setSending(null);
    }
  }, []);

  const dismiss = useCallback((draftId: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== draftId));
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { drafts, loading, sending, send, dismiss, refresh: load };
}
