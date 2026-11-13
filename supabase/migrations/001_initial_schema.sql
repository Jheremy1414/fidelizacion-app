-- ============================================================================
-- Clockops Loyalty - Esquema Oficial Multi-Tenant en Supabase
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
    CREATE TYPE program_type AS ENUM ('stamps', 'discount', 'points', 'cashback', 'subscription');
    CREATE TYPE tenant_status AS ENUM ('trial', 'active', 'past_due', 'canceled');
    CREATE TYPE tx_type AS ENUM ('earn', 'redeem', 'adjust', 'subscription_reset');
    CREATE TYPE tx_status AS ENUM ('completed', 'pending_approval', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    slug VARCHAR(60) UNIQUE NOT NULL,
    name VARCHAR(120) NOT NULL,
    logo_url TEXT,
    brand_color VARCHAR(7) DEFAULT '#0B4BE3',
    lat DECIMAL(10, 8),
    lng DECIMAL(11, 8),
    status tenant_status DEFAULT 'trial',
    trial_ends_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '14 days'),
    google_class_id VARCHAR(150),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.loyalty_programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    type program_type NOT NULL DEFAULT 'stamps',
    name VARCHAR(100) NOT NULL,
    rules JSONB NOT NULL DEFAULT '{"goal": 10, "reward": "Premio Gratis", "cooldown_hours": 4, "auto_approve": true}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id)
);

CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(30) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wallet_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    program_id UUID REFERENCES public.loyalty_programs(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
    current_balance NUMERIC(12, 2) DEFAULT 0,
    lifetime_accumulated NUMERIC(12, 2) DEFAULT 0,
    reward_available BOOLEAN DEFAULT false,
    subscription_expires_at TIMESTAMPTZ,
    last_tap_at TIMESTAMPTZ,
    google_object_id VARCHAR(150) UNIQUE,
    pwa_token UUID DEFAULT gen_random_uuid() UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, customer_id)
);

CREATE TABLE IF NOT EXISTS public.card_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID REFERENCES public.wallet_cards(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    type tx_type NOT NULL DEFAULT 'earn',
    status tx_status NOT NULL DEFAULT 'completed',
    purchase_amount NUMERIC(12, 2) DEFAULT 0,
    delta_value NUMERIC(12, 2) NOT NULL,
    balance_after NUMERIC(12, 2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketing_pushes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    title VARCHAR(80) NOT NULL,
    message VARCHAR(250) NOT NULL,
    sent_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Storage Bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('tenant-logos', 'tenant-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Logos visibles públicamente"
ON storage.objects FOR SELECT
USING (bucket_id = 'tenant-logos');

CREATE POLICY "Usuarios autenticados suben logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'tenant-logos');

-- RLS
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_pushes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública de negocios por slug" ON public.tenants FOR SELECT USING (true);
CREATE POLICY "Dueño gestiona su propio negocio" ON public.tenants FOR ALL TO authenticated USING (auth.uid() = owner_user_id);

CREATE POLICY "Lectura pública de programas" ON public.loyalty_programs FOR SELECT USING (true);
CREATE POLICY "Dueño gestiona su programa" ON public.loyalty_programs FOR ALL TO authenticated
USING (tenant_id IN (SELECT id FROM public.tenants WHERE owner_user_id = auth.uid()));

CREATE POLICY "Lectura de tarjetas" ON public.wallet_cards FOR SELECT USING (true);
CREATE POLICY "Creación y actualización de tarjetas" ON public.wallet_cards FOR ALL USING (true);

CREATE POLICY "Acceso a clientes" ON public.customers FOR ALL USING (true);
CREATE POLICY "Acceso a transacciones" ON public.card_transactions FOR ALL USING (true);
CREATE POLICY "Dueño gestiona campañas push" ON public.marketing_pushes FOR ALL TO authenticated
USING (tenant_id IN (SELECT id FROM public.tenants WHERE owner_user_id = auth.uid()));
