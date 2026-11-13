# BlockOps Loyalty

Plataforma SaaS Multi-Tenant 100% Serverless para fidelización de comercios mediante **Google Wallet** (nativo) y **Web Pass PWA** (iOS), operada con **NFC Tap-to-Earn** y **Códigos QR** en mostrador.

## Rutas Oficiales
- `/` — Landing Page oficial de BlockOps Loyalty
- `/login` y `/registro` — Acceso y creación de cuenta empresarial
- `/onboarding` — Registro de negocio en 3 pasos con **Prueba Gratis de 14 días**
- `/dashboard` — Dashboard del Comercio (KPIs reales, gráfica de actividad y bandeja Realtime de aprobaciones)
- `/dashboard/customers` — CRM de Clientes (`wallet_cards` + `customers`)
- `/dashboard/campaigns` — Campañas Push gratuitas a Google Wallet (`marketing_pushes`)
- `/dashboard/qr-nfc` — Póster QR imprimible + URL para grabar stickers en NFC Tools
- `/dashboard/settings` — Configuración de marca, motor, cooldown y GPS Geofencing
- `/tap/:slug` — Vista móvil ultrarrápida para el cliente final (NFC / QR)
- `/admin` — Panel SuperAdmin BlockOps (Modo Oscuro Ejecutivo)

## Configuración Rápida en Producción
1. Copia `.env.example` a `.env` y coloca tus credenciales de Supabase:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_SUPERADMIN_EMAIL` (tu correo de administrador SaaS, p. ej. `catflowborja@gmail.com`)
2. En el SQL Editor de Supabase (si ya corriste `001` y `002`), ejecuta:
   - `supabase/migrations/003_superadmin_setup.sql` (activa `catflowborja@gmail.com` como SuperAdmin en `public.superadmins`, `auth.users` e `is_superadmin()`).
   - `supabase/migrations/004_tenant_owner_email_and_claiming.sql` (vinculación automática por correo para comercios creados en frío).
3. Configura los secretos de Google Wallet y despliega la Edge Function unificada `wallet-pass`:
```bash
supabase secrets set \
  GOOGLE_WALLET_ISSUER_ID="TU_ISSUER_ID" \
  GOOGLE_WALLET_CLIENT_EMAIL="tu-service-account@proyecto.iam.gserviceaccount.com" \
  GOOGLE_WALLET_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

supabase functions deploy wallet-pass --no-verify-jwt
```
4. Compila y despliega en Cloudflare Pages (`npm run build`, carpeta `dist/`).
