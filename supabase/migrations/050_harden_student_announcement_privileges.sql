-- Remove Supabase default table privileges that are broader than the
-- announcement API requires. Deletion remains intentionally unsupported;
-- published records are archived instead.

BEGIN;

REVOKE ALL ON TABLE public.student_announcements FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.student_announcements TO authenticated;

COMMIT;
