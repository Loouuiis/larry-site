import { MfaSetup } from "@/components/auth/MfaSetup";

export default function MfaSettingsPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6">
      <MfaSetup />
    </div>
  );
}
