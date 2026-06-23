import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy, Medal, Award } from 'lucide-react';

export interface RankingItem {
  id: string;
  name: string;
  primary: number; // sort by this
  primaryLabel: string; // e.g. "R$ 12.500"
  hint?: string;
}

const ICONS = [Trophy, Medal, Award];
const COLORS = ['text-amber-500', 'text-slate-400', 'text-orange-500'];

export function TopRanking({ title, description, items }: { title: string; description?: string; items: RankingItem[] }) {
  const top3 = [...items].sort((a, b) => b.primary - a.primary).slice(0, 3);
  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-500" /> {title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {top3.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sem dados no período selecionado.</p>
        ) : (
          <div className="space-y-3">
            {top3.map((u, i) => {
              const Icon = ICONS[i];
              return (
                <div key={u.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/40">
                  <div className={`w-10 h-10 rounded-full bg-background flex items-center justify-center ${COLORS[i]}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{u.name}</p>
                    {u.hint && <p className="text-xs text-muted-foreground">{u.hint}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">{u.primaryLabel}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">#{i + 1}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
