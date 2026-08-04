/**
 * Minimal markdown subset for translation results:
 * - **bold**
 * - *italic*
 * - unordered list lines starting with `*` or `-`
 */

export type InlinePart =
	| { type: 'text'; value: string }
	| { type: 'bold'; value: string }
	| { type: 'italic'; value: string };

export type SimpleMarkdownBlock =
	| { type: 'paragraph'; lines: InlinePart[][] }
	| { type: 'list'; items: InlinePart[][] };

/** Line starts with `*` or `-` plus whitespace, then content. */
const LIST_LINE_RE = /^\s*([-*])\s+(.*)$/;

/** Non-greedy bold spans. Unclosed markers stay plain text. */
const BOLD_RE = /\*\*(.+?)\*\*/g;

/**
 * Non-greedy italic spans using a single `*`.
 * Lookahead/lookbehind avoid treating `**bold**` markers as italic.
 */
const ITALIC_RE = /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g;

const parseByPattern = (
	text: string,
	pattern: RegExp,
	type: 'bold' | 'italic',
): InlinePart[] => {
	const parts: InlinePart[] = [];
	const re = new RegExp(
		pattern.source,
		pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
	);
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = re.exec(text)) !== null) {
		if (match.index > lastIndex) {
			parts.push({ type: 'text', value: text.slice(lastIndex, match.index) });
		}
		parts.push({ type, value: match[1] });
		lastIndex = match.index + match[0].length;
	}

	if (lastIndex < text.length) {
		parts.push({ type: 'text', value: text.slice(lastIndex) });
	}

	if (parts.length === 0) {
		parts.push({ type: 'text', value: text });
	}

	return parts;
};

/**
 * Parse inline markup. Bold is applied first so `**x**` is never
 * misread as italic; italic runs only on remaining plain text.
 */
export const parseInlineMarkdown = (text: string): InlinePart[] => {
	const withBold = parseByPattern(text, BOLD_RE, 'bold');
	const parts: InlinePart[] = [];

	for (const part of withBold) {
		if (part.type === 'text') {
			parts.push(...parseByPattern(part.value, ITALIC_RE, 'italic'));
		} else {
			parts.push(part);
		}
	}

	return parts;
};

export const parseSimpleMarkdown = (text: string): SimpleMarkdownBlock[] => {
	const lines = text.split('\n');
	const blocks: SimpleMarkdownBlock[] = [];

	for (const line of lines) {
		const listMatch = LIST_LINE_RE.exec(line);
		if (listMatch !== null) {
			const item = parseInlineMarkdown(listMatch[2]);
			const last = blocks[blocks.length - 1];
			if (last?.type === 'list') {
				last.items.push(item);
			} else {
				blocks.push({ type: 'list', items: [item] });
			}
			continue;
		}

		const parts = parseInlineMarkdown(line);
		const last = blocks[blocks.length - 1];
		if (last?.type === 'paragraph') {
			last.lines.push(parts);
		} else {
			blocks.push({ type: 'paragraph', lines: [parts] });
		}
	}

	return blocks;
};
