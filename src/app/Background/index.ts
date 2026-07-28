// Translators
import { TranslatorConstructor } from 'anylang/translators';
import { isEqual } from 'lodash';

import { createSelector } from '../../lib/effector/createSelector';
import { LLMTranslator } from '../../lib/translators/llm/LLMTranslator';
import {
	createPromiseWithControls,
	PromiseWithControls,
} from '../../lib/utils/createPromiseWithControls';
import { getTranslatorsClasses } from '../../requests/backend/translators';
import { AppConfigType } from '../../types/runtime';

import { ObservableAsyncStorage } from '../ConfigStorage/ConfigStorage';
import { TranslatorManager } from './TranslatorManager';
import { TTSController } from './TTS/TTSController';
import { TTSManager } from './TTS/TTSManager';

export const embeddedTranslators = {
	LLMTranslator,
} as const;

/**
 * Map where key is identifier of translator and value is translator constructor
 */
export type TranslatorsMap = Record<string, TranslatorConstructor>;

/**
 * Background features manager
 */
export class Background {
	private readonly config: ObservableAsyncStorage<AppConfigType>;
	private readonly ttsManager;
	constructor(config: ObservableAsyncStorage<AppConfigType>) {
		this.config = config;
		this.ttsManager = new TTSManager();
	}

	private translateManager: TranslatorManager | null = null;
	private translateManagerPromise: PromiseWithControls<TranslatorManager> | null = null;
	public async getTranslateManager() {
		if (this.translateManager === null) {
			// Create promise to await configuring instance
			if (this.translateManagerPromise === null) {
				const promiseWithControls =
					createPromiseWithControls<TranslatorManager>();

				// Set promise
				this.translateManagerPromise = promiseWithControls;

				// Clear promise
				promiseWithControls.promise.finally(() => {
					if (promiseWithControls === this.translateManagerPromise) {
						this.translateManagerPromise = null;
					}
				});
			}

			return this.translateManagerPromise.promise;
		}

		return this.translateManager;
	}

	public getTTSManager() {
		return this.ttsManager;
	}

	private ttsController: TTSController | null = null;
	public async getTTSController() {
		if (this.ttsController === null) {
			const $config = await this.config.getObservableStore();
			const config = $config.getState();
			this.ttsController = new TTSController(this.ttsManager, config.ttsModule);
		}

		return this.ttsController;
	}

	public async start() {
		const $config = await this.config.getObservableStore();
		const $translateManagerConfig = createSelector(
			$config,
			({ scheduler, translatorModule, cache, llmTranslator }) => ({
				scheduler,
				translatorModule,
				cache,
				llmTranslator,
			}),
			{
				updateFilter: (update, state) => !isEqual(update, state),
			},
		);

		// Build translators list
		const translators: TranslatorsMap = await getTranslatorsClasses();

		// Update config of translate manager
		$translateManagerConfig.watch((config) => {
			if (this.translateManager === null) {
				this.translateManager = new TranslatorManager(config, translators);
				// Soft-persist when a removed/missing module falls back to default
				this.translateManager.setTranslatorModuleFallbackHandler((moduleId) => {
					this.config
						.get()
						.then((latest) => {
							if (latest.translatorModule === moduleId) return;
							return this.config.set({
								...latest,
								translatorModule: moduleId,
							});
						})
						.catch((error) => {
							console.error(
								'Failed to persist translatorModule fallback',
								error,
							);
						});
				});

				// Return a scheduler instance for awaiters
				if (this.translateManagerPromise !== null) {
					this.translateManagerPromise.resolve(this.translateManager);
				}
				return;
			}

			this.translateManager.setConfig(config);
		});

		// Update TTS module
		$config
			.map(({ ttsModule }) => ttsModule)
			.watch((ttsModule) => {
				this.getTTSController().then((ttsController) => {
					ttsController.updateSpeaker(ttsModule);
				});
			});
	}
}
