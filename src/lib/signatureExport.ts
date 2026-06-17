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
  creator_name?: string | null;
  creator_role?: string | null;
  sub_company_name?: string | null;
};

export type ExportColumnKey =
  | 'id'
  | 'title'
  | 'signer'
  | 'signer_email'
  | 'status'
  | 'method'
  | 'creator_name'
  | 'creator_role'
  | 'sub_company_name'
  | 'created_at'
  | 'signed_at'
  | 'expires_at';

export const ALL_EXPORT_COLUMNS: { key: ExportColumnKey; label: string }[] = [
  { key: 'id', label: 'ID' },
  { key: 'title', label: 'Título' },
  { key: 'signer', label: 'Signatário' },
  { key: 'signer_email', label: 'E-mail do signatário' },
  { key: 'status', label: 'Status' },
  { key: 'method', label: 'Método' },
  { key: 'creator_name', label: 'Criado por' },
  { key: 'creator_role', label: 'Cargo do criador' },
  { key: 'sub_company_name', label: 'Sub-empresa' },
  { key: 'created_at', label: 'Criado em' },
  { key: 'signed_at', label: 'Assinado em' },
  { key: 'expires_at', label: 'Expira em' },
];

export const DEFAULT_EXPORT_COLUMNS: ExportColumnKey[] = [
  'title', 'signer', 'status', 'method', 'creator_name', 'sub_company_name', 'created_at', 'signed_at',
];

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

const cellValue = (d: ExportDoc, key: ExportColumnKey): string => {
  switch (key) {
    case 'id': return d.id;
    case 'title': return d.title;
    case 'signer': return d.signer_name ?? '—';
    case 'signer_email': return d.signer_email ?? '';
    case 'status': return STATUS_LABEL[d.status] ?? d.status;
    case 'method': return d.method;
    case 'creator_name': return d.creator_name ?? '—';
    case 'creator_role': return d.creator_role ?? '—';
    case 'sub_company_name': return d.sub_company_name ?? '—';
    case 'created_at': return fmt(d.created_at);
    case 'signed_at': return fmt(d.signed_at);
    case 'expires_at': return fmt(d.expires_at);
  }
};

export function exportSignaturesCSV(
  docs: ExportDoc[],
  columns: ExportColumnKey[] = DEFAULT_EXPORT_COLUMNS,
  filename = 'assinaturas.csv',
) {
  const cols = columns.length ? columns : DEFAULT_EXPORT_COLUMNS;
  const headers = cols.map((k) => ALL_EXPORT_COLUMNS.find((c) => c.key === k)!.label);
  const escape = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
  const rows = docs.map((d) => cols.map((k) => escape(cellValue(d, k))).join(','));
  const csv = '\uFEFF' + [headers.map(escape).join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportSignaturesPDF(
  docs: ExportDoc[],
  filters: Record<string, string> = {},
  columns: ExportColumnKey[] = DEFAULT_EXPORT_COLUMNS,
  filename = 'assinaturas.pdf',
) {
  const cols = columns.length ? columns : DEFAULT_EXPORT_COLUMNS;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt' });
  pdf.setFontSize(16);
  pdf.text('Relatório de Assinaturas', 40, 40);
  pdf.setFontSize(9);
  pdf.setTextColor(120);
  pdf.text(`Gerado em ${new Date().toLocaleString('pt-BR')} · ${docs.length} registro(s)`, 40, 56);
  const filterStr = Object.entries(filters).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ');
  if (filterStr) pdf.text(`Filtros — ${filterStr}`, 40, 70);
  pdf.setTextColor(0);

  autoTable(pdf, {
    startY: 84,
    head: [cols.map((k) => ALL_EXPORT_COLUMNS.find((c) => c.key === k)!.label)],
    body: docs.map((d) => cols.map((k) => cellValue(d, k))),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [59, 130, 246] },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });

  pdf.save(filename);
}
