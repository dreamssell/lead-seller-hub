// Public landing page rendered at /p/:slug — anyone can access, no auth required.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

type Btn = any;
type Page = any;

const SHAPE_CLASS: Record<string, string> = { rounded: 'rounded-md', square: 'rounded-none', pill: 'rounded-full' };
const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/landing-capture`;

export default function PublicLandingPage() {
  const { slug } = useParams();
  const [page, setPage] = useState<Page | null>(null);
  const [buttons, setButtons] = useState<Btn[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [showForm, setShowForm] = useState<Btn | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: p } = await supabase.from('landing_pages').select('*').eq('slug', slug).eq('status', 'published').maybeSingle();
      if (!p) { setNotFound(true); return; }
      const { data: b } = await supabase.from('landing_buttons').select('*').eq('page_id', p.id).order('sort_order');
      setPage(p); setButtons((b as any) || []);
      // log view
      fetch(FUNCTION_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_id: p.id, type: 'view', referrer: document.referrer, user_agent: navigator.userAgent }),
      }).catch(() => null);
    })();
  }, [slug]);

  if (notFound) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Página não encontrada.</div>;
  if (!page) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>;

  const handleClick = async (btn: Btn) => {
    if (page.form_mode === 'simple' || page.form_mode === 'full' || btn.action_type === 'form') {
      setShowForm(btn); return;
    }
    await fetch(FUNCTION_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page_id: page.id, button_id: btn.id, type: 'click', referrer: document.referrer, user_agent: navigator.userAgent }),
    }).catch(() => null);
    if (btn.url) window.location.href = btn.url;
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;
    setSubmitting(true);
    await fetch(FUNCTION_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page_id: page.id, button_id: showForm?.id, type: 'lead',
        lead: form, referrer: document.referrer, user_agent: navigator.userAgent,
      }),
    }).catch(() => null);
    setSubmitting(false);
    setDone(true);
    if (showForm?.url) setTimeout(() => { window.location.href = showForm.url; }, 800);
  };

  const align = page.align === 'left' ? 'items-start text-left' : page.align === 'right' ? 'items-end text-right' : 'items-center text-center';

  return (
    <div className={`min-h-screen flex flex-col justify-center ${align} px-6 py-12`} style={{ background: page.page_bg_color, color: page.text_color }}>
      <div className="w-full max-w-md space-y-4">
        {page.headline && <h1 className="text-3xl md:text-4xl font-bold leading-tight">{page.headline}</h1>}
        {page.subheadline && <p className="text-base md:text-lg opacity-90 whitespace-pre-line">{page.subheadline}</p>}

        {!showForm && (
          <div className="space-y-2 pt-4">
            {buttons.map(b => (
              <button key={b.id} onClick={() => handleClick(b)}
                className={`w-full py-3 px-5 font-semibold transition-opacity hover:opacity-90 ${SHAPE_CLASS[b.shape] || 'rounded-md'}`}
                style={{ background: b.bg_color, color: b.text_color }}>
                {b.label}
              </button>
            ))}
          </div>
        )}

        {showForm && !done && (
          <form onSubmit={submitForm} className="space-y-3 pt-4 text-left">
            <input required placeholder="Seu nome" className="w-full px-4 py-3 rounded-md text-foreground bg-white/95"
              value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <input required placeholder="Telefone / WhatsApp" className="w-full px-4 py-3 rounded-md text-foreground bg-white/95"
              value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            {page.form_mode === 'full' && (
              <>
                <input type="email" placeholder="E-mail" className="w-full px-4 py-3 rounded-md text-foreground bg-white/95"
                  value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                <textarea placeholder="Mensagem" rows={3} className="w-full px-4 py-3 rounded-md text-foreground bg-white/95"
                  value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} />
              </>
            )}
            <button disabled={submitting} type="submit"
              className={`w-full py-3 px-5 font-semibold ${SHAPE_CLASS[showForm.shape] || 'rounded-md'}`}
              style={{ background: showForm.bg_color, color: showForm.text_color }}>
              {submitting ? 'Enviando...' : showForm.label}
            </button>
            <button type="button" onClick={() => setShowForm(null)} className="w-full text-xs opacity-70 underline">Cancelar</button>
          </form>
        )}

        {done && <p className="pt-4 text-base">Obrigado! Em instantes nossa equipe entra em contato.</p>}
      </div>
    </div>
  );
}
