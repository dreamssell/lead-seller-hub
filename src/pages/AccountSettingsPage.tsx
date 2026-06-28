import { AppLayout } from '@/components/layout/AppLayout';
import { motion } from 'framer-motion';
import { UserCircle, Building2, ShieldCheck } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ProfileTab from '@/components/settings/ProfileTab';
import CompanyTab from '@/components/settings/CompanyTab';
import SecurityTab from '@/components/settings/SecurityTab';

export default function AccountSettingsPage() {
  return (
    <AppLayout title="Configurações" subtitle="Gerencie seus dados pessoais e da sua empresa">
      <motion.div
        className="max-w-4xl space-y-6"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="w-full h-auto p-1 bg-secondary/60 rounded-xl justify-start gap-1">
            <TabsTrigger
              value="profile"
              className="data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-lg py-2"
            >
              <UserCircle className="w-4 h-4 mr-2" />
              Dados do Perfil
            </TabsTrigger>
            <TabsTrigger
              value="company"
              className="data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-lg py-2"
            >
              <Building2 className="w-4 h-4 mr-2" />
              Dados da Empresa
            </TabsTrigger>
            <TabsTrigger
              value="security"
              className="data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-lg py-2"
            >
              <ShieldCheck className="w-4 h-4 mr-2" />
              Segurança
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-6">
            <ProfileTab />
          </TabsContent>
          <TabsContent value="company" className="mt-6">
            <CompanyTab />
          </TabsContent>
          <TabsContent value="security" className="mt-6">
            <SecurityTab />
          </TabsContent>
        </Tabs>
      </motion.div>
    </AppLayout>
  );
}

