import { describe, expect, test } from 'vitest';

import { parseInlineMarkdown, parseSimpleMarkdown } from './parseSimpleMarkdown';

describe('parseInlineMarkdown', () => {
	test('returns plain text when there is no markup', () => {
		expect(parseInlineMarkdown('hello world')).toEqual([
			{ type: 'text', value: 'hello world' },
		]);
	});

	test('parses a single bold span', () => {
		expect(parseInlineMarkdown('say **hi** there')).toEqual([
			{ type: 'text', value: 'say ' },
			{ type: 'bold', value: 'hi' },
			{ type: 'text', value: ' there' },
		]);
	});

	test('parses multiple bold spans', () => {
		expect(parseInlineMarkdown('**a** and **b**')).toEqual([
			{ type: 'bold', value: 'a' },
			{ type: 'text', value: ' and ' },
			{ type: 'bold', value: 'b' },
		]);
	});

	test('leaves unclosed bold markers as plain text', () => {
		expect(parseInlineMarkdown('**oops')).toEqual([
			{ type: 'text', value: '**oops' },
		]);
	});

	test('parses a single italic span', () => {
		expect(parseInlineMarkdown('say *hi* there')).toEqual([
			{ type: 'text', value: 'say ' },
			{ type: 'italic', value: 'hi' },
			{ type: 'text', value: ' there' },
		]);
	});

	test('parses multiple italic spans', () => {
		expect(parseInlineMarkdown('*a* and *b*')).toEqual([
			{ type: 'italic', value: 'a' },
			{ type: 'text', value: ' and ' },
			{ type: 'italic', value: 'b' },
		]);
	});

	test('leaves unclosed italic markers as plain text', () => {
		expect(parseInlineMarkdown('*oops')).toEqual([{ type: 'text', value: '*oops' }]);
	});

	test('prefers bold over italic for double asterisks', () => {
		expect(parseInlineMarkdown('**bold** and *italic*')).toEqual([
			{ type: 'bold', value: 'bold' },
			{ type: 'text', value: ' and ' },
			{ type: 'italic', value: 'italic' },
		]);
	});
});

describe('parseSimpleMarkdown', () => {
	test('keeps plain multi-line text as a paragraph', () => {
		expect(parseSimpleMarkdown('line one\nline two')).toEqual([
			{
				type: 'paragraph',
				lines: [
					[{ type: 'text', value: 'line one' }],
					[{ type: 'text', value: 'line two' }],
				],
			},
		]);
	});

	test('parses * list lines', () => {
		expect(parseSimpleMarkdown('* one\n* two')).toEqual([
			{
				type: 'list',
				items: [
					[{ type: 'text', value: 'one' }],
					[{ type: 'text', value: 'two' }],
				],
			},
		]);
	});

	test('parses - list lines', () => {
		expect(parseSimpleMarkdown('- one\n- two')).toEqual([
			{
				type: 'list',
				items: [
					[{ type: 'text', value: 'one' }],
					[{ type: 'text', value: 'two' }],
				],
			},
		]);
	});

	test('supports bold inside list items', () => {
		expect(parseSimpleMarkdown('* **bold** item')).toEqual([
			{
				type: 'list',
				items: [
					[
						{ type: 'bold', value: 'bold' },
						{ type: 'text', value: ' item' },
					],
				],
			},
		]);
	});

	test('supports italic inside list items', () => {
		expect(parseSimpleMarkdown('- *soft* item')).toEqual([
			{
				type: 'list',
				items: [
					[
						{ type: 'italic', value: 'soft' },
						{ type: 'text', value: ' item' },
					],
				],
			},
		]);
	});

	test('splits list and paragraph blocks', () => {
		expect(parseSimpleMarkdown('intro\n* a\n* b\noutro')).toEqual([
			{
				type: 'paragraph',
				lines: [[{ type: 'text', value: 'intro' }]],
			},
			{
				type: 'list',
				items: [[{ type: 'text', value: 'a' }], [{ type: 'text', value: 'b' }]],
			},
			{
				type: 'paragraph',
				lines: [[{ type: 'text', value: 'outro' }]],
			},
		]);
	});

	test('does not treat a lone asterisk as a list item', () => {
		expect(parseSimpleMarkdown('*nospace')).toEqual([
			{
				type: 'paragraph',
				lines: [[{ type: 'text', value: '*nospace' }]],
			},
		]);
	});
});
