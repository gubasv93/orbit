import MarkdownIt from 'markdown-it';

export const descriptionMaxLength = 10_000;
export type DescriptionFormatAction = 'bold' | 'italic' | 'heading' | 'bullet' | 'numbered' | 'quote' | 'code';
export interface DescriptionPatch {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  replaceStart: number;
  replaceEnd: number;
  text: string;
}

/** Only explicit web and email destinations become clickable descriptions. */
export function normalizeDescriptionUrl(input: string): string | null {
  if (typeof input !== 'string' || /[\u0000-\u001f\u007f-\u009f]/.test(input)) return null;
  let value = input.trim();
  if (/^www\./i.test(value)) value = 'https://' + value;
  if (!/^(?:https?:\/\/|mailto:)/i.test(value) || /[\s<>"`]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.hostname ? url.href : null;
    if (url.protocol !== 'mailto:') return null;
    if (/[\u0000-\u001f\u007f-\u009f]/.test(decodeURIComponent(url.href))) return null;
    const recipients = decodeURIComponent(url.pathname).split(',');
    if (!recipients.length || recipients.some(recipient => !/^[^\s<>@,;]+@[^\s<>@,;]+$/.test(recipient))) return null;
    return url.href;
  } catch {
    return null;
  }
}

const markdown = new MarkdownIt({html: false, linkify: true, breaks: true, maxNesting: 20});
// Descriptions never fetch images or embed arbitrary HTML. The editor exposes
// simple text structure; tables remain plain text rather than widening drawers.
markdown.disable(['image', 'table']);
markdown.linkify.set({fuzzyLink: true});
markdown.validateLink = value => normalizeDescriptionUrl(value) !== null;
markdown.renderer.rules.link_open = (tokens, index, options, _environment, renderer) => {
  const token = tokens[index], destination = normalizeDescriptionUrl(String(token.attrGet('href') || ''));
  if (destination) token.attrSet('href', destination);
  else token.attrs = token.attrs?.filter(([name]) => name !== 'href') || null;
  token.attrSet('target', '_blank');
  token.attrSet('rel', 'noopener noreferrer');
  return renderer.renderToken(tokens, index, options);
};

/** Render the existing string without interpreting stored HTML as markup. */
export function renderDescription(source: string): string {
  return markdown.render(source || '');
}

function range(value: string, start: number, end: number) {
  const point = (number: number) => Math.max(0, Math.min(value.length, Number.isFinite(number) ? Math.floor(number) : value.length));
  const left = point(start), right = point(end);
  return {start: Math.min(left, right), end: Math.max(left, right)};
}
function patch(value: string, start: number, end: number, text: string, selectionStart: number, selectionEnd: number): DescriptionPatch {
  const next = value.slice(0, start) + text + value.slice(end);
  if (next.length > descriptionMaxLength) throw new Error('Description can contain at most 10,000 characters.');
  const selection = range(next, selectionStart, selectionEnd);
  return {value: next, selectionStart: selection.start, selectionEnd: selection.end, replaceStart: start, replaceEnd: end, text};
}
const leadingStars = (value: string) => value.match(/^\*+/)?.[0].length || 0;
const trailingStars = (value: string) => value.match(/\*+$/)?.[0].length || 0;
function inline(value: string, start: number, end: number, marker: '*' | '**') {
  const selected = value.slice(start, end), count = marker.length;
  const canRemove = (left: number, right: number) => marker === '**' ? left >= 2 && right >= 2 : left % 2 === 1 && right % 2 === 1;
  if (selected.length > count * 2 && canRemove(leadingStars(selected), trailingStars(selected))) {
    const text = selected.slice(count, -count);
    return patch(value, start, end, text, start, start + text.length);
  }
  if (selected && canRemove(trailingStars(value.slice(0, start)), leadingStars(value.slice(end)))) {
    return patch(value, start - count, end + count, selected, start - count, end - count);
  }
  if (selected) {
    const left = selected.match(/^\s*/)?.[0].length || 0, right = selected.match(/\s*$/)?.[0].length || 0;
    if (left + right < selected.length) {start += left; end -= right;}
  }
  const content = value.slice(start, end) || 'text', text = marker + content + marker;
  return patch(value, start, end, text, start + count, start + count + content.length);
}
function lineRange(value: string, start: number, end: number) {
  const first = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const last = value.indexOf('\n', end > start ? end - 1 : end);
  return {start: start === 0 ? 0 : first, end: last < 0 ? value.length : last};
}
function inlineCode(value: string, start: number, end: number) {
  const selected = value.slice(start, end);
  if (selected.includes('\n')) {
    const lines = lineRange(value, start, end), content = value.slice(lines.start, lines.end);
    const fence = '`'.repeat(Math.max(3, ...[...content.matchAll(/`+/g)].map(match => match[0].length + 1)));
    const text = fence + '\n' + content + '\n' + fence;
    return patch(value, lines.start, lines.end, text, lines.start + fence.length + 1, lines.start + fence.length + 1 + content.length);
  }
  const leftRun = value.slice(0, start).match(/`+$/)?.[0] || '', rightRun = value.slice(end).match(/^`+/)?.[0] || '';
  if (selected && leftRun && leftRun === rightRun && !selected.includes(leftRun)) {
    return patch(value, start - leftRun.length, end + rightRun.length, selected, start - leftRun.length, end - leftRun.length);
  }
  const content = selected || 'text', fence = '`'.repeat(Math.max(1, ...[...content.matchAll(/`+/g)].map(match => match[0].length + 1)));
  const padding = content.startsWith('`') || content.endsWith('`') || content.startsWith(' ') && content.endsWith(' ') && Boolean(content.trim()) ? ' ' : '';
  const text = fence + padding + content + padding + fence, offset = start + fence.length + padding.length;
  return patch(value, start, end, text, offset, offset + content.length);
}

type StructuredAction = Exclude<DescriptionFormatAction, 'bold' | 'italic' | 'code'>;
function block(value: string, start: number, end: number, action: StructuredAction) {
  const bounds = lineRange(value, start, end), body = value.slice(bounds.start, bounds.end);
  const lines = body.split('\n');
  const patterns = {heading: /^#{2}\s+/, bullet: /^[-+*]\s+/, numbered: /^\d+[.)]\s+/, quote: /^>\s?/};
  const nonempty = lines.filter(line => line.trim()), remove = nonempty.length > 0 && nonempty.every(line => patterns[action].test(line.trimStart()));
  let counter = 0;
  const transformed = lines.map(line => {
    const indent = line.match(/^[ \t]*/)?.[0] || '', content = line.slice(indent.length);
    if (!content) return {line, next: line, map: (offset: number) => offset};
    const existing = action === 'heading' ? content.match(/^#{1,6}\s+/)?.[0] : action === 'quote' ? content.match(/^>\s?/)?.[0] : content.match(/^(?:[-+*]|\d+[.)])\s+/)?.[0];
    const stripped = existing?.length || 0;
    const prefix = remove ? '' : action === 'heading' ? '## ' : action === 'bullet' ? '- ' : action === 'numbered' ? `${++counter}. ` : '> ';
    const next = indent + prefix + content.slice(stripped);
    return {line, next, map: (offset: number) => Math.min(next.length, offset < indent.length ? offset : indent.length + prefix.length + Math.max(0, offset - indent.length - stripped))};
  });
  if (!nonempty.length) {
    const content = action === 'heading' ? 'Heading' : action === 'quote' ? 'Quote' : 'List item';
    const prefix = action === 'heading' ? '## ' : action === 'bullet' ? '- ' : action === 'numbered' ? '1. ' : '> ';
    const text = prefix + content;
    return patch(value, bounds.start, bounds.end, text, bounds.start + prefix.length, bounds.start + text.length);
  }
  let text = transformed.map(line => line.next).join('\n');
  const following = value[bounds.end] === '\n' ? value.slice(bounds.end + 1).split('\n', 1)[0] : '';
  // A plain next line is otherwise a Markdown lazy continuation of a list or
  // quote. Keep untouched text in its own paragraph after this selected block.
  if (!remove && action !== 'heading' && following.trim() && !/^\s*(?:#{1,6}(?:\s|$)|>|[-+*]\s|\d+[.)]\s|`{3,}|~{3,}|[-*_]{3,}\s*$)/.test(following)) text += '\n';
  const map = (position: number) => {
    let oldOffset = bounds.start, nextOffset = bounds.start;
    for (let index = 0; index < transformed.length; index++) {
      const line = transformed[index];
      if (position <= oldOffset + line.line.length || index === transformed.length - 1) return nextOffset + line.map(Math.max(0, position - oldOffset)) + Math.max(0, position - bounds.end);
      oldOffset += line.line.length + 1; nextOffset += line.next.length + 1;
    }
    return bounds.start;
  };
  return patch(value, bounds.start, bounds.end, text, map(start), map(end));
}

/** Apply one toolbar action atomically to the selected text or touched lines. */
export function formatDescription(value: string, selectionStart: number, selectionEnd: number, action: DescriptionFormatAction): DescriptionPatch {
  const {start, end} = range(value, selectionStart, selectionEnd);
  if (action === 'bold') return inline(value, start, end, '**');
  if (action === 'italic') return inline(value, start, end, '*');
  if (action === 'code') return inlineCode(value, start, end);
  return block(value, start, end, action);
}
function escapeLabel(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/[\[\]`*_<>]/g, '\\$&').replace(/[\r\n]+/g, ' ');
}
/** URL validation happens before any replacement, including replacement of an old selection. */
export function applyDescriptionLink(value: string, selectionStart: number, selectionEnd: number, label: string, url: string): DescriptionPatch {
  const destination = normalizeDescriptionUrl(url);
  if (!destination) throw new Error('Enter a valid http, https or email link.');
  const {start, end} = range(value, selectionStart, selectionEnd), title = label.trim() || value.slice(start, end) || destination;
  const text = `[${escapeLabel(title)}](<${destination}>)`;
  return patch(value, start, end, text, start, start + text.length);
}
