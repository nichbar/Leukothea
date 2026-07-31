import { isMobileBrowser } from '../lib/browser';
import { getUserLanguage } from '../lib/language';
import { DEFAULT_LLM_PROMPT } from '../lib/translators/llm/LLMTranslator';
import { AppConfigType } from '../types/runtime';

export const DEFAULT_TRANSLATOR = 'LLMTranslator';
export const DEFAULT_TTS = 'google';

// Init config
export const defaultConfig: AppConfigType = {
	translatorModule: DEFAULT_TRANSLATOR,
	ttsModule: DEFAULT_TTS,
	language: getUserLanguage(),
	// null = detect/auto; ISO 639-1 code = always translate from that language
	fixedSourceLanguage: null,
	llmTranslator: {
		apiKey: '',
		apiUrl: 'https://api.openai.com/v1/chat/completions',
		model: 'gpt-4o-mini',
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
		},
	},
};
