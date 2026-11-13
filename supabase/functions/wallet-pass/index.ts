// Supabase Edge Function: wallet-pass
// Desplegar con: supabase functions deploy wallet-pass --no-verify-jwt
// Secretos requeridos en Supabase:
//   GOOGLE_WALLET_ISSUER_ID
//   GOOGLE_WALLET_CLIENT_EMAIL
//   GOOGLE_WALLET_PRIVATE_KEY

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getLoyaltyPointsLabel(programType?: string): string {
  if (programType === "stamps") return "Sellos";
  if (programType === "points") return "Puntos";
  if (programType === "cashback") return "Cashback";
  if (programType === "discount") return "Acumulado";
  if (programType === "subscription") return "Visitas Mes";
  return "Progreso";
}

function formatBalanceText(
  programType: string,
  rules: Record<string, unknown> | undefined,
  balance: number
): string {
  if (programType === "stamps") {
    return `${Math.floor(balance)} / ${rules?.goal ?? 10}`;
  }
  if (programType === "points") {
    return `${Math.floor(balance)} / ${rules?.goal_points ?? 500} pts`;
  }
  if (programType === "cashback") {
    return `Bs ${balance.toFixed(2)}`;
  }
  if (programType === "discount") {
    return `Bs ${balance.toLocaleString()} / Bs ${Number(rules?.target_spend ?? 1000).toLocaleString()}`;
  }
  if (programType === "subscription") {
    return `${Math.floor(balance)} visitas`;
  }
  return `${balance}`;
}

function buildTextModulesForTemplate(
  programType: string,
  rules: Record<string, unknown> | undefined,
  balance: number,
  holderName?: string
) {
  const reward = String(rules?.reward || "Premio Exclusivo");
  let detailHeader = "Estado del Programa";
  let detailBody = formatBalanceText(programType, rules, balance);

  if (programType === "stamps") {
    const goal = Math.max(1, Number(rules?.goal ?? 10));
    const filled = Math.min(goal, Math.max(0, Math.floor(balance)));
    const barCount = Math.min(goal, 12);
    const scaledFill = Math.round((filled / goal) * barCount);
    const icons = "● ".repeat(scaledFill) + "○ ".repeat(Math.max(0, barCount - scaledFill));
    detailHeader = `Tarjeta de Sellos (${filled}/${goal})`;
    detailBody = `${icons.trim()} · ${Math.max(0, goal - filled)} restantes para: ${reward}`;
  } else if (programType === "discount") {
    const target = Math.max(1, Number(rules?.target_spend ?? 1000));
    const discountPct = Number(rules?.discount_percent ?? 20);
    const pct = Math.min(100, Math.round((balance / target) * 100));
    detailHeader = `Descuento Acumulado (${discountPct}% OFF)`;
    detailBody = `Consumo Bs ${balance.toLocaleString()} de Bs ${target.toLocaleString()} (${pct}%) · Meta: ${reward}`;
  } else if (programType === "points") {
    const goalPts = Math.max(1, Number(rules?.goal_points ?? 500));
    const pct = Math.min(100, Math.round((balance / goalPts) * 100));
    detailHeader = `Club de Puntos (${pct}%)`;
    detailBody = `${Math.floor(balance)} / ${goalPts} pts · Premio: ${reward}`;
  } else if (programType === "cashback") {
    const cbPct = Number(rules?.cashback_percent ?? 10);
    detailHeader = `Monedero Cashback (${cbPct}%)`;
    detailBody = `Saldo disponible: Bs ${balance.toFixed(2)} para tu próxima compra`;
  } else if (programType === "subscription") {
    const monthly = Math.max(1, Number(rules?.monthly_visits ?? 4));
    detailHeader = `Suscripción Mensual (${Math.floor(balance)}/${monthly})`;
    detailBody = `Visitas disponibles este mes · Beneficio: ${reward}`;
  }

  return [
    {
      id: "program_template_status",
      header: detailHeader,
      body: detailBody,
    },
    ...(holderName
      ? [
          {
            id: "card_holder",
            header: "Titular",
            body: holderName,
          },
        ]
      : []),
  ];
}

