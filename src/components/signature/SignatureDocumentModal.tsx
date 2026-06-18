import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Copy, ExternalLink, Loader2, Trash2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId?: string | null;
  subCompanyId?: string | null;
  ownerId?: string | null;
  signerNameDefault?: string;
  signerPhoneDefault?: string;
}

type SignatureDoc = {
  id: string;
  title: string;
  status: string;
  method: string;
  created_at: string;
  signed_at: string | null;
};

const statusColor: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  viewed: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  authenticating: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  signed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  expired: "bg-red-500/15 text-red-700 dark:text-red-400",
  cancelled: "bg-gray-500/15 text-gray-700 dark:text-gray-400",
};

export function SignatureDocumentModal({ open, onOpenChange, leadId, subCompanyId, ownerId, signerNameDefault, signerPhoneDefault }: Props) {
  const { toast } = useToast();
  const [tab, setTab] = useState("new");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState<"canvas" | "email" | "sms">("canvas");
  const [signerName, setSignerName] = useState(signerNameDefault || "");
  const [signerEmail, setSignerEmail] = useState("");
  const [signerPhone, setSignerPhone] = useState(signerPhoneDefault || "");
  const [submitting, setSubmitting] = useState(false);
  const [docs, setDocs] = useState<SignatureDoc[]>([]);
  const [lastLink, setLastLink] = useState<string | null>(null);

  const loadDocs = async () => {
    if (!leadId) { setDocs([]); return; }
    const { data } = await supabase
      .from("signature_documents" as any)
      .select("id, title, status, method, created_at, signed_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });
    setDocs((data as any) || []);
  };

  useEffect(() => {
    if (!open) return;
    loadDocs();
    setSignerName(signerNameDefault || "");
    setSignerPhone(signerPhoneDefault || "");
    setLastLink(null);
    // realtime updates
    const ch = supabase
      .channel(`sig-docs-${leadId || "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "signature_documents", filter: leadId ? `lead_id=eq.${leadId}` : undefined }, () => loadDocs())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, leadId]);

  const onFile = (f: File | null) => {
    if (!f) return;
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  };

  const submit = async () => {
    if (!file) { toast({ title: "Selecione um arquivo", variant: "destructive" }); return; }
    if (!title.trim()) { toast({ title: "Informe o título", variant: "destructive" }); return; }
    if (method === "email" && !signerEmail) { toast({ title: "E-mail do signatário obrigatório", variant: "destructive" }); return; }
    if (method === "sms" && !signerPhone) { toast({ title: "Telefone do signatário obrigatório", variant: "destructive" }); return; }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const safeName = file.name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(-120);
      const path = `${user!.id}/${Date.now()}_${safeName}`;
      const up = await supabase.storage.from("signed-documents").upload(path, file, { contentType: file.type });
      if (up.error) throw up.error;

      const { data, error } = await supabase.functions.invoke("signature-document", {
        body: {
          action: "create",
          title, description, lead_id: leadId, sub_company_id: subCompanyId, owner_id: ownerId,
          method, signer_name: signerName, signer_email: signerEmail, signer_phone: signerPhone,
          original_file_path: path, send_now: true,
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);

      setLastLink(data.portal_url);
      toast({ title: "Documento criado", description: "Link de assinatura gerado." });
      setTab("history");
      setFile(null); setTitle(""); setDescription(""); setSignerEmail("");
      loadDocs();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const cancelDoc = async (id: string) => {
    await supabase.functions.invoke("signature-document", { body: { action: "cancel", document_id: id } });
    loadDocs();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" /> Assinatura Eletrônica
          </DialogTitle>
          <DialogDescription>
            Envie documentos para assinatura digital e acompanhe o status em tempo real.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="new">Novo documento</TabsTrigger>
            <TabsTrigger value="history">Histórico {docs.length > 0 && `(${docs.length})`}</TabsTrigger>
          </TabsList>

          <TabsContent value="new" className="space-y-4 pt-4">
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
                dragging ? "border-primary bg-primary/5" : "border-border"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files?.[0] || null); }}
              onClick={() => document.getElementById("sig-file-input")?.click()}
            >
              <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              {file ? (
                <p className="text-sm font-medium">{file.name}</p>
              ) : (
                <>
                  <p className="text-sm font-medium">Arraste o PDF ou clique para selecionar</p>
                  <p className="text-xs text-muted-foreground mt-1">PDF recomendado para envelopamento</p>
                </>
              )}
              <input id="sig-file-input" type="file" accept=".pdf,.png,.jpg,.jpeg" hidden onChange={(e) => onFile(e.target.files?.[0] || null)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Título *</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contrato de prestação de serviços" />
              </div>
              <div className="col-span-2">
                <Label>Descrição</Label>
                <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div>
                <Label>Método de autenticação *</Label>
                <Select value={method} onValueChange={(v: any) => setMethod(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="canvas">Assinatura em tela</SelectItem>
                    <SelectItem value="email">Token por e-mail</SelectItem>
                    <SelectItem value="sms">PIN por SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nome do signatário</Label>
                <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} />
              </div>
              {method === "email" && (
                <div className="col-span-2">
                  <Label>E-mail do signatário *</Label>
                  <Input type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} />
                </div>
              )}
              {method === "sms" && (
                <div className="col-span-2">
                  <Label>Telefone (E.164: +5511...) *</Label>
                  <Input value={signerPhone} onChange={(e) => setSignerPhone(e.target.value)} />
                </div>
              )}
            </div>

            <Button onClick={submit} disabled={submitting} className="w-full">
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Gerar link de assinatura
            </Button>

            {lastLink && (
              <div className="p-3 rounded-lg bg-muted space-y-2">
                <p className="text-xs font-semibold">Link gerado:</p>
                <div className="flex gap-2">
                  <Input value={lastLink} readOnly className="text-xs" />
                  <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(lastLink); toast({ title: "Link copiado" }); }}>
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="outline" onClick={() => window.open(lastLink, "_blank")}>
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-2 pt-4">
            {docs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum documento neste lead.</p>
            ) : docs.map((d) => (
              <div key={d.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{d.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.method.toUpperCase()} · {new Date(d.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <Badge className={statusColor[d.status] || ""}>{d.status}</Badge>
                {!["signed", "cancelled", "expired"].includes(d.status) && (
                  <Button size="icon" variant="ghost" onClick={() => cancelDoc(d.id)} title="Cancelar">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
