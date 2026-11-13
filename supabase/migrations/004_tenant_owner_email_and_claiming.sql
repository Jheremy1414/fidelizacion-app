-- ============================================================================
-- BlockOps Loyalty - 004: Vinculación Automática por Email & Provisionamiento en Frío
-- Ejecutar después de 001, 002 y 003_superadmin_setup.sql
-- ============================================================================

-- 1. Columna owner_email para asociar comercios provisionados en frío al correo del dueño
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS owner_email TEXT;

CREATE INDEX IF NOT EXISTS idx_tenants_owner_email
  ON public.tenants (lower(owner_email));

-- 2. RPC segura para reclamar negocios por correo autenticado al iniciar sesión o registrarse
CREATE OR REPLACE FUNCTION public.claim_tenants_by_email()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  caller_email TEXT := lower(COALESCE(auth.jwt() ->> 'email', ''));
  claimed_count INTEGER := 0;
BEGIN
  IF caller_id IS NULL OR caller_email = '' THEN
    RETURN 0;
  END IF;

  -- El SuperAdmin opera desde /admin y no debe reclamar cuentas ajenas automáticamente
  IF EXISTS (SELECT 1 FROM public.superadmins s WHERE lower(s.email) = caller_email) THEN
    RETURN 0;
  END IF;

  UPDATE public.tenants t
  SET owner_user_id = caller_id
  WHERE lower(COALESCE(t.owner_email, '')) = caller_email
    AND (
      t.owner_user_id IS NULL
      OR t.owner_user_id IN (
        SELECT u.id
        FROM auth.users u
        JOIN public.superadmins s ON lower(u.email) = lower(s.email)
      )
    );

  GET DIAGNOSTICS claimed_count = ROW_COUNT;
  RETURN claimed_count;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_tenants_by_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_tenants_by_email() TO authenticated;

