import {
	deriveChatCompletionsUrl,
	deriveModelsUrl,
	parseOpenAIModelsResponse,
} from '../llmModels';

describe('deriveChatCompletionsUrl', () => {
	it('keeps full /chat/completions URL', () => {
		expect(
			deriveChatCompletionsUrl('https://api.openai.com/v1/chat/completions'),
		).toBe('https://api.openai.com/v1/chat/completions');
	});

	it('normalizes trailing slash on chat/completions', () => {
		expect(
			deriveChatCompletionsUrl('https://api.openai.com/v1/chat/completions/'),
		).toBe('https://api.openai.com/v1/chat/completions');
	});

	it('appends /chat/completions when URL ends with /v1', () => {
		expect(deriveChatCompletionsUrl('https://api.openai.com/v1')).toBe(
			'https://api.openai.com/v1/chat/completions',
		);
	});

	it('appends /chat/completions when URL ends with /v1/', () => {
		expect(deriveChatCompletionsUrl('https://api.openai.com/v1/')).toBe(
			'https://api.openai.com/v1/chat/completions',
		);
	});

	it('appends /chat/completions for local endpoints ending with /v1', () => {
		expect(deriveChatCompletionsUrl('http://localhost:11434/v1')).toBe(
			'http://localhost:11434/v1/chat/completions',
		);
	});

	it('replaces /completions with /chat/completions', () => {
		expect(deriveChatCompletionsUrl('https://proxy.example/v1/completions')).toBe(
			'https://proxy.example/v1/chat/completions',
		);
	});

	it('replaces /models with /chat/completions', () => {
		expect(deriveChatCompletionsUrl('https://api.openai.com/v1/models')).toBe(
			'https://api.openai.com/v1/chat/completions',
		);
	});

	it('appends /chat/completions for root path', () => {
		expect(deriveChatCompletionsUrl('https://api.deepseek.com')).toBe(
			'https://api.deepseek.com/chat/completions',
		);
		expect(deriveChatCompletionsUrl('https://api.deepseek.com/')).toBe(
			'https://api.deepseek.com/chat/completions',
		);
	});

	it('preserves query parameters and hash', () => {
		expect(
			deriveChatCompletionsUrl(
				'https://custom.openai.azure.com/openai/deployments/gpt-4o?api-version=2024-02-15-preview#tag',
			),
		).toBe(
			'https://custom.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2024-02-15-preview#tag',
		);
	});

	it('returns original string for empty or invalid input', () => {
		expect(deriveChatCompletionsUrl('')).toBe('');
		expect(deriveChatCompletionsUrl('   ')).toBe('   ');
		expect(deriveChatCompletionsUrl('not-a-url')).toBe('not-a-url');
	});
});

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
