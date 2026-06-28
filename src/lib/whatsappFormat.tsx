import React from 'react';

/**
 * Renders WhatsApp-style formatting inside a string:
 *  *bold*  _italic_  ~strike~  `mono`
 * Also auto-linkifies http(s) URLs.
 */
export function renderWhatsAppText(text: string): React.ReactNode {
  if (!text) return null;

  // Tokenize across paragraphs preserving newlines.
  const lines = text.split('\n');
  return lines.map((line, li) => (
    <React.Fragment key={li}>
      {parseLine(line)}
      {li < lines.length - 1 && <br />}
    </React.Fragment>
  ));
}

const PATTERNS: Array<{ re: RegExp; render: (inner: string, key: string) => React.ReactNode }> = [
  { re: /\*([^*\n]+)\*/g, render: (s, k) => <strong key={k} className="font-bold">{s}</strong> },
  { re: /_([^_\n]+)_/g, render: (s, k) => <em key={k} className="italic">{s}</em> },
  { re: /~([^~\n]+)~/g, render: (s, k) => <span key={k} className="line-through opacity-80">{s}</span> },
  { re: /`([^`\n]+)`/g, render: (s, k) => <code key={k} className="font-mono text-[0.85em] bg-black/10 dark:bg-white/10 rounded px-1">{s}</code> },
];

const URL_RE = /(https?:\/\/[^\s]+)/g;

function parseLine(line: string): React.ReactNode[] {
  // collect format matches with indices
  type M = { start: number; end: number; node: React.ReactNode };
  const matches: M[] = [];
  for (const { re, render } of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      matches.push({ start: m.index, end: m.index + m[0].length, node: render(m[1], `f${m.index}`) });
    }
  }
  URL_RE.lastIndex = 0;
  let um: RegExpExecArray | null;
  while ((um = URL_RE.exec(line))) {
    const href = um[1];
    matches.push({
      start: um.index,
      end: um.index + href.length,
      node: <a key={`u${um.index}`} href={href} target="_blank" rel="noreferrer" className="underline opacity-90">{href}</a>,
    });
  }
  matches.sort((a, b) => a.start - b.start);
  // de-overlap
  const clean: M[] = [];
  let cursor = 0;
  for (const mm of matches) {
    if (mm.start < cursor) continue;
    clean.push(mm);
    cursor = mm.end;
  }
  const out: React.ReactNode[] = [];
  let i = 0;
  clean.forEach((mm, idx) => {
    if (mm.start > i) out.push(line.slice(i, mm.start));
    out.push(<React.Fragment key={`m${idx}`}>{mm.node}</React.Fragment>);
    i = mm.end;
  });
  if (i < line.length) out.push(line.slice(i));
  return out;
}
