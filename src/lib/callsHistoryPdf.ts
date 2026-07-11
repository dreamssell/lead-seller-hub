// Exportação em PDF do histórico de ligações filtrado.
// Estrutura: cabeçalho com logo Lead Seller, título, data/hora,
// KPIs, gráfico de barras (chamadas por dia) e tabela detalhada.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoUrl from '@/assets/logo.png';
import { formatCallDuration, formatDuration, getReliableCallDurationSeconds } from './callHistory';

const PRIMARY: [number, number, number] = [59, 130, 246]; // #3B82F6
const ACCENT: [number, number, number] = [16, 185, 129]; // emerald
const DANGER: [number, number, number] = [239, 68, 68];
const AMBER: [number, number, number] = [245, 158, 11];
const INK: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [107, 114, 128];

export interface CallHistoryPdfRow {
  started_at: string;
  answered_at?: string | null;
  ended_at?: string | null;
  duration_seconds: number;
  contact_name?: string | null;
  phone_number: string;
  direction: string;
  status: string;
  channel: string;
  connection_label?: string | null;
  user_name?: string | null;
}

interface Options {
  title?: string;
  subtitle?: string;
  filterSummary?: string;
}

const fmtDt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR') : '—');
const fmtTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

const directionLabel = (d: string) => (d === 'inbound' ? 'Recebida' : 'Efetuada');
const statusLabel = (s: string, d: string) => {
  const map: Record<string, string> = {
    answered: 'Atendida',
    ended: d === 'inbound' ? 'Recebida' : 'Efetuada',
    missed: d === 'inbound' ? 'Perdida' : 'Não atendida',
    failed: 'Falhou',
    rejected: 'Rejeitada',
    initiated: 'Iniciando',
    ringing: 'Chamando',
  };
  return map[s] || s;
};

const isAnswered = (r: CallHistoryPdfRow) => r.status === 'answered' || (r.status === 'ended' && !!r.answered_at);

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch(logoUrl);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function drawHeader(doc: jsPDF, logo: string | null, title: string, subtitle?: string) {
  const w = doc.internal.pageSize.getWidth();
  // Faixa colorida
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, w, 26, 'F');

  // Logo
  if (logo) {
    try { doc.addImage(logo, 'PNG', 12, 6, 14, 14); } catch { /* ignore */ }
  }
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.text('Lead Seller', 30, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Histórico de Ligações · Relatório operacional', 30, 20);

  const now = new Date();
  doc.setFontSize(9);
  doc.text(`${now.toLocaleDateString('pt-BR')} · ${now.toLocaleTimeString('pt-BR')}`, w - 12, 14, { align: 'right' });

  // Título
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(title, 12, 40);
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text(subtitle, 12, 46);
  }
}

function drawKpiCards(
  doc: jsPDF,
  y: number,
  kpis: { label: string; value: string; color?: [number, number, number] }[],
) {
  const w = doc.internal.pageSize.getWidth();
  const marginX = 12;
  const gap = 4;
  const cardW = (w - marginX * 2 - gap * (kpis.length - 1)) / kpis.length;
  const cardH = 22;
  kpis.forEach((k, i) => {
    const x = marginX + i * (cardW + gap);
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, y, cardW, cardH, 2, 2, 'FD');
    // Barra colorida à esquerda
    const c = k.color || PRIMARY;
    doc.setFillColor(...c);
    doc.roundedRect(x, y, 1.6, cardH, 0.5, 0.5, 'F');
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(k.label.toUpperCase(), x + 5, y + 7);
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(k.value, x + 5, y + 17);
  });
  return y + cardH;
}

