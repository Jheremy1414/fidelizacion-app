import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Bell, CheckCircle2, Megaphone, Send, Wallet } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatBoliviaDate } from '../../utils/bolivia';

export const CampaignsPage: React.FC = () => {
  const { activeTenant, cards, campaigns, sendPushCampaign } = useApp();

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sentInfo, setSentInfo] = useState<{ sentCount: number; warning?: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!activeTenant) return null;

  const googleWalletCount = cards.filter((c) => Boolean(c.google_object_id)).length;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending || !title.trim() || !message.trim()) return;
    setSending(true);
    setErrorMsg(null);
    setSentInfo(null);
    try {
      const res = await sendPushCampaign(activeTenant.id, title, message);
      setSentInfo(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al enviar campaña');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto">
      <div>
        <h2 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
          <Megaphone className="w-6 h-6 text-[#0B4BE3]" />
          <span>Campañas Push a Google Wallet</span>
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Envía notificaciones directas a la pantalla bloqueada de tus clientes sin costo de SMS ni WhatsApp API.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 glass-card-light rounded-2xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Audiencia Google Wallet Activa
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-display text-lg font-extrabold text-slate-900">
                  {googleWalletCount} tarjetas vinculadas
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold">
                  Costo Bs 0 por envío
                </span>
              </div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-[#0B4BE3]/10 text-[#0B4BE3] flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
          </div>

          <form onSubmit={handleSend} className="space-y-4">
            {errorMsg && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Título de la notificación (máx. 80 caracteres)
              </label>
              <input
                type="text"
                maxLength={80}
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Escribe el título de tu promoción..."
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#0B4BE3]/30"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Mensaje promocional (máx. 250 caracteres)
              </label>
              <textarea
                rows={3}
                maxLength={250}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Escribe el mensaje exacto que verán tus clientes..."
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B4BE3]/30"
              />
              <div className="text-right text-[11px] text-slate-400 mt-1">
                {message.length}/250 caracteres
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              {sentInfo ? (
                <motion.div
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-xs font-bold text-emerald-600 flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    Campaña enviada ({sentInfo.sentCount} dispositivos).{' '}
                    {sentInfo.warning && <span className="font-normal text-amber-700">{sentInfo.warning}</span>}
                  </span>
                </motion.div>
              ) : (
                <span className="text-xs text-slate-400">
                  Se enviará exactamente tal como lo escribiste.
                </span>
              )}

              <button
                type="submit"
                disabled={sending}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF7A00] to-[#F59E0B] px-5 py-2.5 text-sm font-bold text-white shadow-glow-amber hover:brightness-105 disabled:opacity-60 transition"
              >
                <Send className="w-4 h-4" />
                <span>{sending ? 'Enviando...' : 'Enviar Push Ahora'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Android Lockscreen Preview */}
        <div className="lg:col-span-5 glass-card-light rounded-2xl p-6 flex flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100/80">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
            Vista Previa · Pantalla Bloqueada Android
          </div>

          <div className="w-full max-w-[300px] rounded-[2.2rem] bg-[#090D16] p-3.5 shadow-2xl border-4 border-slate-800 text-white">
            <div className="w-20 h-4 bg-black rounded-full mx-auto mb-4" />
            <div className="text-center mb-5">
              <div className="font-display text-4xl font-light tracking-tight">14:30</div>
              <div className="text-xs text-slate-400 mt-0.5">Notificación Google Wallet</div>
            </div>

            <motion.div
              key={title + message}
              initial={{ scale: 0.96, opacity: 0.7 }}
              animate={{ scale: 1, opacity: 1 }}
              className="rounded-2xl bg-white/12 backdrop-blur-md border border-white/15 p-3.5 shadow-lg"
            >
              <div className="flex items-center justify-between text-[11px] text-slate-300 mb-1.5">
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <span
                    className="h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                    style={{ backgroundColor: activeTenant.brand_color }}
                  >
                    {activeTenant.name[0]}
                  </span>
                  <span>{activeTenant.name}</span>
                </span>
                <span>ahora</span>
              </div>
              <div className="text-xs font-bold text-white leading-snug">{title || 'Título'}</div>
              <div className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                {message || 'Tu mensaje aparecerá aquí.'}
              </div>
            </motion.div>

            <div className="mt-16 flex justify-center">
              <div className="h-1 w-24 rounded-full bg-white/25" />
            </div>
          </div>
        </div>
      </div>

      {/* History */}
      <div className="glass-card-light rounded-2xl p-6">
        <h3 className="font-display text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Bell className="w-4 h-4 text-[#0B4BE3]" />
          <span>Historial de Campañas Enviadas</span>
        </h3>

        {campaigns.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">
            Aún no has enviado campañas para {activeTenant.name}.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {campaigns.map((camp) => (
              <div key={camp.id} className="py-3.5 flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-sm text-slate-900">{camp.title}</div>
                  <p className="text-xs text-slate-500 mt-0.5">{camp.message}</p>
                </div>
                <div className="flex items-center gap-4 text-xs shrink-0">
                  <span className="px-2.5 py-1 rounded-full bg-blue-50 text-[#0B4BE3] font-bold">
                    {camp.sent_count} dispositivos
                  </span>
                  <span className="text-slate-400">
                    {formatBoliviaDate(camp.created_at, {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
