import { Link } from 'react-router-dom';
import { Camera, ChevronRight, Settings2, MessageSquare, TrendingUp } from 'lucide-react';

const sections = [
  {
    title: 'Instagram Business',
    items: [{
      icon: <Instagram className="w-6 h-6 text-pink-500" />,
      name: 'Instagram Business',
      tags: ['MENSAGENS & COMENTÁRIOS'],
      desc: 'Conecte contas do Instagram para automações de comentários e DMs',
      cta: 'Gerenciar Instagram',
      to: '/whatsapp',
    }],
  },
  {
    title: 'WhatsApp Business',
    items: [{
      icon: <MessageSquare className="w-6 h-6 text-emerald-500" />,
      name: 'Conexões WhatsApp',
      tags: ['UAZ API', 'API OFICIAL'],
      desc: 'Gerencie todas as suas conexões WhatsApp em um só lugar (UAZ e API Oficial)',
      cta: 'Gerenciar Conexões',
      to: '/whatsapp',
      primary: true,
    }],
  },
  {
    title: 'Meta Ads & Conversões',
    items: [{
      icon: <TrendingUp className="w-6 h-6 text-blue-500" />,
      name: 'Conversion Events',
      tags: ['META ADS'],
      desc: 'Rastreie eventos de conversão do WhatsApp para otimização de anúncios',
      cta: 'Configurar Conversões',
      to: '#',
    }],
  },
];

export default function ConnectionsTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">Integrações</h2>
        <p className="text-xs text-muted-foreground">Conecte suas contas para receber e responder mensagens</p>
      </div>

      {sections.map((sec) => (
        <div key={sec.title}>
          <h3 className="text-sm font-semibold text-foreground mb-3">{sec.title}</h3>
          {sec.items.map((it) => (
            <div key={it.name} className="glass-card p-5 hover:border-primary/40 transition-all">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                    {it.icon}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-semibold text-foreground">{it.name}</span>
                      {it.tags.map((t) => (
                        <span key={t} className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground font-medium">{t}</span>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">{it.desc}</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
              <Link
                to={it.to}
                className={`mt-4 flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-medium transition-all ${
                  it.primary
                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                    : 'border border-border hover:bg-secondary text-foreground'
                }`}
              >
                <Settings2 className="w-4 h-4" />{it.cta}
              </Link>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
