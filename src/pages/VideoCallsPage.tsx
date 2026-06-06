import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Video, Calendar, Users, Link2, Sparkles, MessageCircle, Mic, Monitor, Shield, Plus, Activity, Loader2, Settings, X } from 'lucide-react';
import { useVideoCall } from '@/contexts/VideoCallContext';
import { VideoRoom } from '@/components/video/VideoRoom';
import { VideoErrorLogs } from '@/components/video/VideoErrorLogs';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';

export default function VideoCallsPage() {
  const { startCall, status } = useVideoCall();
  const [activeRoomType, setActiveRoomType] = useState<'individual' | 'group'>('individual');
  const [isLoading, setIsLoading] = useState(false);

  const features = [
    { title: 'IA Noise Cancellation', description: 'Redução de ruído inteligente para áudio cristalino.', icon: Mic },
    { title: 'Tradução em Tempo Real', description: 'Legendas automáticas em mais de 30 idiomas.', icon: MessageCircle },
    { title: 'Compartilhamento 4K', description: 'Stream de tela em alta definição sem latência.', icon: Monitor },
    { title: 'Criptografia Ponta-a-Ponta', description: 'Máxima segurança para suas reuniões corporativas.', icon: Shield },
  ];

  const stats = [
    { label: 'Reuniões Hoje', value: '12' },
    { label: 'Minutos em Chamada', value: '840' },
    { label: 'Média Participantes', value: '8' },
  ];

  const [showSettings, setShowSettings] = useState(false);
  const [roomSettings, setRoomSettings] = useState({
    guest_approval_required: true,
    allow_chat: true,
    host_permissions: ["approve", "kick", "mute", "promote", "screen_share"],
    moderator_permissions: ["approve", "kick", "mute", "screen_share"],
    participant_permissions: ["screen_share"]
  });

  const togglePermission = (role: 'host' | 'moderator' | 'participant', permission: string) => {
    const key = `${role}_permissions` as keyof typeof roomSettings;
    const current = roomSettings[key] as string[];
    setRoomSettings(prev => ({
      ...prev,
      [key]: current.includes(permission) 
        ? current.filter(p => p !== permission)
        : [...current, permission]
    }));
  };


  const handleStartCall = async (isGroup: boolean) => {

    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Você precisa estar logado para iniciar uma reunião.');
        return;
      }

      // Create a room record
      const roomId = crypto.randomUUID();
      const inviteToken = Math.random().toString(36).substring(2, 15);
      
      const { data: room, error } = await supabase
        .from('video_rooms')
        .insert({
          id: roomId,
          host_id: user.id,
          title: isGroup ? 'Conferência em Grupo' : 'Conversa Individual',
          is_group: isGroup,
          invite_token: inviteToken,
          settings: {
            ...roomSettings,
            is_group: isGroup
          },
          permissions_config: {
            host: roomSettings.host_permissions,
            moderator: roomSettings.moderator_permissions,
            participant: roomSettings.participant_permissions
          }

        })
        .select()
        .single();

      if (error) throw error;

      setActiveRoomType(isGroup ? 'group' : 'individual');
      await startCall(isGroup, room.id, user.email?.split('@')[0] || 'Anfitrião');
      
    } catch (error) {
      console.error('Erro ao criar sala:', error);
      toast.error('Falha ao criar a sala de reunião.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get or create an active room for the user to get a link
      const { data: room } = await supabase
        .from('video_rooms')
        .select('id, invite_token')
        .eq('host_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      let link = '';
      if (room) {
        link = `${window.location.origin}/video/join/${room.id}?token=${room.invite_token}`;
      } else {
        // Create a temporary one just for the link if none active
        const roomId = crypto.randomUUID();
        const inviteToken = Math.random().toString(36).substring(2, 15);
        await supabase.from('video_rooms').insert({
          id: roomId,
          host_id: user.id,
          title: 'Sala de Reunião',
          invite_token: inviteToken
        });
        link = `${window.location.origin}/video/join/${roomId}?token=${inviteToken}`;
      }
      
      navigator.clipboard.writeText(link);
      toast.success('Link de convite copiado!');
    } catch (error) {
      toast.error('Erro ao gerar link de convite.');
    }
  };

  return (
    <AppLayout title="Lead Video Center" subtitle="Sistema nativo de videochamadas inteligentes">
      <VideoRoom isGroup={activeRoomType === 'group'} />

      <div className="space-y-6">
        {/* Settings Dialog/Panel */}
        {showSettings && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <Card className="glass-card border-primary/20">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Settings className="w-5 h-5 text-primary" /> Configurações de Permissão
                  </CardTitle>
                  <CardDescription>Defina o que cada nível de usuário pode fazer na sala.</CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowSettings(false)}><X className="w-4 h-4" /></Button>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {['host', 'moderator', 'participant'].map((role) => (
                    <div key={role} className="space-y-4">
                      <h4 className="text-sm font-bold uppercase tracking-widest text-zinc-500 border-b border-white/5 pb-2">
                        {role === 'host' ? 'Anfitrião' : role === 'moderator' ? 'Moderador' : 'Participante'}
                      </h4>
                      <div className="space-y-3">
                        {["approve", "kick", "mute", "promote", "screen_share"].map((perm) => (
                          <div key={perm} className="flex items-center justify-between group">
                            <span className="text-xs text-zinc-400 capitalize">{perm.replace('_', ' ')}</span>
                            <button 
                              onClick={() => togglePermission(role as any, perm)}
                              className={`w-10 h-5 rounded-full transition-colors relative ${
                                (roomSettings[`${role}_permissions` as keyof typeof roomSettings] as string[]).includes(perm) ? 'bg-primary' : 'bg-zinc-800'
                              }`}
                            >
                              <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${
                                (roomSettings[`${role}_permissions` as keyof typeof roomSettings] as string[]).includes(perm) ? 'left-6' : 'left-1'
                              }`} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 glass-card overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
               <Video className="w-32 h-32 text-primary" />
            </div>
            <CardHeader className="relative z-10">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary" className="bg-primary/10 text-primary border-none">NATIVO</Badge>
                <Badge variant="outline" className="text-[10px] font-bold">WEB RTC + SFU</Badge>
              </div>
              <CardTitle className="text-2xl font-bold flex items-center gap-2">
                Sala de Conferência Própria
              </CardTitle>
              <CardDescription className="max-w-md">
                Inicie chamadas individuais ou em grupo para até 100 pessoas com estabilidade premium e recursos de IA.
              </CardDescription>
            </CardHeader>
            <CardContent className="relative z-10 flex flex-wrap gap-3">
              <Button 
                size="lg" 
                className="bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
                onClick={() => handleStartCall(false)}
                disabled={isLoading || status !== 'idle'}
              >
                {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Video className="w-4 h-4 mr-2" />} 
                Iniciar Individual (1:1)
              </Button>
              <Button 
                size="lg" 
                variant="secondary"
                onClick={() => handleStartCall(true)}
                disabled={isLoading || status !== 'idle'}
              >
                {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Users className="w-4 h-4 mr-2" />} 
                Sala em Grupo (100+)
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                onClick={() => setShowSettings(!showSettings)}
                className={showSettings ? 'border-primary text-primary' : ''}
              >
                <Settings className="w-4 h-4 mr-2" /> Configurações
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                onClick={handleCopyLink}
              >
                <Link2 className="w-4 h-4 mr-2" /> Link de Convite
              </Button>

            </CardContent>
          </Card>

          <Card className="glass-card flex flex-col">
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Activity className="w-4 h-4" /> Desempenho Hoje
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-around">
              {stats.map(s => (
                <div key={s.label} className="flex items-center justify-between border-b border-border/40 pb-4 last:border-0 last:pb-0">
                   <span className="text-sm text-muted-foreground">{s.label}</span>
                   <span className="text-2xl font-bold">{s.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Intelligence Features */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Card className="glass-card h-full hover:border-primary/40 transition-colors">
                <CardContent className="p-5 space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <f.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm">{f.title}</h4>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
                      {f.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Schedule & History */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-primary" /> Agendadas
                </CardTitle>
                <CardDescription>Suas próximas reuniões confirmadas.</CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="gap-2">
                <Plus className="w-4 h-4" /> Novo Agendamento
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { title: 'Review Mensal - Marketing', time: '14:00 - 15:00', host: 'Ana Silva', type: 'Grupo' },
                { title: 'Onboarding Cliente #882', time: '16:30 - 17:00', host: 'João Pedro', type: '1:1' },
              ].map((m, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border/40 hover:border-primary/20 transition-all group">
                   <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-xs">
                         {m.time.split(':')[0]}h
                      </div>
                      <div>
                        <p className="text-sm font-bold group-hover:text-primary transition-colors">{m.title}</p>
                        <p className="text-[10px] text-muted-foreground">{m.time} • Host: {m.host}</p>
                      </div>
                   </div>
                   <Badge variant="outline" className="text-[9px] uppercase">{m.type}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" /> Insights Recentes
              </CardTitle>
              <CardDescription>Resumos gerados por IA das últimas chamadas.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { title: 'Weekly Sprint #24', date: 'Hoje, 09:30', summary: 'Definição de metas para o Q3 e alinhamento do novo layout do painel.' },
                { title: 'Treinamento Comercial', date: 'Ontem, 15:00', summary: 'Apresentação das novas funcionalidades do Widget e técnicas de fechamento.' },
              ].map((h, i) => (
                <div key={i} className="space-y-1 pb-4 border-b border-border/40 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold">{h.title}</p>
                    <span className="text-[10px] text-muted-foreground">{h.date}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 italic">
                    "{h.summary}"
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Diagnostic Logs */}
        <div className="pt-6 border-t border-border/40">
           <VideoErrorLogs />
        </div>
      </div>
    </AppLayout>
  );
}