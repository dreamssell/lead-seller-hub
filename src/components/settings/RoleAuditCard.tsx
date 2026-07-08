import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, Database, Key, UserCog, Award, HelpCircle } from 'lucide-react';
import { useUserRoleLabel, type RoleSource } from '@/hooks/useUserRoleLabel';

const SOURCE_META: Record<RoleSource, { label: string; description: string; icon: React.ComponentType<any>; badge: string }> = {
  db_profile: {
    label: 'Banco de dados (profiles.role_label)',
    description: 'Cargo lido diretamente da tabela profiles no banco de dados.',
    icon: Database,
    badge: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  },
  jwt_claim: {
    label: 'Claim do JWT / metadata',
    description: 'Cargo veio de app_metadata/user_metadata do token de sessão.',
    icon: Key,
    badge: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  },
  signature_role: {
    label: 'Papel de assinatura',
    description: 'Cargo derivado de user_signature_roles (supervisor/coordenador/diretor).',
    icon: Award,
    badge: 'bg-fuchsia-500/15 text-fuchsia-600 border-fuchsia-500/30',
  },
  auth_context: {
    label: 'AuthContext (nível de acesso)',
    description: 'Cargo inferido pelo AuthContext (dono da plataforma ou CEO da conta).',
    icon: UserCog,
    badge: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  },
  default: {
    label: 'Padrão',
    description: 'Nenhuma fonte retornou um cargo — usando "Atendente" como padrão.',
    icon: HelpCircle,
    badge: 'bg-muted text-muted-foreground border-border',
  },
};

export default function RoleAuditCard() {
  const { label, source, sources, loading } = useUserRoleLabel();
  const meta = SOURCE_META[source];
  const Icon = meta.icon;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Auditoria do cargo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border border-border p-4 bg-secondary/40">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Cargo em uso
          </div>
          <div className="mt-1 text-2xl font-semibold text-foreground">
            {loading ? '—' : label}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Badge variant="outline" className={meta.badge}>
              <Icon className="h-3 w-3 mr-1" /> {meta.label}
            </Badge>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{meta.description}</p>
        </div>

        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2">
            Valores retornados por cada fonte
          </div>
          <div className="space-y-2">
            {(Object.keys(sources) as (keyof typeof sources)[]).map((key) => {
              const m = SOURCE_META[key as RoleSource];
              const K = m.icon;
              const value = sources[key];
              const active = source === key;
              return (
                <div
                  key={key}
                  className={`flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm ${
                    active ? 'border-primary/40 bg-primary/5' : 'border-border'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <K className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground truncate">{m.label}</span>
                  </div>
                  <span className={`text-xs font-mono ${value ? 'text-foreground' : 'text-muted-foreground/60'}`}>
                    {value ?? '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