function drawBarChart(
  doc: jsPDF,
  y: number,
  title: string,
  data: { label: string; value: number }[],
): number {
  const w = doc.internal.pageSize.getWidth();
  const marginX = 12;
  const chartW = w - marginX * 2;
  const chartH = 60;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(title, marginX, y);

  const top = y + 4;
  // Card
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(marginX, top, chartW, chartH, 2, 2, 'FD');

  if (data.length === 0) {
    doc.setTextColor(...MUTED);
    doc.setFontSize(9);
    doc.text('Sem dados no período.', marginX + chartW / 2, top + chartH / 2, { align: 'center' });
    return top + chartH;
  }

  const innerX = marginX + 6;
  const innerY = top + 6;
  const innerW = chartW - 12;
  const innerH = chartH - 18;
  const max = Math.max(...data.map((d) => d.value), 1);
  const barGap = 3;
  const barW = Math.max(2, (innerW - barGap * (data.length - 1)) / data.length);

  // Grid lines
  doc.setDrawColor(241, 245, 249);
  for (let i = 1; i <= 4; i++) {
    const gy = innerY + (innerH / 4) * i;
    doc.line(innerX, gy, innerX + innerW, gy);
  }

  data.forEach((d, i) => {
    const bx = innerX + i * (barW + barGap);
    const h = (d.value / max) * innerH;
    const by = innerY + innerH - h;
    doc.setFillColor(...PRIMARY);
    doc.roundedRect(bx, by, barW, h, 0.8, 0.8, 'F');
    // Label eixo X (a cada N)
    const step = Math.ceil(data.length / 12);
    if (i % step === 0) {
      doc.setTextColor(...MUTED);
      doc.setFontSize(7);
      doc.text(d.label, bx + barW / 2, top + chartH - 3, { align: 'center' });
    }
  });

  return top + chartH;
}

function drawFooter(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`Lead Seller · Histórico de Ligações · página ${i} de ${pages}`, w / 2, h - 8, { align: 'center' });
  }
}

export async function exportCallHistoryPdf(rows: CallHistoryPdfRow[], opts: Options = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const logo = await loadLogoDataUrl();
  drawHeader(
    doc,
    logo,
    opts.title || 'Histórico de Ligações',
    opts.subtitle || `${rows.length} ${rows.length === 1 ? 'chamada' : 'chamadas'} · ${opts.filterSummary || 'Todos os filtros'}`,
  );

  // KPIs
  const total = rows.length;
  const answered = rows.filter(isAnswered).length;
  const missed = rows.filter((r) => /missed|fail|rejected/i.test(r.status)).length;
  const inbound = rows.filter((r) => r.direction === 'inbound').length;
  const outbound = rows.filter((r) => r.direction === 'outbound').length;
  const reliableDurations = rows
    .map((r) => getReliableCallDurationSeconds(r))
    .filter((v): v is number => v !== null);
  const totalDur = reliableDurations.reduce((s, v) => s + v, 0);
  const avgDur = reliableDurations.length ? Math.round(totalDur / reliableDurations.length) : 0;
  const answerRate = total ? Math.round((answered / total) * 100) : 0;

  const afterKpis = drawKpiCards(doc, 52, [
    { label: 'Total', value: String(total) },
    { label: 'Atendidas', value: String(answered), color: ACCENT },
    { label: 'Perdidas', value: String(missed), color: DANGER },
    { label: 'Recebidas', value: String(inbound) },
    { label: 'Efetuadas', value: String(outbound) },
    { label: 'Taxa atend.', value: `${answerRate}%`, color: AMBER },
    { label: 'Duração total', value: formatDuration(totalDur) },
    { label: 'Duração média', value: formatDuration(avgDur) },
  ]);

  // Gráfico por dia
  const byDay: Record<string, number> = {};
  rows.forEach((r) => {
    const d = new Date(r.started_at);
    const k = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    byDay[k] = (byDay[k] || 0) + 1;
  });
  const chartData = Object.entries(byDay).map(([label, value]) => ({ label, value })).slice(-30);
  const afterChart = drawBarChart(doc, afterKpis + 10, 'Volume diário de chamadas', chartData);

  // Tabela detalhada
  autoTable(doc, {
    startY: afterChart + 8,
    head: [['Data', 'Contato', 'Número', 'Direção', 'Status', 'Atendida em', 'Duração', 'Canal/Conexão', 'Usuário']],
    body: rows.map((r) => [
      fmtDt(r.started_at),
      r.contact_name || '—',
      r.phone_number,
      directionLabel(r.direction),
      statusLabel(r.status, r.direction),
      fmtTime(r.answered_at),
      formatCallDuration(r),
      r.connection_label || r.channel || '—',
      r.user_name || '—',
    ]),
    styles: { fontSize: 8, cellPadding: 2, textColor: INK },
    headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 12, right: 12 },
    didDrawPage: () => {
      // Repete um cabeçalho pequeno em páginas subsequentes
      if (doc.getCurrentPageInfo().pageNumber > 1) {
        drawHeader(doc, logo, opts.title || 'Histórico de Ligações', opts.subtitle);
      }
    },
  });

  drawFooter(doc);
  doc.save(`historico-chamadas-${new Date().toISOString().slice(0, 10)}.pdf`);
}
