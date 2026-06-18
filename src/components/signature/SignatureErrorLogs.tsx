import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, RefreshCcw, Search } from "lucide-react";

type ErrorRow = {
  id: string;
  created_at: string;
  context: string;
  route: string | null;
  message: string;
  details: any;
  original_filename: string | null;
  user_email: string | null;
  sub_company_id: string | null;
};

export function SignatureErrorLogs() {
  const [rows, setRows] = useState<ErrorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("signature_error_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    setRows((data as ErrorRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => {
    if (!q) return true;
    const t = q.toLowerCase();
    return [r.message, r.context, r.original_filename, r.user_email, r.route]
      .filter(Boolean).some((v) => v!.toLowerCase().includes(t));
  });

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-destructive" />
        <h3 className="text-sm font-semibold">Registro de erros</h3>
        <Badge variant="secondary" className="ml-auto">{filtered.length}</Badge>
        <Button size="sm" variant="outline" onClick={load}><RefreshCcw className="w-3.5 h-3.5" /></Button>
      </div>

      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-8" placeholder="Buscar mensagem, contexto, arquivo, usuário…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-6">Carregando…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Nenhum erro registrado.</p>
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {filtered.map((r) => (
            <details key={r.id} className="border border-border rounded-lg p-3 text-sm">
              <summary className="cursor-pointer flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px]">{r.context}</Badge>
                <span className="font-medium truncate flex-1">{r.message}</span>
                <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-BR")}</span>
              </summary>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                {r.original_filename && <p><b>Arquivo:</b> {r.original_filename}</p>}
                {r.user_email && <p><b>Usuário:</b> {r.user_email}</p>}
                {r.route && <p><b>Rota:</b> {r.route}</p>}
                {r.details && (
                  <pre className="bg-muted p-2 rounded text-[10px] overflow-x-auto">{JSON.stringify(r.details, null, 2)}</pre>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
