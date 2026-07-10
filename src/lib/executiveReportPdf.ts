import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const BRAND = 'Lead Seller';
const PRIMARY: [number, number, number] = [59, 130, 246]; // #3B82F6

const fmtDt = (iso: string) => (iso ? new Date(iso).toLocaleString('pt-BR') : '—');

function drawHeader(doc: jsPDF, title: string, subtitle: string) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, w, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(BRAND, 14, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Relatório executivo confidencial', w - 14, 14, { align: 'right' });

  doc.setTextColor(20, 20, 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, 14, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(subtitle, 14, 40);
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 14, 46);
}

function drawFooter(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(`${BRAND} · página ${i} de ${pages}`, w / 2, h - 8, { align: 'center' });
  }
}

export interface ExecutiveReportInput {
  accountName: string;
  planSlug?: string | null;
  kind: 'company' | 'sub_company';
  errors: { created_at: string; severity?: string; source?: string; route?: string; message: string }[];
  audit: { created_at: string; changed_by_name?: string; action: string; table_name: string; record_label?: string }[];
}

export function generateExecutiveReport(input: ExecutiveReportInput) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const kindLabel = input.kind === 'sub_company' ? 'Sub-empresa' : 'Empresa';
  drawHeader(
    doc,
    'Relatório de Erros & Auditoria',
    `${kindLabel}: ${input.accountName}${input.planSlug ? ` · Plano ${input.planSlug}` : ''}`,
  );

  let y = 56;
  doc.setFontSize(12);
  doc.setTextColor(20, 20, 20);
  doc.setFont('helvetica', 'bold');
  doc.text(`Erros & falhas (${input.errors.length})`, 14, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [['Quando', 'Severidade', 'Origem', 'Rota', 'Mensagem']],
    body: input.errors.length
      ? input.errors.map((e) => [
          fmtDt(e.created_at),
          e.severity || 'info',
          e.source || '—',
          e.route || '—',
          (e.message || '').slice(0, 240),
        ])
      : [['—', '—', '—', '—', 'Nenhum erro reportado no período.']],
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: PRIMARY, textColor: 255 },
    columnStyles: { 4: { cellWidth: 70 } },
    margin: { left: 14, right: 14 },
  });

  const afterErrors = (doc as any).lastAutoTable.finalY + 8;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`Auditoria (${input.audit.length})`, 14, afterErrors);

  autoTable(doc, {
    startY: afterErrors + 2,
    head: [['Quando', 'Autor', 'Ação', 'Recurso', 'Alvo']],
    body: input.audit.length
      ? input.audit.map((a) => [
          fmtDt(a.created_at),
          a.changed_by_name || '—',
          a.action,
          a.table_name,
          (a.record_label || '—').slice(0, 80),
        ])
      : [['—', '—', '—', '—', 'Sem eventos de auditoria.']],
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: PRIMARY, textColor: 255 },
    margin: { left: 14, right: 14 },
  });

  drawFooter(doc);
  const safe = input.accountName.replace(/[^\w\-]+/g, '_').slice(0, 40);
  doc.save(`leadseller_${safe}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
