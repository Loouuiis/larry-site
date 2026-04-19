import { MfaSetup } from "@/components/auth/MfaSetup";

// Public enrolment page. Reached from /login when the tenant requires
// MFA for admins and the caller has no session yet — they arrive here
// with ?token=<mfaEnrolmentToken>. The MfaSetup component reads the
// token from the URL and uses it as the Authorization header against
// the API. On successful confirm, the component's proxy call seals a
// full session cookie and we route to /workspace.
export default function PublicMfaEnrolPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6">
      <MfaSetup autoStart />
    </div>
  );
}
