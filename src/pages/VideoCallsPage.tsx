import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Video, Calendar, Users, Link2 } from 'lucide-react';

export default function VideoCallsPage() {
  return (
    <AppLayout title="Videochamadas" subtitle="Agende e realize reuniões em vídeo direto da plataforma">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Video className="w-5 h-5 text-primary" /> Iniciar Reunião Agora</CardTitle>
            <CardDescription>Crie uma sala instantânea e compartilhe o link.</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button><Video className="w-4 h-4 mr-2" /> Nova Sala</Button>
            <Button variant="outline"><Link2 className="w-4 h-4 mr-2" /> Copiar Link</Button>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Calendar className="w-5 h-5 text-primary" /> Agendar Reunião</CardTitle>
            <CardDescription>Programe uma videochamada com convidados.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline"><Calendar className="w-4 h-4 mr-2" /> Abrir Agenda</Button>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" /> Próximas Reuniões</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Nenhuma reunião agendada para hoje.</p>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
