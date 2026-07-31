import { getLanguageCodesISO639 } from 'anylang/languages';

import { getMessage } from '../../language';

export type LLMTranslatorOptions = {
	apiKey?: string;
	apiUrl?: string;
	model?: string;
	/**
	 * System prompt template. Supports `{from}`, `{to}`, `{title}` placeholders.
	 * Empty/undefined falls back to the built-in default prompt.
	 */
	prompt?: string;
};

/**
 * Maximum page title length (chars) forwarded as prompt context.
 */
const MAX_PAGE_TITLE_LENGTH = 500;

const DEFAULT_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';
export const DEFAULT_LLM_PROMPT =
	'You are a precise translator. Translate the given text from language code "{from}" to language code "{to}". Return ONLY the direct translation without quotes, explanations, or introductory text.';

/**
 * Built-in translator that talks to any OpenAI-compatible chat completions endpoint.
 * Configure `apiKey`, `apiUrl`, `model` and `prompt` in extension settings.
 */
export class LLMTranslator {
	static translatorName = getMessage('common_llmTranslator');
	static isRequiredKey = () => true;
	static isSupportedAutoFrom = () => true;
	// LLMs generally handle most ISO 639-1 languages
	static getSupportedLanguages = () => getLanguageCodesISO639('v1');

	private readonly apiKey: string;
	private readonly apiUrl: string;
	private readonly model: string;
	private readonly prompt: string;

	constructor(options: LLMTranslatorOptions = {}) {
		this.apiKey = options.apiKey ?? '';
		this.apiUrl = options.apiUrl || DEFAULT_API_URL;
		this.model = options.model || DEFAULT_MODEL;
		this.prompt = options.prompt?.trim() || DEFAULT_LLM_PROMPT;
	}

	getLengthLimit = () => 4000;
	getRequestsTimeout = () => 1000;
	checkLimitExceeding = (text: string | string[]) => {
		const plainText = Array.isArray(text) ? text.join('') : text;
		return plainText.length - this.getLengthLimit();
	};

	/**
	 * Build system prompt from template.
	 * Supports `{from}`, `{to}`, `{title}` placeholders. When pageTitle is
	 * given but template has no `{title}`, the title is auto-appended as
	 * extra context — so the default prompt still benefits from it.
	 */
	buildSystemPrompt(from: string, to: string, pageTitle?: string) {
		const title = (pageTitle ?? '').trim().slice(0, MAX_PAGE_TITLE_LENGTH);
		const hasTitlePlaceholder = this.prompt.includes('{title}');
		let prompt = this.prompt
			.replaceAll('{from}', from)
			.replaceAll('{to}', to)
			.replaceAll('{title}', title);

		if (title.length > 0 && !hasTitlePlaceholder) {
			prompt += `\n\nAdditional context - page title: "${title}". Use it to improve translation accuracy, but translate ONLY the user-provided text.`;
		}

		return prompt;
	}

	async translate(text: string, from: string, to: string, pageTitle?: string) {
		if (!this.apiKey) {
			throw new Error(
				'LLM translator API key is not set. Configure it in extension settings.',
			);
		}

		const response = await fetch(this.apiUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify({
				model: this.model,
				messages: [
					{
						role: 'system',
						content: this.buildSystemPrompt(from, to, pageTitle),
					},
					{
						role: 'user',
						content: text,
					},
				],
				temperature: 0.2,
			}),
		});

		if (!response.ok) {
			throw new Error(
				`LLM translator API error: ${response.status} ${response.statusText}`,
			);
		}

		const data = await response.json();
		const content = data?.choices?.[0]?.message?.content;
		if (typeof content !== 'string') {
			throw new Error('LLM translator returned an unexpected response');
		}

		return content.trim();
	}

	async translateBatch(texts: string[], from: string, to: string, pageTitle?: string) {
		return Promise.all(
			texts.map((text) => this.translate(text, from, to, pageTitle)),
		);
	}
}
