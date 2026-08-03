import { isMobileBrowser } from '../lib/browser';
import { getUserLanguage } from '../lib/language';
import {
	DEFAULT_LLM_API_KEY,
	DEFAULT_LLM_API_URL,
	DEFAULT_LLM_MODEL,
	DEFAULT_LLM_PROMPT,
} from '../lib/translators/llm/LLMTranslator';
import { AppConfigType } from '../types/runtime';

export const DEFAULT_TRANSLATOR = 'LLMTranslator';
export const DEFAULT_TTS = 'google';

/**
 * Build a fresh default config. Prefer this over the module snapshot when
 * seeding storage or resetting settings so "Your language" tracks the
 * current browser language.
 */
export const getDefaultConfig = (): AppConfigType => ({
	translatorModule: DEFAULT_TRANSLATOR,
	ttsModule: DEFAULT_TTS,
	// Default "Your language" from the browser preferred language list.
	language: getUserLanguage(),
	// null = detect/auto; ISO 639-1 code = always translate from that language
	fixedSourceLanguage: null,
	llmTranslator: {
		apiKey: DEFAULT_LLM_API_KEY,
		apiUrl: DEFAULT_LLM_API_URL,
		model: DEFAULT_LLM_MODEL,
		prompt: DEFAULT_LLM_PROMPT,
		includePageTitle: false,
	},
	scheduler: {
		useCache: true,
		translateRetryAttemptLimit: 2,
		isAllowDirectTranslateBadChunks: true,
		directTranslateLength: null,
		translatePoolDelay: 300,
		chunkSizeForInstantTranslate: null,
	},
	cache: {
		ignoreCase: true,
	},
	textTranslator: {
		rememberText: true,
		spellCheck: true,
		suggestLanguage: true,
		suggestLanguageAlways: true,
	},
	selectTranslator: {
		enabled: true,
		mode: 'popupButton',
		zIndex: 999999,
		rememberDirection: false,
		modifiers: [],
		strictSelection: false,
		detectedLangFirst: true,
		timeoutForHideButton: 3000,
		focusOnTranslateButton: false,
		showOnceForSelection: isMobileBrowser() ? false : true,
		isUseAutoForDetectLang: true,
		// Off by default so existing behavior is preserved for upgrades
		skipWhenSameAsUserLanguage: false,
		opacity: 0.95,
	},
	popup: {
		rememberLastTab: true,
	},
	history: {
		enabled: true,
	},
	sync: {
		webdav: {
			enabled: false,
			url: '',
			username: '',
			password: '',
			syncSecrets: false,
		},
	},
});

// Module-load snapshot for call sites that need a static object (tests, codecs).
// Live seeding / reset should use getDefaultConfig() instead.
export const defaultConfig: AppConfigType = getDefaultConfig();
