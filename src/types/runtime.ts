import { isLanguageCodeISO639v1 } from 'anylang/languages';
import { TypeOf } from 'io-ts';

import { StringLiteralType, type } from '../lib/types';

export const ArrayOfStrings = new type.Type<string[], string[], unknown>(
	'ArrayOfStrings',
	(input: unknown): input is string[] =>
		Array.isArray(input) && input.every((i) => typeof i === 'string'),
	(input, context) =>
		Array.isArray(input) && input.every((i) => typeof i === 'string')
			? type.success(input)
			: type.failure(input, context),
	type.identity,
);

export const LangCode = new type.Type<string, string, unknown>(
	'LangCode',
	(input: unknown): input is string =>
		typeof input === 'string' && isLanguageCodeISO639v1(input),
	(input, context) =>
		typeof input === 'string' && isLanguageCodeISO639v1(input)
			? type.success(input)
			: type.failure(input, context),
	type.identity,
);

export const LangCodeWithAuto = new type.Type<string, string, unknown>(
	'LangCodeWithAuto',
	(input: unknown): input is string =>
		input === 'auto' || (typeof input === 'string' && isLanguageCodeISO639v1(input)),
	(input, context) =>
		input === 'auto' || (typeof input === 'string' && isLanguageCodeISO639v1(input))
			? type.success(input)
			: type.failure(input, context),
	type.identity,
);

export const AppConfig = type.type({
	language: type.string,
	/**
	 * When set, skip language detection and always translate from this language.
	 * `null` keeps the normal detect / auto behavior.
	 */
	fixedSourceLanguage: type.union([type.null, LangCode]),
	translatorModule: type.string,
	ttsModule: type.string,
	/**
	 * Options for the built-in OpenAI-compatible LLM translator
	 */
	llmTranslator: type.type({
		apiKey: type.string,
		apiUrl: type.string,
		model: type.string,
		/**
		 * System prompt template. Use `{from}` and `{to}` for language codes, `{title}` for page title.
		 */
		prompt: type.string,
		/**
		 * When true, send document.title as extra prompt context to LLM.
		 */
		includePageTitle: type.boolean,
	}),
	scheduler: type.type({
		useCache: type.boolean,
		translateRetryAttemptLimit: type.number,
		isAllowDirectTranslateBadChunks: type.boolean,
		directTranslateLength: type.union([type.number, type.null]),
		translatePoolDelay: type.number,
		chunkSizeForInstantTranslate: type.union([type.number, type.null]),
	}),
	cache: type.type({
		ignoreCase: type.boolean,
	}),
	selectTranslator: type.type({
		enabled: type.boolean,
		zIndex: type.union([type.number, type.undefined]),
		focusOnTranslateButton: type.union([type.boolean, type.undefined]),
		rememberDirection: type.boolean,
		modifiers: type.array(
			type.union([
				StringLiteralType('ctrlKey'),
				StringLiteralType('altKey'),
				StringLiteralType('shiftKey'),
				StringLiteralType('metaKey'),
			]),
		),
		strictSelection: type.boolean,
		detectedLangFirst: type.boolean,
		showOnceForSelection: type.boolean,
		isUseAutoForDetectLang: type.boolean,
		/**
		 * Hide selection popup when detected language matches "Your language"
		 */
		skipWhenSameAsUserLanguage: type.boolean,
		timeoutForHideButton: type.number,
		/**
		 * Opacity of the selection TextTranslator popup card (0–1)
		 */
		opacity: type.number,
		mode: type.union([
			StringLiteralType('popupButton'),
			StringLiteralType('quickTranslate'),
			StringLiteralType('contextMenu'),
		]),
	}),
	textTranslator: type.type({
		rememberText: type.boolean,
		spellCheck: type.boolean,
		suggestLanguage: type.boolean,
		suggestLanguageAlways: type.boolean,
	}),
	popup: type.type({
		rememberLastTab: type.boolean,
	}),
	history: type.type({
		enabled: type.boolean,
	}),
	/**
	 * Multi-device config sync settings (WebDAV).
	 * Dictionary and history stay local; only AppConfig is synced.
	 */
	sync: type.type({
		webdav: type.type({
			enabled: type.boolean,
			/** Base collection URL, e.g. https://nextcloud.example/remote.php/dav/files/user/ */
			url: type.string,
			username: type.string,
			/** Stored plaintext in storage.local (same as llm apiKey). */
			password: type.string,
			/**
			 * When false (default), LLM API key is not synced (push preserves
			 * remote key; pull keeps local key). WebDAV username/password are
			 * always local-only regardless of this flag.
			 */
			syncSecrets: type.boolean,
		}),
	}),
});

export type AppConfigType = TypeOf<typeof AppConfig>;
