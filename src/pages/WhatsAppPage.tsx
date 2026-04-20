import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Globe, MessageCircle, Phone, QrCode, CheckCircle2 } from 'lucide-react';

export default function WhatsAppPage() {
  return (
    <AppLayout title="WhatsApp Business" subtitle="Integração oficial para mensagens e chamadas de áudio">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Status da Conexão</CardTitle>
              <Badge variant="outline" className="text-success border-success/30">Conectado</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="w-4 h-4 text-success" />
              <span>+55 11 99999-0000</span>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader className="pb-3"><CardTitle className="text-sm">Mensagens (24h)</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">1.847</p></CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader className="pb-3"><CardTitle className="text-sm">Taxa de Resposta</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">94%</p></CardContent>
        </Card>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Globe className="w-5 h-5 text-primary" /> Configuração da API</CardTitle>
          <CardDescription>Vincule um novo número ou gere QR Code para conectar o WhatsApp Business.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button><QrCode className="w-4 h-4 mr-2" /> Gerar QR Code</Button>
          <Button variant="outline"><MessageCircle className="w-4 h-4 mr-2" /> Templates de Mensagem</Button>
          <Button variant="outline"><Phone className="w-4 h-4 mr-2" /> Configurar Áudio</Button>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
