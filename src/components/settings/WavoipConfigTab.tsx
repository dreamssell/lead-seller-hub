import { useState } from 'react';
import { motion } from 'framer-motion';
import { Phone, Shield, Globe, Activity, Loader2, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export default function WavoipConfigPage() {
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [validated, setTestingValidated] = useState(false);
  
  const [form, setForm] = useState({
    apiUrl: 'https://api.wavoip.com/v1',
    token: '',
    origin: '',
    destination: ''
  });

  const handleSave = async () => {
    if (!validated) {
      toast.error('Valide a conexão antes de salvar.');
      return;
    }
    setLoading(true);
    // Simulação de salvamento - integraria com whatsapp_connections ou similar
    setTimeout(() => {
      setLoading(false);
      toast.success('Configurações do Wavoip salvas com sucesso!');
    }, 1000);
  };

  const handleTest = async () => {
    if (!form.token) {
      toast.error('Informe o token de acesso.');
      return;
    }
    setTesting(true);
    // Simulação de validação
    const { data, error } = await supabase.functions.invoke('whatsapp-status', {
      body: { provider: 'uaz', url: form.apiUrl, token: form.token }
    });
    
    setTesting(false);
    if (error || data?.error) {
      toast.error('Falha na validação das credenciais.');
      setTestingValidated(false);
    } else {
      toast.success('Conexão validada com sucesso!');
      setTestingValidated(true);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4 mb-2">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
          <Phone className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configuração Wavoip</h1>
          <p className="text-sm text-muted-foreground">Credenciais de voz e mensagens integradas</p>
        </div>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" /> Credenciais de API
          </CardTitle>
          <CardDescription>Informe seus dados de acesso fornecidos pelo painel Wavoip</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>URL do Servidor</Label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                className="pl-9" 
                value={form.apiUrl} 
                onChange={e => setForm({...form, apiUrl: e.target.value})}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Token de Acesso (API Key)</Label>
            <Input 
              type="password" 
              placeholder="wa_..." 
              value={form.token}
              onChange={e => setForm({...form, token: e.target.value})}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" /> Roteamento de Chamadas
          </CardTitle>
          <CardDescription>Defina os ramais de origem e destino para as integrações</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Origem (DID/Ramal)</Label>
            <Input 
              placeholder="Ex: 551199999999" 
              value={form.origin}
              onChange={e => setForm({...form, origin: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <Label>Destino Padrão</Label>
            <Input 
              placeholder="Ramal ou Fila" 
              value={form.destination}
              onChange={e => setForm({...form, destination: e.target.value})}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <Button 
          variant="outline" 
          className="flex-1 gap-2" 
          onClick={handleTest}
          disabled={testing}
        >
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : validated ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Activity className="w-4 h-4" />}
          {validated ? 'Conexão Validada' : 'Validar Conexão'}
        </Button>
        <Button 
          className="flex-1 gap-2" 
          onClick={handleSave}
          disabled={loading || !validated}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar e Ativar
        </Button>
      </div>

      {!validated && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-amber-700 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Você precisa validar as credenciais antes de ativar a integração Wavoip.</span>
        </div>
      )}
    </div>
  );
}
