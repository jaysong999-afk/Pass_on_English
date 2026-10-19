-- Minimal, append-only administrator security audit trail.
-- Raw IP addresses and credentials are never stored.

BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_security_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'admin_login_succeeded',
    'admin_logout',
    'mfa_enrolled',
    'mfa_verified',
    'password_changed',
    'other_sessions_signed_out'
  )),
  success boolean NOT NULL DEFAULT true,
  ip_hash text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_security_events_created
  ON public.admin_security_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_security_events_actor_created
  ON public.admin_security_events (actor_id, created_at DESC)
  WHERE actor_id IS NOT NULL;

ALTER TABLE public.admin_security_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_admin_security_events_select ON public.admin_security_events;
CREATE POLICY rls_admin_security_events_select
  ON public.admin_security_events FOR SELECT
  USING (public.is_admin());

REVOKE ALL ON TABLE public.admin_security_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.admin_security_events TO authenticated;
GRANT ALL ON TABLE public.admin_security_events TO service_role;

ALTER TABLE public.admin_security_events OWNER TO postgres;

COMMIT;
