import type { TeacherApplication } from "@/types";

const SEED: TeacherApplication[] = [
  {
    id: "app-seed-1",
    fullName: "David Kim",
    dateOfBirth: "1992-04-12",
    phone: "+63-912-555-0101",
    bankAccount: "BDO **** 4821",
    facebookMessengerId: "david.kim.pe",
    address: "Quezon City, Metro Manila",
    email: "david.kim@example.com",
    status: "pending",
    submittedAt: "2026-08-01T09:00:00.000Z",
  },
];

let applications: TeacherApplication[] = structuredClone(SEED);

export function listTeacherApplications(): TeacherApplication[] {
  return applications
    .slice()
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .map((a) => ({ ...a }));
}

export function getPendingTeacherApplications(): TeacherApplication[] {
  return listTeacherApplications().filter((a) => a.status === "pending");
}

export function getTeacherApplicationById(id: string): TeacherApplication | null {
  const item = applications.find((a) => a.id === id);
  return item ? { ...item } : null;
}

export function saveTeacherApplication(
  input: Omit<TeacherApplication, "id" | "status" | "submittedAt">
): TeacherApplication {
  const application: TeacherApplication = {
    ...input,
    id: `app-${Date.now()}`,
    status: "pending",
    submittedAt: new Date().toISOString(),
  };
  applications.unshift(application);
  return { ...application };
}

export function updateTeacherApplicationStatus(
  id: string,
  status: TeacherApplication["status"]
): TeacherApplication | null {
  const index = applications.findIndex((a) => a.id === id);
  if (index === -1) return null;
  applications[index] = { ...applications[index], status };
  return { ...applications[index] };
}

/** @internal */
export function resetTeacherApplicationStore() {
  applications = structuredClone(SEED);
}
