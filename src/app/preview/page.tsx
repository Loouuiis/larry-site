import { DashboardShell } from "@/app/dashboard/DashboardShell";
import { DashboardOverview } from "@/app/dashboard/DashboardOverview";

export default function PreviewPage() {
  return (
    <DashboardShell>
      <DashboardOverview />
    </DashboardShell>
  );
}
