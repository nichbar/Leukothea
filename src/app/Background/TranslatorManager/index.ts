import { isLanguageCodeISO639v1 } from 'anylang/languages';
import { IScheduler, Scheduler } from 'anylang/scheduling';

import { DEFAULT_TRANSLATOR } from '../../../config';
import { AppConfigType } from '../../../types/runtime';
import { RecordValues } from '../../../types/utils';

import { TranslatorsCacheStorage } from '../TranslatorsCacheStorage';
import { SchedulerWithCache } from './SchedulerWithCache';
import { TranslatorsMap } from '..';

export type Config = Pick<
	AppConfigType,
	'translatorModule' | 'scheduler' | 'cache' | 'llmTranslator'
>;

/**
 * Build and manage a translation scheduler
 */
export class TranslatorManager<Translators extends TranslatorsMap = TranslatorsMap> {
	private config: Config;
	private translators: Translators;
	private onTranslatorModuleFallback: ((moduleId: string) => void) | null = null;

	constructor(config: Config, translators: Translators) {
		this.config = config;
		this.translators = translators;
	}

	/**
	 * Soft-persist callback when a missing translatorModule is resolved to a fallback.
	 * Used so Options UI and "Translated by …" stay consistent without a formal migration.
	 */
	public setTranslatorModuleFallbackHandler(
		handler: ((moduleId: string) => void) | null,
	) {
		this.onTranslatorModuleFallback = handler;
	}

	public setConfig(config: Config) {
		this.config = config;
		this.getTranslationSchedulerInstance(true);
	}

	public setTranslators(customTranslators: Translators) {
		this.translators = customTranslators;
		this.getTranslationSchedulerInstance(true);
	}

	public getTranslatorFeatures() {
		const translatorClass = this.getTranslatorClass();
		return {
			supportedLanguages: translatorClass
				.getSupportedLanguages()
				.filter((lang) => isLanguageCodeISO639v1(lang)),
			isSupportAutodetect: translatorClass.isSupportedAutoFrom(),
		};
	}

	/**
	 * Return map with available translators
	 */
	public getTranslators(): Translators {
		return this.translators;
	}

	public getTranslator(): InstanceType<RecordValues<Translators>> {
		return this.getTranslatorInstance(false);
	}

	/**
	 * Return configured translation scheduler
	 */
	public getScheduler() {
		return this.getTranslationSchedulerInstance();
	}

	private schedulerInstance: IScheduler | null = null;
	private getTranslationSchedulerInstance(forceCreate = false) {
		if (this.schedulerInstance === null || forceCreate) {
			const translator = this.getTranslatorInstance(true);
			const resolvedModuleId = this.getResolvedTranslatorModuleId();

			const { useCache, ...schedulerConfig } = this.config.scheduler;

			const scheduler = new Scheduler(translator, schedulerConfig);

			let schedulerInstance: IScheduler = scheduler;
			if (useCache) {
				// Wrap scheduler by cache
				const cacheInstance = this.getCacheInstance();
				// LLM backends should keep their own punctuation; do not re-attach
				// source non-letter prefix/suffix stripped for cache keys.
				const isLLMTranslator = resolvedModuleId === 'LLMTranslator';
				schedulerInstance = new SchedulerWithCache(scheduler, cacheInstance, {
					restoreAffixes: !isLLMTranslator,
				});
			}

			this.schedulerInstance = schedulerInstance;
		}

		return this.schedulerInstance;
	}

	private translator: InstanceType<RecordValues<Translators>> | null = null;
	private getTranslatorInstance(forceCreate: boolean) {
		if (!forceCreate && this.translator !== null) return this.translator;

		const resolvedModuleId = this.getResolvedTranslatorModuleId();
		const translatorClass = this.getTranslatorClass();
		const translatorOptions =
			resolvedModuleId === 'LLMTranslator' ? this.config.llmTranslator : undefined;
		this.translator = new translatorClass(translatorOptions) as InstanceType<
			RecordValues<Translators>
		>;

		return this.translator;
	}

	private getCacheInstance() {
		// Key cache by the class actually used, not a stale missing id
		const resolvedModuleId = this.getResolvedTranslatorModuleId();
		return new TranslatorsCacheStorage(resolvedModuleId, this.config.cache);
	}

	/**
	 * Resolve translator module id with fallback for removed/missing modules.
	 * Prefer configured id if present; else DEFAULT_TRANSLATOR; else throw.
	 */
	private getResolvedTranslatorModuleId(): string {
		const { translatorModule } = this.config;
		const translators = this.getTranslators();

		if (translatorModule in translators) {
			return translatorModule;
		}

		if (DEFAULT_TRANSLATOR in translators) {
			// Soft-persist once so UI stays consistent with the resolved module
			if (
				this.onTranslatorModuleFallback !== null &&
				translatorModule !== DEFAULT_TRANSLATOR
			) {
				this.onTranslatorModuleFallback(DEFAULT_TRANSLATOR);
				// Avoid re-firing on subsequent resolves in this process
				this.config = {
					...this.config,
					translatorModule: DEFAULT_TRANSLATOR,
				};
			}
			return DEFAULT_TRANSLATOR;
		}

		throw new Error(`Not found translator "${translatorModule}"`);
	}

	private getTranslatorClass(): RecordValues<Translators> {
		const resolvedModuleId = this.getResolvedTranslatorModuleId();
		const translators = this.getTranslators();
		const translatorClass = translators[resolvedModuleId];
		if (translatorClass === undefined) {
			throw new Error(`Not found translator "${resolvedModuleId}"`);
		}

		return translatorClass as RecordValues<Translators>;
	}
}
