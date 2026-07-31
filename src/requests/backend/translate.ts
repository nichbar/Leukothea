import { ISchedulerTranslateOptions } from 'anylang/scheduling';

import { buildBackendRequest } from '../utils/requestBuilder';

export const [translateFactory, translateRequest] = buildBackendRequest<
	{
		text: string;
		from: string;
		to: string;
		options?: ISchedulerTranslateOptions;
		pageTitle?: string;
	},
	string
>('translate', {
	factoryHandler:
		({ backgroundContext, config }) =>
		async ({ text, from, to, options, pageTitle }) => {
			const translateManager = await backgroundContext.getTranslateManager();

			const { supportedLanguages, isSupportAutodetect } =
				translateManager.getTranslatorFeatures();

			if (
				(from === 'auto' && !isSupportAutodetect) ||
				(from !== 'auto' && !supportedLanguages.includes(from))
			)
				throw new Error(
					'Source language is not supported by selected translator',
				);
			if (!supportedLanguages.includes(to))
				throw new Error(
					'Target language is not supported by selected translator',
				);

			const title = (pageTitle ?? '').trim();

			// When page title is provided and the LLM title toggle is on,
			// bypass the scheduler/cache and call LLMTranslator directly so
			// the title is injected as prompt context. Cache is intentionally
			// bypassed to avoid returning a translation cached without title
			// context for a request that has title context (and vice versa).
			if (title.length > 0) {
				try {
					const appConfig = await config.get();
					const enabled = appConfig?.llmTranslator?.includePageTitle;
					const isLLM = appConfig?.translatorModule === 'LLMTranslator';

					if (enabled && isLLM) {
						const translator: any = translateManager.getTranslator();
						if (typeof translator.translate === 'function') {
							// LLMTranslator.translate(text, from, to, pageTitle)
							return await translator.translate(text, from, to, title);
						}
					}
				} catch {
					// On config read failure etc., fall through to scheduler path
				}
			}

			const scheduler = translateManager.getScheduler();

			return scheduler.translate(text, from, to, options);
		},
});

/**
 * Translate request wrapper. `pageTitle` is optional LLM prompt context
 * forwarded only when the "include page title" toggle is enabled.
 * Fourth arg accepts either scheduler options object or a page title string
 * for ergonomics from content-script call sites.
 */
export const translate = (
	text: string,
	from: string,
	to: string,
	optionsOrTitle?: ISchedulerTranslateOptions | string,
	pageTitle?: string,
) => {
	let options: ISchedulerTranslateOptions | undefined;
	let resolvedTitle: string | undefined;

	if (typeof optionsOrTitle === 'string') {
		resolvedTitle = optionsOrTitle;
	} else {
		options = optionsOrTitle;
		resolvedTitle = pageTitle;
	}

	return translateRequest({
		text,
		from,
		to,
		options,
		pageTitle: resolvedTitle,
	});
};
