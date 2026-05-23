/**
 * TransLingua — Dosya Dışa Aktarımı
 *
 * PDF: iframe + tarayıcı baskı motoru — tam Unicode/Türkçe desteği (ş, ğ, ı, ö, ü, ç)
 * DOCX: docx kütüphanesi
 * TXT: ham metin
 */
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
} from 'docx';
import { saveAs } from 'file-saver';

// ─── Markdown ayrıştırma ────────────────────────────────────────────────────
type Block =
  | { type: 'h1' | 'h2' | 'h3' | 'h4'; text: string }
  | { type: 'p'; runs: InlineRun[] }
  | { type: 'ul'; items: InlineRun[][] }
  | { type: 'ol'; items: InlineRun[][] }
  | { type: 'quote'; text: string }
  | { type: 'code'; lang: string; code: string }
  | { type: 'hr' };

interface InlineRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

function parseInline(line: string): InlineRun[] {
  const runs: InlineRun[] = [];
  let i = 0;
  let buf = '';
  const flush = (style: Partial<InlineRun> = {}) => {
    if (buf) runs.push({ text: buf, ...style });
    buf = '';
  };
  while (i < line.length) {
    if (line.slice(i, i + 2) === '**') {
      flush();
      const end = line.indexOf('**', i + 2);
      if (end === -1) { buf += '**'; i += 2; continue; }
      runs.push({ text: line.slice(i + 2, end), bold: true });
      i = end + 2;
      continue;
    }
    if (line[i] === '*' && line[i + 1] !== '*') {
      flush();
      const end = line.indexOf('*', i + 1);
      if (end === -1) { buf += '*'; i++; continue; }
      runs.push({ text: line.slice(i + 1, end), italic: true });
      i = end + 1;
      continue;
    }
    if (line[i] === '`') {
      flush();
      const end = line.indexOf('`', i + 1);
      if (end === -1) { buf += '`'; i++; continue; }
      runs.push({ text: line.slice(i + 1, end), code: true });
      i = end + 1;
      continue;
    }
    buf += line[i];
    i++;
  }
  flush();
  return runs.length ? runs : [{ text: line }];
}

export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      blocks.push({ type: 'code', lang, code: codeLines.join('\n') });
      continue;
    }

    const hMatch = line.match(/^(#{1,4})\s+(.*)$/);
    if (hMatch) {
      const level = hMatch[1].length as 1 | 2 | 3 | 4;
      const types = { 1: 'h1', 2: 'h2', 3: 'h3', 4: 'h4' } as const;
      blocks.push({ type: types[level], text: hMatch[2].trim() });
      i++;
      continue;
    }

    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ type: 'quote', text: quoteLines.join(' ') });
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items: InlineRun[][] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(parseInline(lines[i].replace(/^\d+\.\s/, '')));
        i++;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    if (/^[-*]\s/.test(line)) {
      const items: InlineRun[][] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(parseInline(lines[i].replace(/^[-*]\s/, '')));
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    const pLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].match(/^(#{1,4}|>\s|```|---+$|[-*]\s|\d+\.\s)/)
    ) {
      pLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: 'p', runs: parseInline(pLines.join(' ')) });
  }
  return blocks;
}

// ─── HTML yardımcıları ──────────────────────────────────────────────────────
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function runsToHTML(runs: InlineRun[]): string {
  return runs.map(r => {
    let t = escapeHtml(r.text);
    if (r.code) t = `<code>${t}</code>`;
    if (r.bold && r.italic) t = `<strong><em>${t}</em></strong>`;
    else if (r.bold) t = `<strong>${t}</strong>`;
    else if (r.italic) t = `<em>${t}</em>`;
    return t;
  }).join('');
}

