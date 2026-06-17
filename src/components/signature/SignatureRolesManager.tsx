import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Shield, Trash2, UserPlus, Crown, Users2, GraduationCap } from 'lucide-react';

type SubCompany = { id: string; name: string };
type RoleRow = {
  id: string;
  user_id: string;
  sub_company_id: string | null;
  role: 'agente' | 'supervisor' | 'coordenador' | 'diretor';
  email?: string;
  display_name?: string;
  sub_name?: string;
};

const ROLES: { value: RoleRow['role']; label: string; icon: any; tone: string }[] = [
  { value: 'agente', label: 'Agente', icon: Users2, tone: 'bg-slate-500/10 text-slate-600 border-slate-500/20' },
  { value: 'supervisor', label: 'Supervisor', icon: GraduationCap, tone: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  { value: 'coordenador', label: 'Coordenador', icon: Shield, tone: 'bg-violet-500/10 text-violet-600 border-violet-500/20' },
  { value: 'diretor', label: 'Diretor', icon: Crown, tone: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
];

export function SignatureRolesManager() {
  const { user } = useAuth();
  const [subs, setSubs] = useState<SubCompany[]>([]);
  const [rows, setRows] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<RoleRow['role']>('agente');
  const [subId, setSubId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: subData }, { data: roleData }] = await Promise.all([
      supabase.from('sub_companies').select('id,name').eq('owner_id', user.id).order('name'),
      supabase
        .from('user_signature_roles')
        .select('id,user_id,sub_company_id,role')
        .eq('owner_id', user.id),
    ]);
    setSubs((subData as any) || []);

    const userIds = Array.from(new Set((roleData || []).map((r: any) => r.user_id)));
    let profiles: any[] = [];
    if (userIds.length) {
      const { data } = await supabase
        .from('profiles')
        .select('user_id,email,display_name')
        .in('user_id', userIds);
      profiles = data || [];
    }
    const subsById = new Map((subData || []).map((s: any) => [s.id, s.name]));
    const merged = (roleData || []).map((r: any) => {
      const p = profiles.find((pr) => pr.user_id === r.user_id);
      return {
        ...r,
        email: p?.email,
        display_name: p?.display_name,
        sub_name: r.sub_company_id ? subsById.get(r.sub_company_id) : 'Todas as sub-empresas',
      };
    });
    setRows(merged);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleAssign = async () => {
    if (!user || !email.trim()) {
      toast.error('Informe um e-mail válido');
      return;
    }
    setSaving(true);
    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle();
    if (pErr || !profile?.user_id) {
      toast.error('Usuário não encontrado. Ele precisa ter conta na plataforma.');
      setSaving(false);
      return;
    }
    const payload: any = {
      user_id: profile.user_id,
      owner_id: user.id,
      role,
      sub_company_id: subId || null,
    };
    const { error } = await supabase
      .from('user_signature_roles')
      .upsert(payload, { onConflict: 'user_id,sub_company_id' });
    if (error) {
      toast.error('Falha ao atribuir cargo: ' + error.message);
    } else {
      toast.success('Cargo atribuído com sucesso');
      setEmail('');
      await load();
    }
    setSaving(false);
  };

  const handleUpdateRole = async (rowId: string, newRole: RoleRow['role']) => {
    const { error } = await supabase.from('user_signature_roles').update({ role: newRole }).eq('id', rowId);
    if (error) toast.error(error.message);
    else {
      toast.success('Cargo atualizado');
      await load();
    }
  };

  const handleDelete = async (rowId: string) => {
    if (!confirm('Remover este cargo de assinatura?')) return;
    const { error } = await supabase.from('user_signature_roles').delete().eq('id', rowId);
    if (error) toast.error(error.message);
    else {
      toast.success('Cargo removido');
      await load();
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <UserPlus className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Atribuir cargo de assinatura</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <Input
            placeholder="E-mail do usuário"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="md:col-span-5"
            type="email"
          />
          <Select value={role} onValueChange={(v) => setRole(v as RoleRow['role'])}>
            <SelectTrigger className="md:col-span-3">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={subId || 'all'} onValueChange={(v) => setSubId(v === 'all' ? '' : v)}>
            <SelectTrigger className="md:col-span-3">
              <SelectValue placeholder="Sub-empresa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as sub-empresas</SelectItem>
              {subs.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button className="md:col-span-1" onClick={handleAssign} disabled={saving}>
            Atribuir
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Hierarquia: agente → supervisor → coordenador → diretor. Líderes (supervisor+) visualizam documentos da sub-empresa.
        </p>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold">Equipe de Assinatura</h3>
          <p className="text-xs text-muted-foreground">{rows.length} cargo(s) atribuído(s)</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Sub-empresa</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                  Nenhum cargo atribuído ainda.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const meta = ROLES.find((x) => x.value === r.role)!;
                const Icon = meta.icon;
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <p className="text-sm font-medium">{r.display_name || r.email || r.user_id.slice(0, 8)}</p>
                      <p className="text-xs text-muted-foreground">{r.email}</p>
                    </TableCell>
                    <TableCell className="text-sm">{r.sub_name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={meta.tone}>
                          <Icon className="w-3 h-3 mr-1" />
                          {meta.label}
                        </Badge>
                        <Select value={r.role} onValueChange={(v) => handleUpdateRole(r.id, v as RoleRow['role'])}>
                          <SelectTrigger className="h-7 w-32 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(r.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
