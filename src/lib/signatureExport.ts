import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export type ExportDoc = {
  id: string;
  title: string;
  signer_name?: string | null;
  signer_email?: string | null;
  status: string;
  method: string;
  created_at: string;
  signed_at?: string | null;
  expires_at?: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  pending: 'Aguardando Assinatura',
  viewed: 'Visualizado',
  authenticating: 'Processando',
  signed: 'Assinado',
  expired: 'Expirado',
  cancelled: 'Cancelado',
};

const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export function exportSignaturesCSV(docs: ExportDoc[], filename = 'assinaturas.csv') {
  const headers = ['ID', 'Título', 'Signatário', 'E-mail', 'Status', 'Método', 'Criado em', 'Assinado em', 'Expira em'];
  const escape = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
  const rows = docs.map((d) =>
    [
      d.id,
      d.title,
      d.signer_name ?? '',
      d.signer_email ?? '',
      STATUS_LABEL[d.status] ?? d.status,
      d.method,
      fmt(d.created_at),
      fmt(d.signed_at),
      fmt(d.expires_at),
    ].map(escape).join(','),
  );
  const csv = '\uFEFF' + [headers.map(escape).join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportSignaturesPDF(docs: ExportDoc[], filters: Record<string, string> = {}, filename = 'assinaturas.pdf') {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt' });
  pdf.setFontSize(16);
  pdf.text('Relatório de Assinaturas', 40, 40);
  pdf.setFontSize(9);
  pdf.setTextColor(120);
  pdf.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 40, 56);
  const filterStr = Object.entries(filters).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ');
  if (filterStr) pdf.text(`Filtros — ${filterStr}`, 40, 70);
  pdf.setTextColor(0);

  autoTable(pdf, {
    startY: 84,
    head: [['Título', 'Signatário', 'Status', 'Método', 'Criado', 'Assinado']],
    body: docs.map((d) => [
      d.title,
      `${d.signer_name ?? '—'}\n${d.signer_email ?? ''}`,
      STATUS_LABEL[d.status] ?? d.status,
      d.method,
      fmt(d.created_at),
      fmt(d.signed_at),
    ]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [59, 130, 246] },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });

  pdf.save(filename);
}
