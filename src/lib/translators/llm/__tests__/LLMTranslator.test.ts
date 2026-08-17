import { DEFAULT_LLM_PROMPT, LLMTranslator } from '../LLMTranslator';

describe('LLMTranslator', () => {
	it('uses default prompt with dictionary instruction for single words', () => {
		const expectedPrompt = [
			'You are a precise translator. Translate the given text from language code "{from}" to language code "{to}".',
			'',
			'When the input is more than one word. Return ONLY the direct translation without quotes, explanations, or introductory text.',
			'',
			'When the input is a single word, that explain this word like a dictory.',
		].join('\n');

		expect(DEFAULT_LLM_PROMPT).toBe(expectedPrompt);
	});

	it('builds system prompt with placeholder replacement', () => {
		const translator = new LLMTranslator();
		const prompt = translator.buildSystemPrompt('en', 'es');

		expect(prompt).toContain(
			'Translate the given text from language code "en" to language code "es".',
		);
		expect(prompt).toContain(
			'When the input is more than one word. Return ONLY the direct translation without quotes, explanations, or introductory text.',
		);
		expect(prompt).toContain(
			'When the input is a single word, that explain this word like a dictory.',
		);
	});

	it('appends page title context when not present in prompt template', () => {
		const translator = new LLMTranslator();
		const prompt = translator.buildSystemPrompt('en', 'de', 'Article Title');

		expect(prompt).toContain('Additional context - page title: "Article Title".');
	});

	it('interpolates page title when template contains {title}', () => {
		const translator = new LLMTranslator({
			prompt: 'Translate {from}->{to} on {title}',
		});
		const prompt = translator.buildSystemPrompt('en', 'fr', 'My Page');

		expect(prompt).toBe('Translate en->fr on My Page');
	});
});
