import type { AssistantHistoryMessage } from './types.js';

export type DocumentChunk = {
  index: number;
  text: string;
  score: number;
};

export function normalizeAssistantText(value: string, maxChars: number) {
  const collapsed = String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (collapsed.length <= maxChars) {
    return collapsed;
  }

  return collapsed.slice(0, maxChars).trim();
}

export function normalizeHistory(history: AssistantHistoryMessage[] | undefined, maxMessages: number) {
  const safeHistory = Array.isArray(history) ? history : [];
  const normalized = safeHistory
    .filter((entry) => entry && (entry.role === 'user' || entry.role === 'assistant'))
    .map((entry) => ({
      role: entry.role,
      content: normalizeAssistantText(entry.content, 4000),
    }))
    .filter((entry) => entry.content.length > 0);

  return normalized.slice(Math.max(0, normalized.length - maxMessages));
}

function splitLongParagraph(paragraph: string, chunkSize: number, overlap: number) {
  const chunks: string[] = [];
  const step = Math.max(1, chunkSize - overlap);
  for (let start = 0; start < paragraph.length; start += step) {
    chunks.push(paragraph.slice(start, start + chunkSize).trim());
  }
  return chunks.filter(Boolean);
}

export function chunkDocumentText(documentText: string, chunkSize: number, overlap: number) {
  const text = normalizeAssistantText(documentText, Number.POSITIVE_INFINITY);
  if (!text) return [];

  if (text.length <= chunkSize) {
    return [{ index: 0, text, score: 0 }];
  }

  const paragraphs = text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  const chunks: DocumentChunk[] = [];

  let buffer = '';
  let index = 0;

  const flushBuffer = () => {
    if (!buffer.trim()) return;
    chunks.push({ index, text: buffer.trim(), score: 0 });
    index += 1;
    buffer = '';
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > chunkSize) {
      flushBuffer();
      for (const segment of splitLongParagraph(paragraph, chunkSize, overlap)) {
        chunks.push({ index, text: segment, score: 0 });
        index += 1;
      }
      continue;
    }

    const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    if (candidate.length > chunkSize) {
      flushBuffer();
      buffer = paragraph;
    } else {
      buffer = candidate;
    }
  }

  flushBuffer();
  return chunks;
}

function tokenize(value: string) {
  return String(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

function scoreChunk(text: string, questionTokens: string[]) {
  if (questionTokens.length === 0) return 0;
  const lowered = text.toLowerCase();
  let score = 0;
  for (const token of new Set(questionTokens)) {
    if (lowered.includes(token)) score += 2;
  }
  const firstLine = text.split('\n', 1)[0] ?? '';
  if (/^\s*[-*•]?\s*[A-Z][^\n]{0,80}$/.test(firstLine)) score += 1;
  return score;
}

export function selectRelevantChunks(chunks: DocumentChunk[], question: string, maxChunks: number, maxChars: number) {
  const questionTokens = tokenize(question);
  const scored = chunks.map((chunk) => ({
    ...chunk,
    score: scoreChunk(chunk.text, questionTokens),
  }));

  const prioritized = [...scored]
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, maxChunks)
    .sort((left, right) => left.index - right.index);

  const selected: DocumentChunk[] = [];
  let totalChars = 0;
  for (const chunk of prioritized) {
    const nextChars = totalChars + chunk.text.length;
    if (selected.length > 0 && nextChars > maxChars) break;
    selected.push(chunk);
    totalChars = nextChars;
  }

  if (selected.length === 0 && scored.length > 0) {
    return [scored[0]];
  }

  return selected;
}

export function buildDocumentContext(chunks: DocumentChunk[]) {
  return chunks
    .map((chunk, index) => `Excerpt ${index + 1} (chunk ${chunk.index + 1}):\n${chunk.text}`)
    .join('\n\n---\n\n');
}
