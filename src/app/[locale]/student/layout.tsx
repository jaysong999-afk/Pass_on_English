import { AppShell } from "@/components/shared/AppShell";
import { ActiveLearnerProvider } from "@/contexts/ActiveLearnerContext";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <ActiveLearnerProvider>
      <AppShell role="student">{children}</AppShell>
    </ActiveLearnerProvider>
  );
}
