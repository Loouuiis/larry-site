"use client";

import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";

interface NotificationBellProps {
  count: number;
  onCountChange: (count: number) => void;
}

export function NotificationBell({ count }: NotificationBellProps) {
  const router = useRouter();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => router.push("/workspace/actions")}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--pm-text-muted)] hover:bg-[var(--pm-gray-light)]"
        title="Go to Actions"
      >
        <Bell size={20} />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#6c44f6] px-0.5 text-[10px] font-bold text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
    </div>
  );
}
