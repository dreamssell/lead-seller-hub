import { Building2, Mail, Phone, Globe, FileText, MapPin, Save, Loader2, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';

export default function CompanyTab() {
  const { access } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    website: '',
    document: '',
    address: '',
    logo_url: '',
  });

  const subCompanyId = access?.sub_company_id;

  useEffect(() => {
    (async () => {
      setLoading(true);
      if (subCompanyId) {
        // Fetch sub_company data
        const { data, error } = await supabase
          .from('sub_companies')
          .select('name, admin_email, admin_name') // sub_companies has limited fields compared to company_settings
          .eq('id', subCompanyId)
          .maybeSingle();

        if (error) {
          toast({ title: 'Erro ao carregar dados da empresa', description: error.message, variant: 'destructive' });
        } else if (data) {
          setForm(prev => ({
            ...prev,
            name: data.name || '',
            email: data.admin_email || '',
          }));
        }
      } else {
        // Fetch company_settings
        const { data, error } = await supabase
          .from('company_settings')
          .select('*')
          .limit(1)
          .maybeSingle();

        if (error) {
          toast({ title: 'Erro ao carregar configurações', description: error.message, variant: 'destructive' });
        } else if (data) {
          setForm({
            name: data.name || '',
            email: data.email || '',
            phone: data.phone || '',
            website: data.website || '',
            document: data.document || '',
            address: data.address || '',
            logo_url: data.logo_url || '',
          });
        }
      }
      setLoading(false);
    })();
  }, [subCompanyId]);

  const handleLogoUpload = async (file: File) => {
    setUploadingLogo(true);
    const ext = file.name.split('.').pop();
    const path = `company/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
    
    if (upErr) {
      setUploadingLogo(false);
      toast({ title: 'Erro no upload', description: upErr.message, variant: 'destructive' });
      return;
    }

    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
    const url = pub.publicUrl;

    if (subCompanyId) {
       // sub_companies doesn't have logo_url in the schema we saw, but maybe it does or should?
       // Let's assume for now it's only for company_settings or wait for more info.
       toast({ title: 'Funcionalidade limitada para sub-empresas' });
    } else {
      const { error: updErr } = await supabase.from('company_settings').update({ logo_url: url }).match({ name: form.name });
      if (updErr) {
        toast({ title: 'Erro ao salvar logo', description: updErr.message, variant: 'destructive' });
      } else {
        setForm(prev => ({ ...prev, logo_url: url }));
        toast({ title: 'Logo atualizado' });
      }
    }
    setUploadingLogo(false);
  };

  const handleSave = async () => {
    setSaving(true);
    let error;

    if (subCompanyId) {
      const { error: subErr } = await supabase
        .from('sub_companies')
        .update({
          name: form.name,
          admin_email: form.email,
        })
        .eq('id', subCompanyId);
      error = subErr;
    } else {
      // Check if record exists
      const { data: existing } = await supabase.from('company_settings').select('id').limit(1).maybeSingle();
      
      if (existing) {
        const { error: updErr } = await supabase
          .from('company_settings')
          .update({
            name: form.name,
            email: form.email,
            phone: form.phone,
            website: form.website,
            document: form.document,
            address: form.address,
          })
          .eq('id', existing.id);
        error = updErr;
      } else {
        const { error: insErr } = await supabase
          .from('company_settings')
          .insert({
            name: form.name,
            email: form.email,
            phone: form.phone,
            website: form.website,
            document: form.document,
            address: form.address,
          });
        error = insErr;
      }
    }

    setSaving(false);

    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Dados atualizados', description: 'As informações da empresa foram salvas.' });
  };

  return (
    <div className="space-y-6">
      <motion.div
        className="glass-card p-6 flex items-center gap-6"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-primary/20 flex items-center justify-center overflow-hidden border border-primary/20">
            {form.logo_url ? (
              <img src={form.logo_url} alt="Logo" className="w-full h-full object-contain p-2" />
            ) : (
              <Building2 className="w-10 h-10 text-primary/40" />
            )}
          </div>
          <button
            onClick={() => logoInputRef.current?.click()}
            disabled={uploadingLogo}
            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-lg disabled:opacity-50"
          >
            {uploadingLogo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
          </button>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])}
          />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">{form.name || 'Empresa'}</h3>
          <p className="text-sm text-muted-foreground">{subCompanyId ? 'Sub-empresa' : 'Empresa Principal'}</p>
        </div>
      </motion.div>

      <motion.div
        className="glass-card p-6 space-y-4"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h3 className="text-sm font-semibold text-foreground mb-4">Dados Corporativos</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { icon: Building2, label: 'Nome da Empresa', key: 'name' as const },
            { icon: Mail, label: 'E-mail Corporativo', key: 'email' as const },
            { icon: Phone, label: 'Telefone/WhatsApp', key: 'phone' as const },
            { icon: Globe, label: 'Website', key: 'website' as const },
            { icon: FileText, label: 'Documento (CNPJ/CPF)', key: 'document' as const },
            { icon: MapPin, label: 'Endereço', key: 'address' as const },
          ].map((field) => (
            <div key={field.key} className={field.key === 'address' ? 'md:col-span-2' : ''}>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{field.label}</label>
              <div className="flex items-center gap-2 bg-secondary rounded-xl px-4 py-3">
                <field.icon className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  value={(form as any)[field.key]}
                  disabled={loading}
                  onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  className="bg-transparent text-sm outline-none flex-1 text-foreground"
                  placeholder={`Informe o ${field.label.toLowerCase()}`}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="pt-2">
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