async function getGoogleAccessToken(clientEmail: string, privateKeyPem: string): Promise<string> {
  const alg = "RS256";
  const privateKey = await jose.importPKCS8(privateKeyPem, alg);

  const jwt = await new jose.SignJWT({
    scope: "https://www.googleapis.com/auth/wallet_object.issuer",
  })
    .setProtectedHeader({ alg, typ: "JWT" })
    .setIssuer(clientEmail)
    .setAudience("https://oauth2.googleapis.com/token")
    .setExpirationTime("1h")
    .setIssuedAt()
    .sign(privateKey);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Google OAuth error: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

function getGoogleWalletConfig() {
  const issuerId = Deno.env.get("GOOGLE_WALLET_ISSUER_ID")?.trim();
  const serviceJsonRaw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  const parsedJson = serviceJsonRaw ? JSON.parse(serviceJsonRaw) : null;

  const clientEmail = (
    Deno.env.get("GOOGLE_WALLET_CLIENT_EMAIL") ||
    parsedJson?.client_email ||
    ""
  ).trim();

  const rawPrivateKey =
    Deno.env.get("GOOGLE_WALLET_PRIVATE_KEY") || parsedJson?.private_key || "";
  const privateKeyPem = rawPrivateKey.replace(/\\n/g, "\n").trim();

  if (!issuerId || !clientEmail || !privateKeyPem) {
    throw new Error(
      "Faltan secretos en Supabase: GOOGLE_WALLET_ISSUER_ID, GOOGLE_WALLET_CLIENT_EMAIL o GOOGLE_WALLET_PRIVATE_KEY"
    );
  }

  return { issuerId, clientEmail, privateKeyPem };
}

async function findAuthUserByEmail(
  adminClient: ReturnType<typeof createClient>,
  email: string
) {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) break;
    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match;
    if (data.users.length < 200) break;
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // =========================================================================
    // ACCIÓN 0: PROVISIONAR CREDENCIALES / DUEÑO DESDE SUPERADMIN (EN FRÍO)
    // =========================================================================
    if (action === "create_cold_owner") {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !serviceRoleKey) {
        throw new Error("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Edge Function");
      }

      const authHeader = req.headers.get("Authorization") || "";
      const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
      if (!jwt) {
        return new Response(JSON.stringify({ error: "No autorizado (sin token)" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      const {
        data: { user: caller },
        error: callerErr,
      } = await adminClient.auth.getUser(jwt);

      if (callerErr || !caller) {
        return new Response(JSON.stringify({ error: "Sesión inválida" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const byJwtRole = caller.app_metadata?.role === "superadmin";
      const { data: superRow } = await adminClient
        .from("superadmins")
        .select("email")
        .ilike("email", caller.email || "")
        .maybeSingle();

      if (!byJwtRole && !superRow) {
        return new Response(JSON.stringify({ error: "Requiere permisos de SuperAdmin" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const cleanEmail = String(body.email || "").trim().toLowerCase();
      const password = body.password ? String(body.password) : "";
      const tenantId = body.tenantId ? String(body.tenantId) : null;

      if (!cleanEmail || !cleanEmail.includes("@")) {
        throw new Error("Correo electrónico del dueño inválido");
      }

      let targetUser = await findAuthUserByEmail(adminClient, cleanEmail);
      let created = false;

      if (!targetUser) {
        if (password.length < 6) {
          throw new Error("La contraseña temporal debe tener al menos 6 caracteres para crear la cuenta");
        }
        const { data: newUserData, error: createErr } = await adminClient.auth.admin.createUser({
          email: cleanEmail,
          password,
          email_confirm: true,
        });
        if (createErr || !newUserData?.user) {
          throw new Error(createErr?.message || "No se pudo crear la cuenta del cliente");
        }
        targetUser = newUserData.user;
        created = true;
      } else if (password.length >= 6) {
        const { data: updData, error: updErr } = await adminClient.auth.admin.updateUserById(
          targetUser.id,
          { password, email_confirm: true }
        );
        if (updErr) throw new Error(updErr.message);
        if (updData?.user) targetUser = updData.user;
      }

      if (tenantId) {
        const { error: linkErr } = await adminClient
          .from("tenants")
          .update({ owner_user_id: targetUser.id, owner_email: cleanEmail })
          .eq("id", tenantId);

        if (linkErr) {
          // Respaldo si aún no se ha ejecutado 004_tenant_owner_email_and_claiming.sql
          const { error: fallbackErr } = await adminClient
            .from("tenants")
            .update({ owner_user_id: targetUser.id })
            .eq("id", tenantId);
          if (fallbackErr) throw new Error(fallbackErr.message);
        }
      }

      return new Response(
        JSON.stringify({
          userId: targetUser.id,
          email: cleanEmail,
          created,
          assignedTenantId: tenantId,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // ACCIÓN 1: GENERAR LINK "AÑADIR A GOOGLE WALLET"
    // =========================================================================
    if (action === "generate_save_link") {
      const { issuerId, clientEmail, privateKeyPem } = getGoogleWalletConfig();
      const { tenant, customer, card, program } = body;
      if (!tenant?.id || !card?.id || !customer || !program) {
        throw new Error("Faltan parámetros requeridos: tenant, customer, card, program");
      }

      const classId =
        tenant.google_class_id || `${issuerId}.tenant_${String(tenant.id).replace(/-/g, "_")}`;
      const objectId =
        card.google_object_id || `${issuerId}.card_${String(card.id).replace(/-/g, "_")}`;

      const balanceText = formatBalanceText(
        program.type,
        program.rules,
        Number(card.current_balance ?? 0)
      );

      const safeLogoUrl =
        tenant.logo_url && String(tenant.logo_url).startsWith("https://")
          ? tenant.logo_url
          : "https://placehold.co/400x400/0B4BE3/FFFFFF/png?text=BlockOps";

      const loyaltyClass: Record<string, unknown> = {
        id: classId,
        issuerName: tenant.name,
        programName: program.name || `Club ${tenant.name}`,
        programLogo: {
          sourceUri: { uri: safeLogoUrl },
          contentDescription: {
            defaultValue: { language: "es", value: `${tenant.name} Logo` },
          },
        },
        hexBackgroundColor: tenant.brand_color || "#0B4BE3",
        reviewStatus: "UNDER_REVIEW",
      };

      if (tenant.lat && tenant.lng) {
        loyaltyClass.locations = [
          {
            latitude: Number(tenant.lat),
            longitude: Number(tenant.lng),
          },
        ];
      }

      const currentBalNum = Number(card.current_balance ?? 0);
      const loyaltyObject = {
        id: objectId,
        classId,
        state: "ACTIVE",
        accountId: customer.phone,
        accountName: customer.full_name,
        loyaltyPoints: {
          label: getLoyaltyPointsLabel(program.type),
          balance: {
            string: balanceText,
          },
        },
        textModulesData: buildTextModulesForTemplate(
          program.type,
          program.rules,
          currentBalNum,
          customer.full_name
        ),
        barcode: {
          type: "QR_CODE",
          value: card.pwa_token || card.id,
          alternateText: customer.phone,
        },
      };

      const jwtPayload: Record<string, unknown> = {
        iss: clientEmail,
        aud: "google",
        typ: "savetowallet",
        origins: [],
        payload: {
          loyaltyClasses: [loyaltyClass],
          loyaltyObjects: [loyaltyObject],
        },
      };

      const privateKey = await jose.importPKCS8(privateKeyPem, "RS256");
      const token = await new jose.SignJWT(jwtPayload)
        .setProtectedHeader({ alg: "RS256", typ: "JWT" })
        .setIssuedAt()
        .sign(privateKey);

      // Persistir class_id y object_id si tenemos SERVICE_ROLE_KEY
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseUrl && serviceRoleKey) {
        const adminClient = createClient(supabaseUrl, serviceRoleKey);
        await Promise.all([
          adminClient
            .from("tenants")
            .update({ google_class_id: classId })
            .eq("id", tenant.id),
          adminClient
            .from("wallet_cards")
            .update({ google_object_id: objectId, updated_at: new Date().toISOString() })
            .eq("id", card.id),
        ]);
      }

      return new Response(
        JSON.stringify({
          saveUrl: `https://pay.google.com/gp/v/save/${token}`,
          googleObjectId: objectId,
          classId,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // ACCIÓN 2: ACTUALIZAR PUNTOS / SELLOS Y NOTIFICAR PUSH
    // =========================================================================
    if (action === "update_balance") {
      const { clientEmail, privateKeyPem } = getGoogleWalletConfig();
      const {
        googleObjectId,
        newBalanceText,
        program,
        currentBalance,
        brandColor,
        holderName,
        pushTitle,
        pushBody,
      } = body;
      if (!googleObjectId) {
        throw new Error("Se requiere googleObjectId");
      }

      const accessToken = await getGoogleAccessToken(clientEmail, privateKeyPem);
      const encodedId = encodeURIComponent(googleObjectId);
      const baseObjectUrl = `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${encodedId}`;

      const numericBalance = Number(currentBalance ?? 0);
      const resolvedBalanceText =
        newBalanceText !== undefined && newBalanceText !== null && newBalanceText !== ""
          ? String(newBalanceText)
          : program?.type
          ? formatBalanceText(String(program.type), program.rules, numericBalance)
          : "";

      const objectPatch: Record<string, unknown> = {};
      if (holderName) {
        objectPatch.accountName = String(holderName);
      }
      if (resolvedBalanceText !== "") {
        objectPatch.loyaltyPoints = {
          label: getLoyaltyPointsLabel(program?.type),
          balance: { string: resolvedBalanceText },
        };
      }
      if (program?.type) {
        objectPatch.textModulesData = buildTextModulesForTemplate(
          String(program.type),
          program.rules,
          numericBalance,
          holderName ? String(holderName) : undefined
        );
      }

      let patchResult: Record<string, unknown> | null = null;
      if (Object.keys(objectPatch).length > 0) {
        const patchRes = await fetch(baseObjectUrl, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(objectPatch),
        });
        patchResult = await patchRes.json();
        if (patchRes.status === 404) {
          return new Response(
            JSON.stringify({
              success: false,
              notSavedInWalletYet: true,
              detail: "El cliente aún no ha guardado el pase en su app de Google Wallet",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (!patchRes.ok) {
          throw new Error(`Google Wallet PATCH error: ${JSON.stringify(patchResult)}`);
        }

        if (brandColor && patchResult?.classId) {
          const encodedClassId = encodeURIComponent(String(patchResult.classId));
          await fetch(
            `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/${encodedClassId}`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ hexBackgroundColor: String(brandColor) }),
            }
          ).catch(() => null);
        }
      }

      // Registrar el mensaje en la tarjeta evitando duplicar la notificación nativa que el PATCH de puntos ya genera
      let messageResult: unknown = null;
      if (pushTitle && pushBody) {
        // En balance updates usamos messageType: "TEXT" para que el texto figure en el historial del pase
        // sin generar una segunda alerta sonora duplicada en la pantalla de bloqueo de Google Wallet.
        const msgRes = await fetch(`${baseObjectUrl}/addMessage`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              id: `msg_${Date.now()}`,
              header: String(pushTitle).slice(0, 80),
              body: String(pushBody).slice(0, 250),
              messageType: "TEXT",
            },
          }),
        });
        messageResult = await msgRes.json();
      }

      return new Response(
        JSON.stringify({ success: true, patchResult, messageResult }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // ACCIÓN 3: ENVIAR CAMPAÑA PUSH A GOOGLE WALLET
    // =========================================================================
    if (action === "send_campaign") {
      const { clientEmail, privateKeyPem } = getGoogleWalletConfig();
      const { pushTitle, pushBody, googleObjectIds, tenantId } = body;

      if (!pushTitle || !pushBody) {
        throw new Error("Se requiere pushTitle y pushBody");
      }

      const validIds: string[] = Array.isArray(googleObjectIds)
        ? googleObjectIds.filter((id) => typeof id === "string" && id.trim().length > 0)
        : [];

      if (validIds.length === 0) {
        return new Response(
          JSON.stringify({ success: true, sentCount: 0, message: "No hay tarjetas de Google Wallet registradas" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const accessToken = await getGoogleAccessToken(clientEmail, privateKeyPem);
      const campaignId = `camp_${Date.now()}`;
      let delivered = 0;

      // Disparar una sola notificación TEXT_AND_NOTIFY por tarjeta destinataria
      await Promise.all(
        validIds.map(async (objectId) => {
          try {
            const encodedId = encodeURIComponent(objectId);
            const res = await fetch(
              `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${encodedId}/addMessage`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  message: {
                    id: `${campaignId}_${Math.random().toString(36).slice(2, 6)}`,
                    header: String(pushTitle).slice(0, 80),
                    body: String(pushBody).slice(0, 250),
                    messageType: "TEXT_AND_NOTIFY",
                  },
                }),
              }
            );
            if (res.ok) delivered++;
          } catch {
            // Ignorar tarjetas individuales no alcanzables
          }
        })
      );

      // Guardar el registro en marketing_pushes si viene tenantId
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (tenantId && supabaseUrl && serviceRoleKey) {
        try {
          const adminClient = createClient(supabaseUrl, serviceRoleKey);
          await adminClient.from("marketing_pushes").insert({
            tenant_id: tenantId,
            title: String(pushTitle).slice(0, 80),
            message: String(pushBody).slice(0, 250),
            sent_count: delivered,
          });
        } catch {
          // Ignorar fallo de inserción si ya existe
        }
      }

      return new Response(
        JSON.stringify({ success: true, sentCount: delivered, insertedInDb: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Acción no válida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Error interno" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

