import browser from 'webextension-polyfill';

import { DEFAULT_TRANSLATOR, DEFAULT_TTS, defaultConfig } from '../../config';
import { createMigrationTask, Migration } from '../../lib/migrations/createMigrationTask';
import { DEFAULT_LLM_PROMPT } from '../../lib/translators/llm/LLMTranslator';
import { decodeStruct } from '../../lib/types';
import { AppConfig } from '../../types/runtime';

import noTranslateSelectors from './no-translate-selectors.txt';

const migrations: Migration[] = [
	{
		version: 1,
		async migrate() {
			const storageKey = 'config.Main';
			const storageDataRaw = localStorage.getItem(storageKey);

			// Skip
			if (storageDataRaw === null) return;

			const storageNameV2 = 'appConfig';

			// Import valid data
			const storageData = JSON.parse(storageDataRaw);
			if (typeof storageData === 'object') {
				// Merge actual data with legacy
				let { [storageNameV2]: actualData } =
					await browser.storage.local.get(storageNameV2);
				if (typeof actualData !== 'object') {
					actualData = {};
				}

				const mergedData = { ...actualData, ...storageData };

				// Write data
				await browser.storage.local.set({
					[storageNameV2]: mergedData,
				});
			}

			// Delete old data
			localStorage.removeItem(storageKey);
		},
	},
	{
		version: 3,
		async migrate() {
			const storageNameV2 = 'appConfig';

			// Merge actual data with old
			let { [storageNameV2]: actualData } =
				await browser.storage.local.get(storageNameV2);
			if (typeof actualData !== 'object') {
				actualData = {};
			}

			const contentscriptPropData =
				actualData?.contentscript?.selectTranslator || {};
			const quickTranslate = actualData?.selectTranslator?.quickTranslate;

			const newData = actualData;
			delete newData.contentscript;

			if (newData.selectTranslator) {
				delete newData.selectTranslator.quickTranslate;
			}

			// Write data
			await browser.storage.local.set({
				[storageNameV2]: {
					...newData,
					selectTranslator: {
						...newData?.selectTranslator,
						...contentscriptPropData,
						mode: quickTranslate
							? 'quickTranslate'
							: newData?.selectTranslator?.mode,
					},
				},
			});
		},
	},
	{
		version: 5,
		async migrate() {
			const storageName = 'appConfig';

			let { [storageName]: actualData } =
				await browser.storage.local.get(storageName);
			if (typeof actualData !== 'object') {
				actualData = {};
			}

			const updatedConfig = {
				ttsModule: DEFAULT_TTS,
				...actualData,
				pageTranslator: {
					enableContextMenu: false,
					toggleTranslationHotkey: null,
					...actualData?.pageTranslator,
				},
			};

			if (actualData.translatorModule === 'BingTranslatorPublic') {
				updatedConfig.translatorModule = DEFAULT_TRANSLATOR;
			}

			// Write data
			await browser.storage.local.set({ [storageName]: updatedConfig });
		},
	},
	{
		// Add history section
		version: 6,
		async migrate() {
			const storageName = 'appConfig';

			let { [storageName]: actualData } =
				await browser.storage.local.get(storageName);
			if (typeof actualData !== 'object') {
				actualData = {};
			}

			const updatedConfig = {
				...actualData,
				history: {
					enabled: true,
				},
			};

			// Write data
			await browser.storage.local.set({ [storageName]: updatedConfig });
		},
	},
	{
		version: 7,
		async migrate() {
			// Empty migration, to bump migration number and to trigger hook for repair config
		},
	},
	{
		version: 8,
		async migrate() {
			const storageName = 'appConfig';

			let { [storageName]: actualData } =
				await browser.storage.local.get(storageName);
			if (typeof actualData !== 'object') {
				actualData = {};
			}

			const updatedConfig = {
				...actualData,
			};

			delete updatedConfig['appIcon'];

			// Write data
			await browser.storage.local.set({ [storageName]: updatedConfig });
		},
	},
	{
		version: 9,
		async migrate() {
			const storageName = 'appConfig';

			let { [storageName]: actualData } =
				await browser.storage.local.get(storageName);
			if (typeof actualData !== 'object') {
				actualData = {};
			}

			// Delete deprecated option
			const pageTranslatorConfig = actualData?.pageTranslator ?? {};
			delete pageTranslatorConfig['ignoredTags'];

			const updatedConfig = {
				...actualData,
				pageTranslator: {
					...pageTranslatorConfig,
					// Set new default
					excludeSelectors: noTranslateSelectors.split('\n'),
				},
			};

			// Write data
			await browser.storage.local.set({ [storageName]: updatedConfig });
		},
	},
	{
		// Add LLM translator settings
		version: 10,
		async migrate() {
			const storageName = 'appConfig';

			let { [storageName]: actualData } =
				await browser.storage.local.get(storageName);
			if (typeof actualData !== 'object') {
				actualData = {};
			}

			const updatedConfig = {
				...actualData,
				llmTranslator: {
					apiKey: '',
					apiUrl: 'https://api.openai.com/v1/chat/completions',
					model: 'gpt-4o-mini',
					...actualData?.llmTranslator,
				},
			};

			// Write data
			await browser.storage.local.set({ [storageName]: updatedConfig });
		},
	},
	{
		// Add selectTranslator.opacity
		version: 11,
		async migrate() {
			const storageName = 'appConfig';

			let { [storageName]: actualData } =
				await browser.storage.local.get(storageName);
			if (typeof actualData !== 'object') {
				actualData = {};
			}

			const updatedConfig = {
				...actualData,
				selectTranslator: {
					...actualData?.selectTranslator,
					opacity: actualData?.selectTranslator?.opacity ?? 1,
				},
			};

			// Write data
			await browser.storage.local.set({ [storageName]: updatedConfig });
		},
	},
	{
		// Add fixedSourceLanguage
		version: 12,
		async migrate() {
			const storageName = 'appConfig';

			let { [storageName]: actualData } =
				await browser.storage.local.get(storageName);
			if (typeof actualData !== 'object') {
				actualData = {};
			}

			const updatedConfig = {
				...actualData,
				fixedSourceLanguage:
					actualData?.fixedSourceLanguage === undefined
						? null
						: actualData.fixedSourceLanguage,
			};

			// Write data
			await browser.storage.local.set({ [storageName]: updatedConfig });
		},
	},
	{
		// Remove page translation feature
		version: 13,
		async migrate() {
			const storageName = 'appConfig';

			let { [storageName]: actualData } =
				await browser.storage.local.get(storageName);
			if (typeof actualData !== 'object' || actualData === null) {
				actualData = {};
			}

			const updatedConfig = { ...actualData };
			delete updatedConfig.pageTranslator;
			delete updatedConfig.popupTab;

			if (
				updatedConfig.selectTranslator &&
				typeof updatedConfig.selectTranslator === 'object'
			) {
				const selectTranslator = { ...updatedConfig.selectTranslator };
				delete selectTranslator.disableWhileTranslatePage;
				updatedConfig.selectTranslator = selectTranslator;
			}

			await browser.storage.local.set({ [storageName]: updatedConfig });
		},
	},
	{
		// Add llmTranslator.prompt
		version: 14,
		async migrate() {
			const storageName = 'appConfig';

			let { [storageName]: actualData } =
				await browser.storage.local.get(storageName);
			if (typeof actualData !== 'object' || actualData === null) {
				actualData = {};
			}

			const llmTranslator = {
				apiKey: '',
				apiUrl: 'https://api.openai.com/v1/chat/completions',
				model: 'gpt-4o-mini',
				prompt: DEFAULT_LLM_PROMPT,
				...(actualData?.llmTranslator ?? {}),
			};

			if (
				typeof llmTranslator.prompt !== 'string' ||
				llmTranslator.prompt.trim() === ''
			) {
				llmTranslator.prompt = DEFAULT_LLM_PROMPT;
			}

			const updatedConfig = {
				...actualData,
				llmTranslator,
			};

			await browser.storage.local.set({ [storageName]: updatedConfig });
		},
	},
	{
		// Remove selectTranslator.showOriginalText
		version: 15,
		async migrate() {
			const storageName = 'appConfig';

			let { [storageName]: actualData } =
				await browser.storage.local.get(storageName);
			if (typeof actualData !== 'object' || actualData === null) {
				actualData = {};
			}

			const updatedConfig = { ...actualData };

			if (
				updatedConfig.selectTranslator &&
				typeof updatedConfig.selectTranslator === 'object'
			) {
				const selectTranslator = { ...updatedConfig.selectTranslator };
				delete selectTranslator.showOriginalText;
				updatedConfig.selectTranslator = selectTranslator;
			}

			await browser.storage.local.set({ [storageName]: updatedConfig });
		},
	},
	{
		// Add selectTranslator.skipWhenSameAsUserLanguage
		version: 16,
		async migrate() {
			const storageName = 'appConfig';

			let { [storageName]: actualData } =
				await browser.storage.local.get(storageName);
			if (typeof actualData !== 'object' || actualData === null) {
				actualData = {};
			}

			const updatedConfig = {
				...actualData,
				selectTranslator: {
					...actualData?.selectTranslator,
					skipWhenSameAsUserLanguage:
						actualData?.selectTranslator?.skipWhenSameAsUserLanguage ?? false,
				},
			};

			await browser.storage.local.set({ [storageName]: updatedConfig });
		},
	},
	{
		// Add sync.webdav defaults
		version: 17,
		async migrate() {
			const storageName = 'appConfig';

			let { [storageName]: actualData } =
				await browser.storage.local.get(storageName);
			if (typeof actualData !== 'object' || actualData === null) {
				actualData = {};
			}

			const existingWebdav =
				actualData?.sync &&
				typeof actualData.sync === 'object' &&
				actualData.sync !== null
					? (actualData.sync as { webdav?: Record<string, unknown> }).webdav
					: undefined;

			const updatedConfig = {
				...actualData,
				sync: {
					...(typeof actualData?.sync === 'object' && actualData.sync !== null
						? actualData.sync
						: {}),
					webdav: {
						enabled: false,
						url: '',
						username: '',
						password: '',
						// Keep only user-facing credentials; path/interval are fixed in code.
						...(existingWebdav
							? {
									enabled:
										typeof existingWebdav.enabled === 'boolean'
											? existingWebdav.enabled
											: false,
									url:
										typeof existingWebdav.url === 'string'
											? existingWebdav.url
											: '',
									username:
										typeof existingWebdav.username === 'string'
											? existingWebdav.username
											: '',
									password:
										typeof existingWebdav.password === 'string'
											? existingWebdav.password
											: '',
								}
							: {}),
					},
				},
			};

			await browser.storage.local.set({ [storageName]: updatedConfig });
		},
	},
];

export const ConfigStorageMigration = createMigrationTask(migrations, {
	onComplete: async () => {
		// Repair config if necessary
		const storageName = 'appConfig';
		const { [storageName]: config } = await browser.storage.local.get(storageName);

		const { errors } = decodeStruct(AppConfig, config);
		if (errors === null) return;

		console.warn('Config object is invalid, fallback to default config', errors);
		await browser.storage.local.set({ [storageName]: defaultConfig });
	},
});
