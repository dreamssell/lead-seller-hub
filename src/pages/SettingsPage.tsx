import { AppLayout } from '@/components/layout/AppLayout';
import { motion } from 'framer-motion';
import { Bell, Shield, Globe, Webhook, Zap, ChevronRight } from 'lucide-react';
import { useThemeContext } from '@/contexts/ThemeContext';

const settingsSections = [
  {
    title: 'Geral',
    items: [
      { icon: Globe, label: 'Dados da Empresa', description: 'Nome, logo, informações de contato' },
      { icon: Bell, label: 'Notificações', description: 'Configurar alertas e notificações push' },
      { icon: Shield, label: 'Segurança', description: 'Autenticação, senhas, 2FA' },
    ],
  },
  {
    title: 'Integrações',
    items: [
      { icon: Webhook, label: 'Webhooks', description: 'URLs de callback para eventos do sistema' },
      { icon: Zap, label: 'Automações', description: 'Fluxos automatizados e triggers' },
    ],
  },
];

export default function SettingsPage() {
  const { theme, toggleTheme } = useThemeContext();

  return (
    <AppLayout title="Configurações" subtitle="Personalize sua plataforma">
      <div className="max-w-3xl space-y-6">
        {/* Theme Toggle */}
        <motion.div
          className="glass-card p-6"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h3 className="text-sm font-semibold text-foreground mb-4">Aparência</h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">Tema da interface</p>
              <p className="text-xs text-muted-foreground">Escolha entre tema claro e escuro</p>
            </div>
            <div className="flex items-center gap-2 bg-secondary rounded-xl p-1">
              <button
                onClick={() => theme === 'dark' && toggleTheme()}
                className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                  theme === 'light' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                Claro
              </button>
              <button
                onClick={() => theme === 'light' && toggleTheme()}
                className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                  theme === 'dark' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                Escuro
              </button>
            </div>
          </div>
        </motion.div>

        {/* Settings Sections */}
        {settingsSections.map((section, si) => (
          <motion.div
            key={section.title}
            className="glass-card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: si * 0.1 }}
          >
            <div className="px-6 py-4 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
            </div>
            <div className="divide-y divide-border">
              {section.items.map((item) => (
                <button
                  key={item.label}
                  className="w-full flex items-center gap-4 px-6 py-4 hover:bg-secondary/30 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <item.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </AppLayout>
  );
}
