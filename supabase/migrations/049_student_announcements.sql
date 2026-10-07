-- Persistent student-portal announcements managed by administrators.
-- Announcements are shared records (not fanned out per student), so reads stay
-- bounded and do not add rows to notifications or Supabase Realtime traffic.

BEGIN;

CREATE TABLE IF NOT EXISTS public.student_announcements (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('normal', 'important', 'urgent')),
  priority_rank smallint GENERATED ALWAYS AS (
    CASE priority
      WHEN 'urgent' THEN 3
      WHEN 'important' THEN 2
      ELSE 1
    END
  ) STORED,
  title_ko text NOT NULL DEFAULT '',
  body_ko text NOT NULL DEFAULT '',
  title_zh_cn text NOT NULL DEFAULT '',
  body_zh_cn text NOT NULL DEFAULT '',
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  portal_wide boolean NOT NULL DEFAULT false,
  link_path text,
  link_label_ko text,
  link_label_zh_cn text,
  sort_order smallint NOT NULL DEFAULT 0,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE RESTRICT,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_announcements_period_check
    CHECK (ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT student_announcements_title_length_check
    CHECK (char_length(title_ko) <= 120 AND char_length(title_zh_cn) <= 120),
  CONSTRAINT student_announcements_body_length_check
    CHECK (char_length(body_ko) <= 3000 AND char_length(body_zh_cn) <= 3000),
  CONSTRAINT student_announcements_published_content_check
    CHECK (
      status <> 'published'
      OR (
        NULLIF(BTRIM(title_ko), '') IS NOT NULL
        AND NULLIF(BTRIM(body_ko), '') IS NOT NULL
        AND NULLIF(BTRIM(title_zh_cn), '') IS NOT NULL
        AND NULLIF(BTRIM(body_zh_cn), '') IS NOT NULL
      )
    ),
  CONSTRAINT student_announcements_priority_end_check
    CHECK (status <> 'published' OR priority = 'normal' OR ends_at IS NOT NULL),
  CONSTRAINT student_announcements_link_path_check
    CHECK (
      link_path IS NULL
      OR (
        link_path ~ '^/[A-Za-z0-9/_?=&%+.#-]*$'
        AND link_path !~ '^//'
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_student_announcements_active
  ON public.student_announcements (
    status,
    starts_at,
    ends_at,
    priority_rank DESC,
    sort_order ASC
  );

CREATE INDEX IF NOT EXISTS idx_student_announcements_admin_list
  ON public.student_announcements (updated_at DESC);

CREATE OR REPLACE FUNCTION public.set_student_announcement_audit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    NEW.updated_by := auth.uid();
    NEW.created_at := now();
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    NEW.updated_by := auth.uid();
  END IF;

  NEW.updated_at := now();

  IF NEW.status = 'published' AND (
    TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published'
  ) THEN
    NEW.published_at := now();
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS set_student_announcement_audit ON public.student_announcements;
CREATE TRIGGER set_student_announcement_audit
BEFORE INSERT OR UPDATE ON public.student_announcements
FOR EACH ROW EXECUTE FUNCTION public.set_student_announcement_audit();

ALTER TABLE public.student_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_student_announcements_admin_select ON public.student_announcements;
CREATE POLICY rls_student_announcements_admin_select
  ON public.student_announcements FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS rls_student_announcements_student_select ON public.student_announcements;
CREATE POLICY rls_student_announcements_student_select
  ON public.student_announcements FOR SELECT
  USING (
    public.current_user_role() = 'student'::public.user_role
    AND status = 'published'
    AND starts_at <= now()
    AND (ends_at IS NULL OR ends_at > now())
  );

DROP POLICY IF EXISTS rls_student_announcements_admin_insert ON public.student_announcements;
CREATE POLICY rls_student_announcements_admin_insert
  ON public.student_announcements FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS rls_student_announcements_admin_update ON public.student_announcements;
CREATE POLICY rls_student_announcements_admin_update
  ON public.student_announcements FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.student_announcements FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.student_announcements TO authenticated;
GRANT ALL ON TABLE public.student_announcements TO service_role;

ALTER FUNCTION public.set_student_announcement_audit() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_student_announcement_audit() FROM PUBLIC, anon, authenticated;

COMMIT;
