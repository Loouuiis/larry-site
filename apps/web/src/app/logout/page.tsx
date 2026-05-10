"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { clearClientSessionState } from "@/lib/client-session-cleanup";

function LogoutClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    let cancelled = false;
    const next = searchParams.get("next") || "/";

    async function logout() {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } finally {
        clearClientSessionState();
        if (!cancelled) router.replace(next);
      }
    }

    void logout();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return null;
}

export default function LogoutPage() {
  return (
    <Suspense fallback={null}>
      <LogoutClient />
    </Suspense>
  );
}
