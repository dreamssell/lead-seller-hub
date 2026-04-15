import { AppLayout } from '@/components/layout/AppLayout';
import { motion } from 'framer-motion';
import { UserCircle, Mail, Phone, Lock, Camera, Save } from 'lucide-react';
import { useState } from 'react';

export default function ProfilePage() {
  const [form, setForm] = useState({
    name: 'João Silva',
    email: 'joao@leadseller.com',
    phone: '+55 11 99999-9999',
    role: 'Administrador',
  });

  return (
    <AppLayout title="Meu Perfil" subtitle="Gerencie suas informações pessoais">
      <div className="max-w-2xl space-y-6">
        {/* Avatar */}
        <motion.div
          className="glass-card p-6 flex items-center gap-6"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-primary/20 flex items-center justify-center">
              <span className="text-2xl font-bold text-primary">JS</span>
            </div>
            <button className="absolute -bottom-1 -right-1 w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-lg">
              <Camera className="w-3.5 h-3.5" />
            </button>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">{form.name}</h3>
            <p className="text-sm text-muted-foreground">{form.role}</p>
            <p className="text-xs text-primary mt-1">{form.email}</p>
          </div>
        </motion.div>

        {/* Form */}
        <motion.div
          className="glass-card p-6 space-y-4"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h3 className="text-sm font-semibold text-foreground mb-4">Informações Pessoais</h3>

          {[
            { icon: UserCircle, label: 'Nome completo', key: 'name' as const },
            { icon: Mail, label: 'E-mail', key: 'email' as const },
            { icon: Phone, label: 'Telefone', key: 'phone' as const },
          ].map((field) => (
            <div key={field.key}>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{field.label}</label>
              <div className="flex items-center gap-2 bg-secondary rounded-xl px-4 py-3">
                <field.icon className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  value={form[field.key]}
                  onChange={(e) => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                  className="bg-transparent text-sm outline-none flex-1 text-foreground"
                />
              </div>
            </div>
          ))}

          <div className="pt-2 flex items-center gap-3">
            <button className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity">
              <Save className="w-4 h-4" />
              Salvar Alterações
            </button>
            <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium border border-border text-foreground hover:bg-secondary transition-colors">
              <Lock className="w-4 h-4" />
              Alterar Senha
            </button>
          </div>
        </motion.div>
      </div>
    </AppLayout>
  );
}
