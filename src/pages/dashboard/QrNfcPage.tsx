import React from 'react';
import { Printer, QrCode, ShieldCheck, Smartphone, Sparkles, Wifi } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { PoweredByBlockOps } from '../../components/brand/BlockOpsLogo';
import { useApp } from '../../context/AppContext';
import { getPublicTapUrl } from '../../lib/supabase';
import { LOYALTY_PLANS_META } from '../../types/loyalty';

export const QrNfcPage: React.FC = () => {
  const { activeTenant } = useApp();

  if (!activeTenant || !activeTenant.program) return null;

  const tapUrl = getPublicTapUrl(activeTenant.slug);
  const planMeta = LOYALTY_PLANS_META[activeTenant.program.type];

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <QrCode className="w-6 h-6 text-[#0B4BE3]" />
            <span>Póster de Mostrador</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Imprime tu póster de caja con el símbolo de acerca tu celular y tu código QR oficial.
          </p>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#0EA5E9] to-[#0B4BE3] px-4 py-2.5 text-xs font-bold text-white shadow-glow-cobalt hover:brightness-105 transition"
        >
          <Printer className="w-4 h-4" />
          <span>Imprimir Póster de Mostrador</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Printable Poster */}
        <div className="lg:col-span-6 flex justify-center">
          <div
            id="printable-qr-poster"
            className="w-full max-w-[440px] rounded-[2rem] bg-white border border-slate-200 shadow-2xl overflow-hidden text-center"
          >
            <div
              style={{
                background: `linear-gradient(135deg, ${activeTenant.brand_color} 0%, #090D16 125%)`,
              }}
              className="px-6 py-7 text-white relative overflow-hidden"
            >
              <div className="relative z-10 flex flex-col items-center">
                <div className="h-16 w-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/30 flex items-center justify-center overflow-hidden shadow-lg mb-3">
                  {activeTenant.logo_url ? (
                    <img src={activeTenant.logo_url} alt={activeTenant.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="font-display text-2xl font-extrabold">
                      {activeTenant.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <h3 className="font-display text-2xl font-extrabold tracking-tight">{activeTenant.name}</h3>
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1 text-xs font-bold">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>{activeTenant.program.rules.reward}</span>
                </div>
              </div>
            </div>

            <div className="p-7 bg-white">
              {/* Acerca tu celular badge / contactless visual */}
              <div className="mx-auto mb-5 max-w-[270px] rounded-2xl bg-slate-950 text-white px-4 py-3 flex items-center justify-center gap-3 shadow-lg">
                <div className="relative h-10 w-10 rounded-xl bg-[#0EA5E9]/20 border border-[#0EA5E9]/40 flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5 text-[#38BDF8]" />
                  <Wifi className="w-3.5 h-3.5 text-[#FF7A00] rotate-90 absolute -right-1 -top-1" />
                </div>
                <div className="text-left">
                  <div className="text-xs font-extrabold tracking-wide uppercase text-white">
                    Acerca tu celular
                  </div>
                  <div className="text-[10px] font-medium text-slate-300">
                    O escanea el código QR abajo
                  </div>
                </div>
              </div>

              <div className="inline-flex p-4 rounded-3xl bg-white border-2 border-slate-100 shadow-[0_12px_35px_-12px_rgba(11,75,227,0.25)]">
                <QRCodeSVG value={tapUrl} size={205} level="H" fgColor="#090D16" bgColor="#FFFFFF" />
              </div>

              <div className="mt-6 grid grid-cols-3 gap-2 text-[11px] font-semibold text-slate-600">
                <div className="rounded-xl bg-slate-50 p-2.5">
                  <span className="text-[#0B4BE3] font-extrabold block text-sm">1</span>
                  <span>Acerca o escanea</span>
                </div>
                <div className="rounded-xl bg-slate-50 p-2.5">
                  <span className="text-[#0B4BE3] font-extrabold block text-sm">2</span>
                  <span>Registra tus datos</span>
                </div>
                <div className="rounded-xl bg-slate-50 p-2.5">
                  <span className="text-[#FF7A00] font-extrabold block text-sm">3</span>
                  <span>¡Gana al instante!</span>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span>{planMeta.name}</span>
                <PoweredByBlockOps />
              </div>
            </div>
          </div>
        </div>

        {/* Counter Guidance */}
        <div className="lg:col-span-6 space-y-5 print:hidden">
          <div className="glass-card-light rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="h-10 w-10 rounded-xl bg-[#0B4BE3]/10 text-[#0B4BE3] flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Sticker y Mostrador Oficial BlockOps
                </h3>
                <p className="text-xs text-slate-500">
                  Servicio administrado y configurado por nuestro equipo técnico.
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-4 text-xs text-slate-600 space-y-2 leading-relaxed">
              <p>
                • Coloca el póster impreso en un lugar visible junto a la caja para que tus clientes
                puedan acercar su celular o escanear el código QR al momento de pagar.
              </p>
              <p>
                • Los stickers NFC físicos con la insignia de <strong className="text-slate-900">Acerca tu celular</strong> son
                provisionados y activados directamente por el equipo de BlockOps Loyalty para tu local.
              </p>
            </div>

            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-2.5 text-xs font-semibold text-emerald-800">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Validación GPS activa: tus clientes deben encontrarse dentro del local para registrar visitas.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
