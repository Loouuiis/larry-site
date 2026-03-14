"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  return (
    <button
      onClick={handleLogout}
      className="inline-flex h-9 items-center rounded-full border border-neutral-200 bg-transparent px-5 text-sm font-medium text-neutral-600 transition-colors duration-200 hover:border-neutral-900 hover:text-neutral-900"
    >
      Log out
    </button>
  );
}
