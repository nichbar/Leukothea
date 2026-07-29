import { AppConfigType } from '../../types/runtime';

/**
 * Resolve a human-readable translator label for UI attribution.
 * LLM uses the configured model; other modules use the catalog name or module id.
 */
export const getTranslatorProviderName = (
	config: Pick<AppConfigType, 'translatorModule' | 'llmTranslator'>,
	translators: Record<string, string>,
): string => {
	const moduleId = config.translatorModule;
	if (moduleId === 'LLMTranslator') {
		const model = config.llmTranslator?.model?.trim();
		return model || translators[moduleId] || moduleId;
	}
	return translators[moduleId] ?? moduleId;
};
