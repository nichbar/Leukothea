import { getTranslatorProviderName } from './getTranslatorProviderName';

const catalog = {
	LLMTranslator: 'LLM Translator',
	CustomTranslator: 'My Custom',
};

const llmConfig = (model: string) =>
	({
		translatorModule: 'LLMTranslator',
		llmTranslator: { model },
	}) as Parameters<typeof getTranslatorProviderName>[0];

describe('getTranslatorProviderName', () => {
	it('returns configured model for LLM translator', () => {
		expect(getTranslatorProviderName(llmConfig('gpt-4o-mini'), catalog)).toBe(
			'gpt-4o-mini',
		);
	});

	it('falls back to catalog name when LLM model is empty', () => {
		expect(getTranslatorProviderName(llmConfig(''), catalog)).toBe('LLM Translator');
	});

	it('falls back to catalog name when LLM model is whitespace', () => {
		expect(getTranslatorProviderName(llmConfig('   '), catalog)).toBe(
			'LLM Translator',
		);
	});

	it('falls back to module id when LLM model is empty and catalog missing', () => {
		expect(getTranslatorProviderName(llmConfig(''), {})).toBe('LLMTranslator');
	});

	it('returns catalog name for non-LLM module', () => {
		expect(
			getTranslatorProviderName(
				{
					translatorModule: 'CustomTranslator',
					llmTranslator: { model: 'ignored' },
				} as Parameters<typeof getTranslatorProviderName>[0],
				catalog,
			),
		).toBe('My Custom');
	});

	it('returns module id when catalog entry is missing', () => {
		expect(
			getTranslatorProviderName(
				{
					translatorModule: 'UnknownModule',
					llmTranslator: { model: 'x' },
				} as Parameters<typeof getTranslatorProviderName>[0],
				catalog,
			),
		).toBe('UnknownModule');
	});
});
