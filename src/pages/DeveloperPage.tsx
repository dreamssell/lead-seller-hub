import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Settings as SettingsIcon, 
  Plug, 
  Webhook, 
  Code2, 
  ListChecks, 
  Mail, 
  Sparkles, 
  AlertCircle, 
  Play, 
  Server,
  ChevronRight,
  BookOpen,
  ArrowRightLeft,
  Zap
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import GeneralTab from '@/components/settings/GeneralTab';
import ConnectionsTab from '@/components/settings/ConnectionsTab';
import OutboundWebhooksTab from '@/components/settings/OutboundWebhooksTab';
import ApiTab from '@/components/settings/ApiTab';
import CustomFieldsTab from '@/components/settings/CustomFieldsTab';
import SmtpTab from '@/components/settings/SmtpTab';
import AiTab from '@/components/settings/AiTab';
import QuickstartTab from '@/components/settings/QuickstartTab';
import MCPServerTab from '@/components/settings/MCPServerTab';
import InboundWebhooksTab from '@/components/settings/InboundWebhooksTab';
import WavoipConfigTab from '@/components/settings/WavoipConfigTab';
import { Card } from '@/components/ui/card';
import { useNavigate, useSearchParams } from 'react-router-dom';

const TABS = [
  { value: 'ativar',      label: 'Ativar',       subtitle: 'Primeira chamada', icon: Zap,         Comp: QuickstartTab, advanced: false },
  { value: 'api',         label: 'Chaves de API', subtitle: 'Gerenciar tokens', icon: Code2,        Comp: ApiTab, advanced: true },
  { value: 'mcp',         label: 'MCP Server',   subtitle: 'ChatGPT, Claude, Cursor', icon: Server,       Comp: MCPServerTab, advanced: true },
  { value: 'wh-in',       label: 'Webhooks de entrada', subtitle: 'Receber leads externos', icon: ArrowRightLeft, Comp: InboundWebhooksTab, advanced: true },
  { value: 'wh-out',      label: 'Webhooks de saída', subtitle: 'Disparar em eventos', icon: Webhook,      Comp: OutboundWebhooksTab, advanced: true },
  { value: 'general',     label: 'Geral',        subtitle: 'Configurações base', icon: SettingsIcon, Comp: GeneralTab, advanced: false },
  { value: 'connections', label: 'Conexões',     subtitle: 'Apps terceiros', icon: Plug,         Comp: ConnectionsTab, advanced: false },
  { value: 'fields',      label: 'Campos',       subtitle: 'Dados personalizados', icon: ListChecks,   Comp: CustomFieldsTab, advanced: true },
  { value: 'smtp',        label: 'SMTP',         subtitle: 'Envio de e-mail', icon: Mail,         Comp: SmtpTab, advanced: true },
  { value: 'ai',          label: 'IA',           subtitle: 'Modelos e prompt', icon: Sparkles,     Comp: AiTab, advanced: true },
  { value: 'wavoip',      label: 'Wavoip',       subtitle: 'WhatsApp + VoIP',  icon: Phone,        Comp: WavoipConfigTab, advanced: false },
];

export default function DeveloperPage() {
  const { access } = useAuth();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'ativar';
  const [activeTab, setActiveTab] = useState(initialTab);
  const navigate = useNavigate();
  
  const isMaster = !access?.sub_company_id;
  const canCustomize = access?.allow_custom_logic;

  const visibleTabs = TABS.filter(tab => {
    if (!isMaster && !canCustomize && tab.advanced) return false;
    return true;
  });

  const CurrentComp = visibleTabs.find(t => t.value === activeTab)?.Comp || QuickstartTab;

  return (
    <AppLayout title="Developer Center" subtitle="API REST, MCP e Webhooks num só lugar.">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <aside className="w-full lg:w-72 space-y-4">
            <Card className="p-2 bg-card/50 border-border/40 backdrop-blur-sm shadow-xl rounded-2xl">
              <nav className="space-y-1">
                {visibleTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.value;
                  return (
                    <button
                      key={tab.value}
                      onClick={() => setActiveTab(tab.value)}
                      className={`w-full text-left p-3 rounded-xl transition-all flex items-center gap-3 group relative ${
                        isActive 
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' 
                        : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <div className={`p-2 rounded-lg ${isActive ? 'bg-white/20' : 'bg-secondary'}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate leading-tight">{tab.label}</p>
                        <p className={`text-[10px] truncate ${isActive ? 'text-white/70' : 'text-muted-foreground'}`}>
                          {tab.subtitle}
                        </p>
                      </div>
                      {isActive && (
                        <motion.div 
                          layoutId="active-indicator"
                          className="absolute right-3"
                          initial={{ opacity: 0, x: -5 }}
                          animate={{ opacity: 1, x: 0 }}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </motion.div>
                      )}
                    </button>
                  );
                })}

                <div className="h-px bg-border/40 my-2 mx-3" />

                <button
                  onClick={() => navigate('/docs')}
                  className="w-full text-left p-3 rounded-xl transition-all flex items-center gap-3 text-muted-foreground hover:text-foreground hover:bg-secondary group"
                >
                  <div className="p-2 rounded-lg bg-secondary">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold">Documentação</p>
                    <p className="text-[10px]">Endpoints e guias</p>
                  </div>
                  <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              </nav>
            </Card>

            {!isMaster && !canCustomize && (
              <div className="p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-amber-700">Acesso Restrito</p>
                  <p className="text-[10px] text-amber-600/80 leading-relaxed">
                    Entre em contato com o suporte para liberar acesso a customizações avançadas.
                  </p>
                </div>
              </div>
            )}
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <CurrentComp />
            </motion.div>
          </main>
        </div>
      </div>
    </AppLayout>
  );
}