function blocksToHTML(blocks: Block[]): string {
  return blocks.map(b => {
    switch (b.type) {
      case 'h1': return `<h1>${escapeHtml(b.text)}</h1>`;
      case 'h2': return `<h2>${escapeHtml(b.text)}</h2>`;
      case 'h3': return `<h3>${escapeHtml(b.text)}</h3>`;
      case 'h4': return `<h4>${escapeHtml(b.text)}</h4>`;
      case 'p': return `<p>${runsToHTML(b.runs)}</p>`;
      case 'ul': return `<ul>${b.items.map(i => `<li>${runsToHTML(i)}</li>`).join('')}</ul>`;
      case 'ol': return `<ol>${b.items.map((it, n) => `<li value="${n + 1}">${runsToHTML(it)}</li>`).join('')}</ol>`;
      case 'quote': return `<blockquote><p>${escapeHtml(b.text)}</p></blockquote>`;
      case 'code': return `<pre><code>${escapeHtml(b.code)}</code></pre>`;
      case 'hr': return `<hr>`;
      default: return '';
    }
  }).join('\n');
}

// ─── PDF dışa aktarma (iframe + tarayıcı baskı motoru) ──────────────────────
// jsPDF dahili fontları Latin-1 ile sınırlı; Türkçe karakterleri bozar.
// Tarayıcının yerleşik yazı tipi sistemi tüm Unicode'u doğru render eder.
interface PDFExportOpts {
  filename: string;
  title?: string;
  subtitle?: string;
}

export function exportMarkdownToPDF(markdown: string, opts: PDFExportOpts): Promise<void> {
  return new Promise(resolve => {
    const content = blocksToHTML(parseMarkdown(markdown));
    const title = escapeHtml(opts.title ?? opts.filename.replace(/\.pdf$/i, ''));
    const subtitle = opts.subtitle ? escapeHtml(opts.subtitle) : '';
    const date = new Date().toLocaleDateString('tr-TR', {
      day: 'numeric', month: 'long', year: 'numeric',
    });

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:none;opacity:0;pointer-events:none';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) { document.body.removeChild(iframe); resolve(); return; }

    doc.open();
    doc.write(`<!DOCTYPE html>
<html lang="tr"><head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;font-size:13.5px;line-height:1.75;color:#1a1a1a}
.pg{max-width:720px;margin:0 auto;padding:48px 56px 80px}
.hdr{margin-bottom:28px;padding-bottom:18px;border-bottom:1.5px solid #e8e8e8}
.htl{font-size:22px;font-weight:700;color:#0f0f0f;letter-spacing:-.02em;margin-bottom:5px}
.hsb{font-size:12.5px;color:#888}
h1{font-size:19px;font-weight:700;color:#111;margin:26px 0 9px;letter-spacing:-.01em}
h2{font-size:16px;font-weight:700;color:#222;margin:20px 0 8px}
h3{font-size:14px;font-weight:600;color:#333;margin:15px 0 6px}
h4{font-size:13px;font-weight:600;color:#444;margin:11px 0 5px}
p{margin-bottom:10px;color:#222}
ul,ol{margin:6px 0 12px 20px}
li{margin-bottom:4px;color:#222}
blockquote{border-left:3px solid #4f46e5;padding:9px 14px;color:#555;background:#f8f7ff;margin:11px 0;border-radius:0 5px 5px 0}
code{font-family:'Menlo','Consolas',monospace;font-size:11.5px;background:#f4f4f4;color:#c7254e;padding:2px 5px;border-radius:3px}
pre{font-family:'Menlo','Consolas',monospace;font-size:11.5px;background:#f5f5f5;padding:12px 14px;border-radius:6px;margin:10px 0;border:1px solid #e8e8e8;overflow:hidden}
pre code{background:none;padding:0;color:#333}
table{width:100%;border-collapse:collapse;margin:12px 0;font-size:12.5px}
th{background:#f5f5f7;font-weight:600;text-align:left;padding:7px 11px;border:1px solid #ddd}
td{padding:6px 11px;border:1px solid #ddd}
tr:nth-child(even){background:#fafafa}
hr{border:none;border-top:1px solid #e5e5e5;margin:20px 0}
strong{font-weight:600;color:#111}
em{font-style:italic}
.ftr{margin-top:36px;padding-top:13px;border-top:1px solid #e8e8e8;font-size:11.5px;color:#aaa;display:flex;justify-content:space-between}
@page{margin:20mm 22mm}
@media print{h1,h2,h3,h4{page-break-after:avoid}pre,table,blockquote{page-break-inside:avoid}}
</style></head>
<body>
<div class="pg">
${title ? `<div class="hdr"><div class="htl">${title}</div>${subtitle ? `<div class="hsb">${subtitle}</div>` : ''}</div>` : ''}
${content}
<div class="ftr"><span>TransWordly</span><span>${date}</span></div>
</div>
</body></html>`);
    doc.close();

    const doPrint = () => {
      iframe.contentWindow?.print();
      setTimeout(() => { document.body.removeChild(iframe); resolve(); }, 500);
    };

    if (doc.readyState === 'complete') {
      doPrint();
    } else {
      iframe.onload = doPrint;
    }
  });
}

