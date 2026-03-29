export type MarkdownLineTone = 'normal' | 'muted' | 'info' | 'success' | 'warning' | 'error';

export interface MarkdownRenderedLine {
  text: string;
  tone: MarkdownLineTone;
}

type TableAlignment = 'left' | 'center' | 'right';

export interface MarkdownRenderOptions {
  maxWidth?: number;
  tableMinColumnWidth?: number;
}

const DEFAULT_RENDER_WIDTH = Math.max(40, (process.stdout.columns || 100) - 2);
const DEFAULT_MIN_COLUMN_WIDTH = 6;

function normalizeInlineMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1');
}

function looksLikeTableRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.includes('|')) {
    return false;
  }
  const cells = parseTableRow(trimmed);
  return cells.length >= 2;
}

function parseTableRow(line: string): string[] {
  const trimmed = line.trim();
  const withoutEdges = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return withoutEdges.split('|').map((cell) => normalizeInlineMarkdown(cell.trim()));
}

function parseTableAlignments(separatorLine: string): TableAlignment[] | undefined {
  const cells = parseTableRow(separatorLine).map((cell) => cell.replace(/\s+/g, ''));
  if (cells.length < 2) {
    return undefined;
  }
  const alignments: TableAlignment[] = [];
  for (const cell of cells) {
    if (!/^:?-{3,}:?$/.test(cell)) {
      return undefined;
    }
    if (cell.startsWith(':') && cell.endsWith(':')) {
      alignments.push('center');
    } else if (cell.endsWith(':')) {
      alignments.push('right');
    } else {
      alignments.push('left');
    }
  }
  return alignments;
}

function alignCell(text: string, width: number, alignment: TableAlignment): string {
  const safe = text ?? '';
  const pad = Math.max(width - safe.length, 0);
  if (alignment === 'right') {
    return `${' '.repeat(pad)}${safe}`;
  }
  if (alignment === 'center') {
    const left = Math.floor(pad / 2);
    const right = pad - left;
    return `${' '.repeat(left)}${safe}${' '.repeat(right)}`;
  }
  return `${safe}${' '.repeat(pad)}`;
}

function wrapWord(word: string, width: number): string[] {
  if (word.length <= width) {
    return [word];
  }
  const chunks: string[] = [];
  for (let index = 0; index < word.length; index += width) {
    chunks.push(word.slice(index, index + width));
  }
  return chunks;
}

function wrapPlainLine(line: string, width: number): string[] {
  const normalized = line.trim();
  if (!normalized) {
    return [''];
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [''];
  }

  const wrapped: string[] = [];
  let current = '';

  for (const word of words) {
    if (word.length > width) {
      if (current) {
        wrapped.push(current);
        current = '';
      }
      const chunks = wrapWord(word, width);
      const last = chunks.pop();
      wrapped.push(...chunks);
      current = last || '';
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= width) {
      current = candidate;
    } else {
      if (current) {
        wrapped.push(current);
      }
      current = word;
    }
  }

  if (current || wrapped.length === 0) {
    wrapped.push(current);
  }
  return wrapped;
}

function wrapCellText(text: string, width: number): string[] {
  const paragraphs = (text || '').split('\n');
  const out: string[] = [];
  for (let index = 0; index < paragraphs.length; index += 1) {
    out.push(...wrapPlainLine(paragraphs[index] ?? '', width));
    if (index < paragraphs.length - 1) {
      out.push('');
    }
  }
  return out.length > 0 ? out : [''];
}

function fitTableWidths(widths: number[], maxWidth: number, minColumnWidth: number): number[] {
  const count = widths.length;
  if (count === 0) {
    return widths;
  }
  const structuralWidth = (count * 3) + 1;
  const availableContentWidth = Math.max(maxWidth - structuralWidth, count * 3);
  const fitted = [...widths];
  const preferredMin = Math.max(3, minColumnWidth);
  let minWidths = fitted.map((width) => Math.min(width, preferredMin));
  const minTotal = minWidths.reduce((sum, width) => sum + width, 0);
  if (minTotal > availableContentWidth) {
    minWidths = fitted.map((width) => Math.min(width, 3));
  }

  const sumWidths = () => fitted.reduce((sum, width) => sum + width, 0);
  while (sumWidths() > availableContentWidth) {
    let targetIndex = -1;
    for (let index = 0; index < fitted.length; index += 1) {
      if (fitted[index] > minWidths[index]) {
        if (targetIndex === -1 || fitted[index] > fitted[targetIndex]) {
          targetIndex = index;
        }
      }
    }
    if (targetIndex === -1) {
      break;
    }
    fitted[targetIndex] -= 1;
  }

  return fitted;
}

