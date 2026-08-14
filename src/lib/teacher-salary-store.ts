export {
  getAllSalaryStatements,
  getSalaryMonthsForTeacher,
  getSalaryStatement,
  getSalaryStatementsForTeacher,
  getBonusPolicy,
  getPayoutAccount,
  getVerificationLessons,
  isSalaryMonthEnded,
  statementTotal,
  previewBulkHourlyRateUpdate,
  applyBulkHourlyRateUpdate,
  updateTeacherHourlyRate,
  monthKeyFromDate,
} from "@/lib/teacher-salary-store-sync";

export function resetTeacherSalaryStore() {
  // Cache repopulated from Supabase via warmSalaryCache().
}
