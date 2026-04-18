"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Building2 } from "lucide-react";

interface TenantRow {
  tenantId: string;
  name: string;
  slug: string;
  role: string;
  createdAt: string;
  current: boolean;
}

/**
 * Surfaced in the workspace topbar ONLY when the signed-in user has
 * more than one tenant membership. Login always lands users in their
 * oldest tenant — this gives them a way out when a collaborator has
 * added them to a project in a newer tenant.
 */
export function WorkspaceSwitcher() {
  const router = useRouter();
  const [tenants, setTenants] = useState<TenantRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/tenants", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { tenants?: TenantRow[] };
        if (!cancelled && Array.isArray(data.tenants)) {
          setTenants(data.tenants);
        }
      } catch {
        // Stay quiet: a failed /tenants lookup shouldn't break the topbar.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const switchTo = useCallback(
    async (tenantId: string) => {
      setSwitching(tenantId);
      setError(null);
      try {
        const res = await fetch("/api/auth/switch-tenant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data?.message ?? data?.error ?? "Failed to switch workspace.");
          return;
        }
        setOpen(false);
        // Full reload so every layout + server component refetches under
        // the new tenant cookie. router.refresh() alone misses server caches.
        router.replace("/workspace");
        router.refresh();
        window.location.reload();
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setSwitching(null);
      }
    },
    [router],
  );

  if (!tenants || tenants.length <= 1) return null;

  const current = tenants.find((t) => t.current) ?? tenants[0];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Switch workspace"
        className="flex items-center gap-2 rounded-md px-2.5 py-1 text-[12px] transition-opacity hover:opacity-80"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          color: "var(--text-1)",
        }}
      >
        <Building2 size={12} style={{ color: "var(--text-muted)" }} />
        <span className="max-w-[160px] truncate font-medium">{current.name}</span>
        <ChevronDown size={12} style={{ color: "var(--text-muted)" }} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full z-50 mt-1 w-[260px] rounded-lg border shadow-lg"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div
            className="border-b px-3 py-2 text-[11px] font-semibold uppercase tracking-wide"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
          >
            Your workspaces
          </div>
          <ul className="max-h-[320px] overflow-auto py-1">
            {tenants.map((t) => {
              const isBusy = switching === t.tenantId;
              return (
                <li key={t.tenantId}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={t.current}
                    disabled={t.current || Boolean(switching)}
                    onClick={() => void switchTo(t.tenantId)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors disabled:cursor-not-allowed"
                    style={{
                      color: t.current ? "var(--text-muted)" : "var(--text-1)",
                      opacity: isBusy ? 0.6 : 1,
                      background: "transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (!t.current && !switching) {
                        e.currentTarget.style.background = "var(--surface-2)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <span className="flex-1 truncate font-medium">{t.name}</span>
                    <span
                      className="text-[10px] font-semibold uppercase"
                      style={{ color: "var(--text-disabled)" }}
                    >
                      {t.role}
                    </span>
                    {t.current && <Check size={12} style={{ color: "#6c44f6" }} />}
                  </button>
                </li>
              );
            })}
          </ul>
          {error && (
            <div
              className="border-t px-3 py-2 text-[11px]"
              style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}
            >
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