function formatTableRows(
  header: string[],
  rows: string[][],
  alignments: TableAlignment[] | undefined,
  maxWidth: number,
  minColumnWidth: number,
): string[] {
  const columnCount = Math.max(
    header.length,
    ...rows.map((row) => row.length),
  );
  const normalizedHeader = Array.from({ length: columnCount }, (_, index) => header[index] ?? '');
  const normalizedRows = rows.map((row) => Array.from({ length: columnCount }, (_, index) => row[index] ?? ''));
  const normalizedAlignments = Array.from({ length: columnCount }, (_, index) => alignments?.[index] ?? 'left');
  const initialWidths = Array.from({ length: columnCount }, (_, index) => {
    return Math.max(
      normalizedHeader[index].length,
      ...normalizedRows.map((row) => row[index].length),
      3,
    );
  });
  const widths = fitTableWidths(initialWidths, maxWidth, minColumnWidth);

  const drawBorder = (left: string, cross: string, right: string) =>
    `${left}${widths.map((width) => '─'.repeat(width + 2)).join(cross)}${right}`;
  const drawRowLines = (cells: string[]): string[] => {
    const wrappedCells = cells.map((cell, index) => wrapCellText(cell, widths[index]));
    const lineCount = wrappedCells.reduce((max, lines) => Math.max(max, lines.length), 1);
    const output: string[] = [];
    for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
      const values = wrappedCells.map((lines) => lines[lineIndex] ?? '');
      output.push(`│ ${values.map((value, index) => alignCell(value, widths[index], normalizedAlignments[index])).join(' │ ')} │`);
    }
    return output;
  };

  const output: string[] = [];
  output.push(drawBorder('┌', '┬', '┐'));
  output.push(...drawRowLines(normalizedHeader));
  output.push(drawBorder('├', '┼', '┤'));
  normalizedRows.forEach((row) => {
    output.push(...drawRowLines(row));
  });
  output.push(drawBorder('└', '┴', '┘'));
  return output;
}

export function renderMarkdownLines(markdown: string, options?: MarkdownRenderOptions): MarkdownRenderedLine[] {
  const normalized = markdown.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return [];
  }
  const maxWidth = Math.max(40, options?.maxWidth || DEFAULT_RENDER_WIDTH);
  const minColumnWidth = Math.max(3, options?.tableMinColumnWidth || DEFAULT_MIN_COLUMN_WIDTH);

  const lines = normalized.split('\n');
  const rendered: MarkdownRenderedLine[] = [];
  let inCodeBlock = false;
  let emptyStreak = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const raw = line.replace(/\t/g, '  ');

    if (raw.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      rendered.push({ text: inCodeBlock ? '```' : '```', tone: 'muted' });
      emptyStreak = 0;
      continue;
    }

    if (inCodeBlock) {
      rendered.push({ text: `  ${raw}`, tone: 'muted' });
      emptyStreak = 0;
      continue;
    }

    if (raw.trim().length === 0) {
      emptyStreak += 1;
      if (emptyStreak <= 1) {
        rendered.push({ text: '', tone: 'normal' });
      }
      continue;
    }

    emptyStreak = 0;

    if (looksLikeTableRow(raw) && index + 1 < lines.length) {
      const alignments = parseTableAlignments(lines[index + 1] ?? '');
      if (alignments) {
        const header = parseTableRow(raw);
        const rows: string[][] = [];
        let cursor = index + 2;
        while (cursor < lines.length && looksLikeTableRow(lines[cursor] ?? '')) {
          rows.push(parseTableRow(lines[cursor] ?? ''));
          cursor += 1;
        }

        for (const row of formatTableRows(header, rows, alignments, maxWidth, minColumnWidth)) {
          rendered.push({ text: row, tone: 'muted' });
        }
        index = cursor - 1;
        continue;
      }
    }

    const heading = raw.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      rendered.push({ text: normalizeInlineMarkdown(heading[2]), tone: 'info' });
      continue;
    }

    if (/^(\*\s*\*\s*\*|-{3,}|_{3,})$/.test(raw.trim())) {
      rendered.push({ text: '────────────────────────────────────────', tone: 'muted' });
      continue;
    }

    const quote = raw.match(/^>\s?(.*)$/);
    if (quote) {
      rendered.push({ text: `│ ${normalizeInlineMarkdown(quote[1])}`, tone: 'muted' });
      continue;
    }

    const bullet = raw.match(/^(\s*)[-*+]\s+(.+)$/);
    if (bullet) {
      rendered.push({ text: `${bullet[1]}• ${normalizeInlineMarkdown(bullet[2])}`, tone: 'normal' });
      continue;
    }

    const ordered = raw.match(/^(\s*)(\d+)\.\s+(.+)$/);
    if (ordered) {
      rendered.push({ text: `${ordered[1]}${ordered[2]}. ${normalizeInlineMarkdown(ordered[3])}`, tone: 'normal' });
      continue;
    }

    rendered.push({ text: normalizeInlineMarkdown(raw), tone: 'normal' });
  }

  return rendered;
}
