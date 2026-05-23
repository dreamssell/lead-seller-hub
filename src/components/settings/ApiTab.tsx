import { ExternalLink, Code2, Key } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

export default function ApiTab() {
  return (
    <div className="space-y-6">
      <div className="glass-card p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center"><Code2 className="w-5 h-5 text-primary" /></div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Documentação da API</h3>
              <p className="text-xs text-muted-foreground">Aprenda a integrar e usar a API da plataforma</p>
            </div>
          </div>
          <Button variant="outline" asChild>
            <a href="https://docs.lovable.dev" target="_blank" rel="noreferrer">
              Ver Documentação <ExternalLink className="w-3.5 h-3.5 ml-2" />
            </a>
          </Button>
        </div>
      </div>

      <div className="glass-card p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Key className="w-5 h-5 text-primary" /></div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Chaves API</h3>
              <p className="text-xs text-muted-foreground">Gere chaves para integrar a plataforma com outros sistemas (com escopos de permissão)</p>
            </div>
          </div>
          <Button asChild><Link to="/api-keys">Gerenciar Chaves API</Link></Button>
        </div>
      </div>
    </div>
  );
}
