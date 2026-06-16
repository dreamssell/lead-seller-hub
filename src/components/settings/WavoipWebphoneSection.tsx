import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useWavoipWebphone } from '@/contexts/WavoipWebphoneContext';
import { Phone, Trash2, Star, PhoneCall, RefreshCw, ShieldCheck, Loader2, PlugZap, CheckCircle2, XCircle, Building2 } from 'lucide-react';
import { toast } from 'sonner';

export default function WavoipWebphoneSection() {
  const {
    config, status, error, scope,
    addDevice, removeDevice, setDefaultDevice, setEnabled,
    reload, callWhatsApp, openDialer,
    validateConnection, isValidating, lastValidation,
  } = useWavoipWebphone();
  const [token, setToken] = useState('');
  const [label, setLabel] = useState('');
  const [phone, setPhone] = useState('');
  const [testNumber, setTestNumber] = useState('');

  const handleAdd = async () => {
    const dev = await addDevice(token, label, phone);
    if (dev) { setToken(''); setLabel(''); setPhone(''); }
  };

  const statusBadge = () => {
    switch (status) {
      case 'ready': return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">SDK pronto</Badge>;
      case 'loading': return <Badge variant="outline" className="gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Carregando SDK</Badge>;
      case 'error': return <Badge variant="destructive">Erro</Badge>;
      default: return <Badge variant="outline">Inativo</Badge>;
    }
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5 text-emerald-500" />
              Webphone Wavoip (Tronco WhatsApp)
            </CardTitle>
            <CardDescription>
              Pareie devices Wavoip para realizar chamadas de voz pelo WhatsApp (não-oficial) diretamente do chat.
              O SDK oficial <code className="text-xs">@wavoip/wavoip-webphone</code> é carregado dinamicamente.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {statusBadge()}
            <Button size="sm" variant="outline" onClick={reload} title="Recarregar SDK">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/5 text-xs text-red-600">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-secondary/30">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold">Tronco habilitado</p>
              <Badge variant="outline" className="gap-1 text-[10px]">
                <Building2 className="w-3 h-3" />
                {scope.sub_company_id ? `Sub-empresa ${scope.sub_company_id.slice(0,8)}…` : 'Conta principal'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Devices abaixo valem apenas para esta conta/sub-empresa. Cada nova sub-empresa precisa cadastrar seus próprios tokens.
            </p>
          </div>
          <Switch checked={config.enabled} onCheckedChange={setEnabled} />
        </div>

        {/* Validar conexão real com a Wavoip */}
        <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-primary/30 bg-primary/5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <PlugZap className="w-4 h-4 text-primary" />
              <p className="text-sm font-semibold">Validar conexão real Wavoip</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Carrega o SDK, registra e habilita cada device, e confirma com o backend da Wavoip se o WhatsApp pareado está online.
              Use este teste se a chamada retorna <code className="text-[11px]">No device available</code>.
            </p>
            {lastValidation && (
              <div className={`mt-2 flex items-start gap-2 text-xs ${lastValidation.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                {lastValidation.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <XCircle className="w-4 h-4 mt-0.5" />}
                <span>{lastValidation.message}</span>
              </div>
            )}
          </div>
          <Button onClick={validateConnection} disabled={isValidating || config.devices.length === 0} size="sm">
            {isValidating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlugZap className="w-4 h-4 mr-2" />}
            Validar agora
          </Button>
        </div>


        <div className="space-y-3 p-4 rounded-xl border border-border/40 bg-background">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold">Adicionar novo device</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Label className="text-xs">Device Token (UUID Wavoip)</Label>
              <Input
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="ex: a2680ad7-fb84-49f0-afbe-9844584a3e99"
                className="font-mono text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">Nome amigável</Label>
              <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Comercial · WhatsApp" />
            </div>
            <div>
              <Label className="text-xs">Número WhatsApp (opcional)</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+55 11 90000-0000" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleAdd} size="sm">Cadastrar device</Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Gere o Device Token no painel da Wavoip (Settings → Devices) e cole aqui. O emparelhamento via QR Code acontece dentro do widget Wavoip quando você abrir o discador.
          </p>
        </div>

        <div>
          <p className="text-sm font-semibold mb-2">Devices cadastrados ({config.devices.length})</p>
          {config.devices.length === 0 ? (
            <div className="p-6 rounded-lg border border-dashed text-center text-xs text-muted-foreground">
              Nenhum device. Adicione ao menos um Device Token para habilitar o tronco WhatsApp via Wavoip.
            </div>
          ) : (
            <div className="space-y-2">
              {config.devices.map(d => (
                <div key={d.id} className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-secondary/20">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/15 text-emerald-600 flex items-center justify-center">
                      <Phone className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold truncate">{d.label}</p>
                        {config.defaultDeviceId === d.id && (
                          <Badge variant="outline" className="gap-1 text-[10px]"><Star className="w-3 h-3" /> padrão</Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground font-mono truncate">{d.token}</p>
                      {d.phone && <p className="text-[11px] text-muted-foreground">📱 {d.phone}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {config.defaultDeviceId !== d.id && (
                      <Button size="sm" variant="ghost" onClick={() => setDefaultDevice(d.id)} title="Definir como padrão">
                        <Star className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => removeDevice(d.id)} title="Remover">
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2 p-4 rounded-xl border border-border/40">
          <p className="text-sm font-semibold">Testar chamada</p>
          <div className="flex gap-2">
            <Input
              value={testNumber}
              onChange={e => setTestNumber(e.target.value)}
              placeholder="+55 11 99999-9999"
              className="font-mono"
            />
            <Button onClick={() => testNumber ? callWhatsApp(testNumber) : toast.error('Informe um número')}>
              <PhoneCall className="w-4 h-4 mr-2" /> Ligar
            </Button>
            <Button variant="outline" onClick={openDialer}>Abrir discador</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
