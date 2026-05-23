import { AppLayout } from '@/components/layout/AppLayout';
import { motion } from 'framer-motion';
import { Settings as SettingsIcon, Plug, Webhook, Code2, ListChecks, Mail, Sparkles } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import GeneralTab from '@/components/settings/GeneralTab';
import ConnectionsTab from '@/components/settings/ConnectionsTab';
import WebhooksTab from '@/components/settings/WebhooksTab';
import ApiTab from '@/components/settings/ApiTab';
import CustomFieldsTab from '@/components/settings/CustomFieldsTab';
import SmtpTab from '@/components/settings/SmtpTab';
import AiTab from '@/components/settings/AiTab';

const TABS = [
  { value: 'general',     label: 'Geral',     icon: SettingsIcon, Comp: GeneralTab },
  { value: 'connections', label: 'Conexões',  icon: Plug,         Comp: ConnectionsTab },
  { value: 'webhooks',    label: 'Webhooks',  icon: Webhook,      Comp: WebhooksTab },
  { value: 'api',         label: 'API',       icon: Code2,        Comp: ApiTab },
  { value: 'fields',      label: 'Campos',    icon: ListChecks,   Comp: CustomFieldsTab },
  { value: 'smtp',        label: 'SMTP',      icon: Mail,         Comp: SmtpTab },
  { value: 'ai',          label: 'IA',        icon: Sparkles,     Comp: AiTab },
];

export default function SettingsPage() {
  return (
    <AppLayout title="Configurações" subtitle="Gerencie suas integrações e configurações da plataforma">
      <motion.div
        className="max-w-6xl space-y-6"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="w-full overflow-x-auto flex-wrap h-auto justify-start bg-secondary/60 p-1 rounded-xl">
            {TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="data-[state=active]:bg-card data-[state=active]:shadow-sm">
                <Icon className="w-4 h-4 mr-2" />{label}
              </TabsTrigger>
            ))}
          </TabsList>

          {TABS.map(({ value, Comp }) => (
            <TabsContent key={value} value={value} className="mt-6">
              <Comp />
            </TabsContent>
          ))}
        </Tabs>
      </motion.div>
    </AppLayout>
  );
}
