import { AppLayout } from '@/components/layout/AppLayout';
import { motion } from 'framer-motion';
import { Settings as SettingsIcon, Plug, Webhook, Code2, ListChecks, Mail, Sparkles, AlertCircle, Play, Server } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import GeneralTab from '@/components/settings/GeneralTab';
import ConnectionsTab from '@/components/settings/ConnectionsTab';
import WebhooksTab from '@/components/settings/WebhooksTab';
import ApiTab from '@/components/settings/ApiTab';
import CustomFieldsTab from '@/components/settings/CustomFieldsTab';
import SmtpTab from '@/components/settings/SmtpTab';
import AiTab from '@/components/settings/AiTab';
import QuickstartTab from '@/components/settings/QuickstartTab';
import MCPServerTab from '@/components/settings/MCPServerTab';

const TABS = [
  { value: 'ativar',      label: 'Ativar',    icon: Play,         Comp: QuickstartTab, advanced: false },
  { value: 'general',     label: 'Geral',     icon: SettingsIcon, Comp: GeneralTab, advanced: false },
  { value: 'connections', label: 'Conexões',  icon: Plug,         Comp: ConnectionsTab, advanced: false },
  { value: 'webhooks',    label: 'Webhooks',  icon: Webhook,      Comp: WebhooksTab, advanced: true },
  { value: 'api',         label: 'API',       icon: Code2,        Comp: ApiTab, advanced: true },
  { value: 'fields',      label: 'Campos',    icon: ListChecks,   Comp: CustomFieldsTab, advanced: true },
  { value: 'smtp',        label: 'SMTP',      icon: Mail,         Comp: SmtpTab, advanced: true },
  { value: 'ai',          label: 'IA',        icon: Sparkles,     Comp: AiTab, advanced: true },
];

export default function DeveloperPage() {
  const { access } = useAuth();
  const isMaster = !access?.sub_company_id;
  const canCustomize = access?.allow_custom_logic;

  const visibleTabs = TABS.filter(tab => {
    if (!isMaster && !canCustomize && tab.advanced) return false;
    return true;
  });

  return (
    <AppLayout title="Developer Center" subtitle="Gerencie suas integrações técnicas e webhooks">
      <motion.div
        className="max-w-6xl space-y-6"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {!isMaster && !canCustomize && (
          <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-700">Acesso Restrito</p>
              <p className="text-xs text-amber-600/80">
                Sua conta está configurada no modo padrão herdado da matriz. 
                Entre em contato com o suporte caso precise de acesso a customizações avançadas (API, Webhooks, IA).
              </p>
            </div>
          </div>
        )}

        <Tabs defaultValue="ativar" className="w-full">
          <TabsList className="w-full overflow-x-auto flex-wrap h-auto justify-start bg-secondary/60 p-1 rounded-xl">
            {visibleTabs.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="data-[state=active]:bg-card data-[state=active]:shadow-sm">
                <Icon className="w-4 h-4 mr-2" />{label}
              </TabsTrigger>
            ))}
          </TabsList>

          {visibleTabs.map(({ value, Comp }) => (
            <TabsContent key={value} value={value} className="mt-6">
              <Comp />
            </TabsContent>
          ))}
        </Tabs>
      </motion.div>
    </AppLayout>
  );
}
