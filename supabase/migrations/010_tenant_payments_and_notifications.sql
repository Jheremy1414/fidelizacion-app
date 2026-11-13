-- ============================================================================
-- BlockOps Loyalty - Migración 010: Contabilidad (tenant_payments) y
-- Notificaciones directas a comercios (tenant_notifications)
-- Ejecuta este script en el SQL Editor de Supabase.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(10) NOT NULL DEFAULT 'BOB',
  period_days INTEGER NOT NULL DEFAULT 30,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'QR Simple',
  notes TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_payments_tenant_id ON public.tenant_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_payments_paid_at ON public.tenant_payments(paid_at DESC);

CREATE TABLE IF NOT EXISTS public.tenant_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_notifications_tenant_id ON public.tenant_notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_notifications_created_at ON public.tenant_notifications(created_at DESC);

-- RLS
ALTER TABLE public.tenant_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_notifications ENABLE ROW LEVEL SECURITY;

-- SuperAdmin puede gestionar ambas tablas
DROP POLICY IF EXISTS "SuperAdmin gestiona pagos de comercios" ON public.tenant_payments;
CREATE POLICY "SuperAdmin gestiona pagos de comercios"
ON public.tenant_payments
FOR ALL
TO authenticated
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS "SuperAdmin gestiona notificaciones a comercios" ON public.tenant_notifications;
CREATE POLICY "SuperAdmin gestiona notificaciones a comercios"
ON public.tenant_notifications
FOR ALL
TO authenticated
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

-- Dueños de comercios pueden consultar sus pagos
DROP POLICY IF EXISTS "Dueño consulta sus pagos" ON public.tenant_payments;
CREATE POLICY "Dueño consulta sus pagos"
ON public.tenant_payments
FOR SELECT
TO authenticated
USING (
  tenant_id IN (
    SELECT id FROM public.tenants WHERE owner_user_id = auth.uid()
  )
);

-- Dueños de comercios pueden consultar y marcar como leídas sus notificaciones
DROP POLICY IF EXISTS "Dueño consulta sus notificaciones" ON public.tenant_notifications;
CREATE POLICY "Dueño consulta sus notificaciones"
ON public.tenant_notifications
FOR SELECT
TO authenticated
USING (
  tenant_id IN (
    SELECT id FROM public.tenants WHERE owner_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Dueño actualiza sus notificaciones" ON public.tenant_notifications;
CREATE POLICY "Dueño actualiza sus notificaciones"
ON public.tenant_notifications
FOR UPDATE
TO authenticated
USING (
  tenant_id IN (
    SELECT id FROM public.tenants WHERE owner_user_id = auth.uid()
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT id FROM public.tenants WHERE owner_user_id = auth.uid()
  )
);

-- Publicación Realtime para notificaciones al panel del negocio
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tenant_notifications;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

