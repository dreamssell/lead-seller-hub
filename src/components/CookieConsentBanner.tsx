import { useEffect, useState } from 'react';
import { Cookie, X, Settings2, Shield, BarChart3, Megaphone, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';

const STORAGE_KEY = 'lgpd:consent:v1';
const CONSENT_EVENT = 'lgpd:consent-changed';

type Consent = {
  essential: true;
  analytics: boolean;
  marketing: boolean;
  ts: number;
};

export function CookieConsentBanner() {
  const [open, setOpen] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [analytics, setAnalytics] = useState(true);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  const save = (consent: Consent) => {
    let persisted = false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
      const check = localStorage.getItem(STORAGE_KEY);
      persisted = !!check && JSON.parse(check).ts === consent.ts;
    } catch {}
    setOpen(false);
    setCustomize(false);

    // Apply consent immediately to the app
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: consent }));

    const active = [
      'Essenciais',
      consent.analytics && 'Analytics',
      consent.marketing && 'Marketing',
    ]
      .filter(Boolean)
      .join(' · ');

    if (persisted) {
      toast.success('Preferências de privacidade salvas', {
        description: `Aplicado agora: ${active}`,
        icon: <CheckCircle2 className="h-4 w-4" />,
      });
    } else {
      toast.error('Não foi possível salvar suas preferências', {
        description: 'Verifique se o navegador permite armazenamento local.',
      });
    }
  };

  const acceptAll = () =>
    save({ essential: true, analytics: true, marketing: true, ts: Date.now() });
  const onlyEssential = () =>
    save({ essential: true, analytics: false, marketing: false, ts: Date.now() });
  const savePrefs = () =>
    save({ essential: true, analytics, marketing, ts: Date.now() });

  if (!open) return null;

  return (
    <>
      {/* Banner */}
      <div
        role="dialog"
        aria-label="Aviso de privacidade LGPD"
        className="fixed inset-x-0 bottom-0 z-[60] px-3 pb-3 sm:inset-auto sm:bottom-4 sm:right-4 sm:px-0 sm:pb-0 animate-fade-in"
      >
        <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl">
          <div className="flex items-start gap-3 p-4 sm:p-5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Cookie className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                  LGPD · Privacidade
                </p>
                <button
                  onClick={onlyEssential}
                  aria-label="Fechar"
                  className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <h3 className="mt-1 text-sm font-semibold text-foreground">
                Sua privacidade é prioridade
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground break-words">
                Usamos cookies essenciais para operação e cookies analíticos/marketing para
                melhorar sua experiência. Você decide. Saiba mais em nossa{' '}
                <a
                  href="/documentation#privacidade"
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  Política de Privacidade
                </a>
                .
              </p>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={onlyEssential}
                >
                  <Shield className="h-3.5 w-3.5" />
                  Apenas essenciais
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() => setCustomize(true)}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  Personalizar
                </Button>
                <Button size="sm" className="w-full sm:w-auto" onClick={acceptAll}>
                  Aceitar todos
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Customize dialog */}
      <Dialog open={customize} onOpenChange={setCustomize}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Preferências de cookies</DialogTitle>
            <DialogDescription>
              Controle quais categorias de cookies podem ser usadas nesta sessão.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <PrefRow
              icon={<Shield className="h-4 w-4" />}
              title="Essenciais"
              desc="Necessários para autenticação e funcionamento da plataforma."
              checked
              disabled
            />
            <PrefRow
              icon={<BarChart3 className="h-4 w-4" />}
              title="Analíticos"
              desc="Métricas anônimas para entender uso e melhorar a experiência."
              checked={analytics}
              onChange={setAnalytics}
            />
            <PrefRow
              icon={<Cookie className="h-4 w-4" />}
              title="Marketing"
              desc="Personalização de conteúdo e comunicações relevantes."
              checked={marketing}
              onChange={setMarketing}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={onlyEssential}>
              Apenas essenciais
            </Button>
            <Button onClick={savePrefs}>Salvar preferências</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PrefRow({
  icon,
  title,
  desc,
  checked,
  disabled,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-secondary/40 p-3">
      <div className="flex items-start gap-3 min-w-0">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}
