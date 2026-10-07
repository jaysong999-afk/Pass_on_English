import { AppShell } from "@/components/shared/AppShell";
import { ActiveLearnerProvider } from "@/contexts/ActiveLearnerContext";
import { StudentAnnouncementsProvider } from "@/contexts/StudentAnnouncementsContext";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <ActiveLearnerProvider>
      <StudentAnnouncementsProvider>
        <AppShell role="student">{children}</AppShell>
      </StudentAnnouncementsProvider>
    </ActiveLearnerProvider>
  );
}
