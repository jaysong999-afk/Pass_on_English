-- Supabase grants new public-schema functions directly to API roles.
-- Remove anonymous access explicitly after migration 041 creates the chat RPCs.

BEGIN;

REVOKE ALL ON FUNCTION public.get_chat_inbox(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_chat_thread_messages(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_chat_inbox(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_chat_thread_messages(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.ensure_chat_room_for_active_enrollment()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ensure_student_admin_direct_thread()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ensure_teacher_admin_direct_thread()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
