import { deriveModelsUrl, parseOpenAIModelsResponse } from '../llmModels';

describe('deriveModelsUrl', () => {
	it('replaces /chat/completions with /models', () => {
		expect(deriveModelsUrl('https://api.openai.com/v1/chat/completions')).toBe(
			'https://api.openai.com/v1/models',
		);
	});

	it('handles trailing slash on chat/completions', () => {
		expect(deriveModelsUrl('https://api.openai.com/v1/chat/completions/')).toBe(
			'https://api.openai.com/v1/models',
		);
	});

	it('replaces /completions with /models', () => {
		expect(deriveModelsUrl('https://proxy.example/v1/completions')).toBe(
			'https://proxy.example/v1/models',
		);
	});

	it('keeps path that already ends with /models', () => {
		expect(deriveModelsUrl('https://api.openai.com/v1/models')).toBe(
			'https://api.openai.com/v1/models',
		);
	});

	it('appends /models when path has no known suffix', () => {
		expect(deriveModelsUrl('https://api.openai.com/v1')).toBe(
			'https://api.openai.com/v1/models',
		);
	});

	it('appends /models for root path', () => {
		expect(deriveModelsUrl('https://llm.local/')).toBe('https://llm.local/models');
	});

	it('strips query and hash from derived URL', () => {
		expect(
			deriveModelsUrl('https://api.openai.com/v1/chat/completions?foo=1#bar'),
		).toBe('https://api.openai.com/v1/models');
	});

	it('returns null for empty or whitespace input', () => {
		expect(deriveModelsUrl('')).toBeNull();
		expect(deriveModelsUrl('   ')).toBeNull();
	});

	it('returns null for invalid URL', () => {
		expect(deriveModelsUrl('not-a-url')).toBeNull();
	});

	it('is case-insensitive on the path suffix', () => {
		expect(deriveModelsUrl('https://api.example/v1/Chat/Completions')).toBe(
			'https://api.example/v1/models',
		);
	});
});

describe('parseOpenAIModelsResponse', () => {
	it('parses OpenAI shape and sorts unique ids', () => {
		expect(
			parseOpenAIModelsResponse({
				data: [
					{ id: 'gpt-4o' },
					{ id: 'gpt-4o-mini' },
					{ id: 'gpt-4o' },
					{ id: '  claude  ' },
				],
			}),
		).toEqual(['claude', 'gpt-4o', 'gpt-4o-mini']);
	});

	it('filters non-string and empty ids', () => {
		expect(
			parseOpenAIModelsResponse({
				data: [{ id: 'a' }, { id: '' }, { id: 1 }, { name: 'x' }, null, 'str'],
			}),
		).toEqual(['a']);
	});

	it('returns empty array for unexpected shapes', () => {
		expect(parseOpenAIModelsResponse(null)).toEqual([]);
		expect(parseOpenAIModelsResponse(undefined)).toEqual([]);
		expect(parseOpenAIModelsResponse([])).toEqual([]);
		expect(parseOpenAIModelsResponse({ models: [] })).toEqual([]);
		expect(parseOpenAIModelsResponse({ data: 'nope' })).toEqual([]);
	});
});
