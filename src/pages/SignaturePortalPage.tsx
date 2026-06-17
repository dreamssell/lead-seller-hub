import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { SignatureCanvas } from "@/components/signature/SignatureCanvas";
import { FileText, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";

export default function SignaturePortalPage() {
  const { token } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [doc, setDoc] = useState<any>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [pinVerified, setPinVerified] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ hash: string } | null>(null);

  const call = async (action: string, extra: any = {}) => {
    const { data, error } = await supabase.functions.invoke("signature-portal", { body: { action, token, ...extra } });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  };

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const r = await call("view");
        setDoc(r.document);
        setFileUrl(r.file_url);
      } catch (e: any) { setError(e.message); }
      finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const verifyPin = async () => {
    try { await call("verify_pin", { pin }); setPinVerified(true); toast({ title: "PIN verificado" }); }
    catch (e: any) { toast({ title: "PIN inválido", description: e.message, variant: "destructive" }); }
  };

  const sign = async () => {
    if (!signature) { toast({ title: "Desenhe sua assinatura", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      const r = await call("sign", { signature_data_url: signature });
      setDone({ hash: r.hash });
    } catch (e: any) { toast({ title: "Erro ao assinar", description: e.message, variant: "destructive" }); }
    finally { setSubmitting(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (error) return <div className="min-h-screen flex items-center justify-center p-6"><Card className="max-w-md"><CardHeader><CardTitle>Não foi possível abrir o documento</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{error}</p></CardContent></Card></div>;
  if (done) return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="max-w-md">
        <CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="w-6 h-6 text-emerald-500" /> Documento assinado</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm">Obrigado! Sua assinatura foi registrada com sucesso.</p>
          <p className="text-xs text-muted-foreground break-all">Hash: {done.hash}</p>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5 text-primary" /> {doc.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {doc.description && <p className="text-sm text-muted-foreground">{doc.description}</p>}
            {fileUrl && (
              <a href={fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                <FileText className="w-4 h-4" /> Visualizar documento original
              </a>
            )}
          </CardContent>
        </Card>

        {doc.method === "sms" && !pinVerified && (
          <Card>
            <CardHeader><CardTitle className="text-base">Validação por SMS</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Label>Insira o PIN de 6 dígitos enviado para seu celular</Label>
              <div className="flex gap-2">
                <Input value={pin} onChange={(e) => setPin(e.target.value)} maxLength={6} placeholder="000000" />
                <Button onClick={verifyPin}>Verificar</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {(doc.method !== "sms" || pinVerified) && (
          <Card>
            <CardHeader><CardTitle className="text-base">Sua assinatura</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <SignatureCanvas onChange={setSignature} />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="w-4 h-4" />
                Ao assinar, você concorda em registrar IP, data/hora e hash de auditoria.
              </div>
              <Button onClick={sign} disabled={submitting || !signature} className="w-full">
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Assinar documento
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
