import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, ShieldAlert, ArrowRight } from "lucide-react";
import { EXTERNAL_LOGIN_URL, buildExternalLoginUrl } from "@/contexts/AuthContext";

type Info = {
  sub_company_id: string;
  sub_company_name: string;
  admin_email: string;
  admin_name: string;
  expires_at: string;
};

const ERROR_MAP: Record<string, string> = {
  invalid_token: "Link inválido ou inexistente.",
  revoked_token: "Este link foi revogado pelo administrador.",
  expired_token: "Este link expirou. Solicite um novo acesso.",
  sub_company_blocked: "Esta sub-empresa está bloqueada. Contate o administrador.",
  sub_company_missing: "Sub-empresa não encontrada.",
};

export default function SubLoginPage() {
  const { subId } = useParams();
  const [params] = useSearchParams();
  const token = params.get("t");
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token) {
        setError("Token de acesso não informado.");
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.rpc("validate_sub_login_token", { p_token: token });
      if (error) {
        const code = (error.message || "").match(/invalid_token|revoked_token|expired_token|sub_company_blocked|sub_company_missing/)?.[0];
        setError(code ? ERROR_MAP[code] : "Não foi possível validar este link.");
      } else if (Array.isArray(data) && data.length > 0) {
        const row = data[0] as Info;
        if (subId && row.sub_company_id !== subId) {
          setError("Link não corresponde à sub-empresa informada.");
        } else {
          setInfo(row);
        }
      } else {
        setError("Link inválido ou inexistente.");
      }
      setLoading(false);
    })();
  }, [token, subId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md p-8 space-y-6">
        {loading && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Validando link de acesso…</p>
          </div>
        )}

        {!loading && error && (
          <div className="space-y-4 text-center">
            <ShieldAlert className="h-12 w-12 text-destructive mx-auto" />
            <div>
              <h1 className="text-xl font-semibold">Acesso negado</h1>
              <p className="text-sm text-muted-foreground mt-2">{error}</p>
            </div>
            <Button asChild variant="outline" className="w-full">
              <Link to="/">Voltar ao início</Link>
            </Button>
          </div>
        )}

        {!loading && info && (
          <div className="space-y-5 text-center">
            <ShieldCheck className="h-12 w-12 text-primary mx-auto" />
            <div>
              <h1 className="text-xl font-semibold">{info.sub_company_name}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Bem-vindo, {info.admin_name}. Use suas credenciais para entrar.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                E-mail vinculado: <strong>{info.admin_email}</strong>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Link válido até {new Date(info.expires_at).toLocaleString("pt-BR")}
              </p>
            </div>
            <Button asChild className="w-full">
              <a href={buildExternalLoginUrl({ email: info.admin_email })}>
                Continuar para login <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
