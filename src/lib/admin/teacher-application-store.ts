import { clearTeacherApplicationCache } from "@/lib/teacher-applications/application-cache";

export {
  listTeacherApplications,
  getPendingTeacherApplications,
  getTeacherApplicationById,
} from "@/lib/admin/teacher-application-store-sync";

/** @internal */
export function resetTeacherApplicationStore() {
  clearTeacherApplicationCache();
}
