// Shared CSV + PDF export helpers for the CEO performance dashboards.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export type Row = Record<string, string | number | null | undefined>;

function csvEscape(v: any): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename: string, rows: Row[]) {
  if (!rows.length) {
    const blob = new Blob(['\uFEFF'], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, filename);
    return;
  }
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(';'), ...rows.map(r => headers.map(h => csvEscape(r[h])).join(';'))];
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}

export function downloadPdf(
  filename: string,
  title: string,
  subtitle: string,
  kpis: { label: string; value: string | number }[],
  rows: Row[],
) {
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(16);
  doc.text(title, 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(subtitle, 14, 22);
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 14, 27);
  doc.setTextColor(0);

  if (kpis.length) {
    autoTable(doc, {
      startY: 32,
      head: [kpis.map(k => k.label)],
      body: [kpis.map(k => String(k.value))],
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 9 },
    });
  }

  if (rows.length) {
    const headers = Object.keys(rows[0]);
    autoTable(doc, {
      startY: ((doc as any).lastAutoTable?.finalY ?? 32) + 6,
      head: [headers],
      body: rows.map(r => headers.map(h => (r[h] ?? '').toString())),
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59] },
      styles: { fontSize: 8 },
    });
  }

  doc.save(filename);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