// ─── DOCX dışa aktarma ─────────────────────────────────────────────────────
function runsToDocx(runs: InlineRun[]): TextRun[] {
  return runs.map(r => new TextRun({
    text: r.text,
    bold: r.bold,
    italics: r.italic,
    font: r.code ? 'Consolas' : undefined,
    color: r.code ? 'B83232' : undefined,
  }));
}

export async function exportMarkdownToDOCX(markdown: string, opts: PDFExportOpts): Promise<void> {
  const blocks = parseMarkdown(markdown);
  const children: Paragraph[] = [];

  if (opts.title) {
    children.push(new Paragraph({
      children: [new TextRun({ text: opts.title, bold: true, size: 36 })],
      spacing: { after: 200 },
    }));
  }
  if (opts.subtitle) {
    children.push(new Paragraph({
      children: [new TextRun({ text: opts.subtitle, italics: true, color: '777777', size: 20 })],
      spacing: { after: 300 },
    }));
  }

  for (const b of blocks) {
    switch (b.type) {
      case 'h1':
        children.push(new Paragraph({ text: b.text, heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 } }));
        break;
      case 'h2':
        children.push(new Paragraph({ text: b.text, heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }));
        break;
      case 'h3':
        children.push(new Paragraph({ text: b.text, heading: HeadingLevel.HEADING_3, spacing: { before: 160, after: 80 } }));
        break;
      case 'h4':
        children.push(new Paragraph({ text: b.text, heading: HeadingLevel.HEADING_4, spacing: { before: 120, after: 60 } }));
        break;
      case 'p':
        children.push(new Paragraph({ children: runsToDocx(b.runs), spacing: { after: 160 } }));
        break;
      case 'ul':
        b.items.forEach(item => {
          children.push(new Paragraph({ children: runsToDocx(item), bullet: { level: 0 }, spacing: { after: 80 } }));
        });
        break;
      case 'ol':
        b.items.forEach((item, idx) => {
          children.push(new Paragraph({
            children: [new TextRun({ text: `${idx + 1}. ` }), ...runsToDocx(item)],
            spacing: { after: 80 },
          }));
        });
        break;
      case 'quote':
        children.push(new Paragraph({
          children: [new TextRun({ text: b.text, italics: true, color: '666666' })],
          alignment: AlignmentType.LEFT,
          indent: { left: 360 },
          spacing: { after: 160 },
        }));
        break;
      case 'code':
        children.push(new Paragraph({
          children: [new TextRun({ text: b.code, font: 'Consolas', size: 18 })],
          shading: { type: 'clear', color: 'auto', fill: 'F5F5F7' },
          spacing: { after: 160 },
        }));
        break;
      case 'hr':
        children.push(new Paragraph({
          text: '',
          border: { bottom: { color: 'CCCCCC', size: 6, space: 1, style: 'single' } },
        }));
        break;
    }
  }

  const document = new Document({
    creator: 'TransWordly',
    title: opts.title || opts.filename,
    sections: [{ children }],
  });
  const blob = await Packer.toBlob(document);
  saveAs(blob, opts.filename);
}

// ─── Ham metin (txt) ────────────────────────────────────────────────────────
export function exportMarkdownToTxt(markdown: string, filename: string): void {
  const plain = markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^>\s+/gm, '')
    .replace(/^[-*]\s+/gm, '• ');
  const blob = new Blob([plain], { type: 'text/plain;charset=utf-8' });
  saveAs(blob, filename);
}
