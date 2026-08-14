import { AppShell } from "@/components/shared/AppShell";
import { PushSubscribeProvider } from "@/components/shared/PushSubscribeProvider";
import { ActiveLearnerProvider } from "@/contexts/ActiveLearnerContext";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <ActiveLearnerProvider>
      <PushSubscribeProvider />
      <AppShell role="student">{children}</AppShell>
    </ActiveLearnerProvider>
  );
}
