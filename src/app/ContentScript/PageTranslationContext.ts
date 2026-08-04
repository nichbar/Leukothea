import { combine, createEffect, createEvent, createStore, sample, Store } from 'effector';

import { getPageLanguage } from '../../lib/browser';
import { AppConfigType } from '../../types/runtime';

import { SelectTranslatorController } from './SelectTranslator/SelectTranslatorController';
import { SelectTranslatorManager } from './SelectTranslator/SelectTranslatorManager';

export type PageData = {
	language: string | null;
};

type TranslatorsState = {
	textTranslation: boolean;
};

/**
 * Content-script context for on-page translators.
 * Full-page translation was removed; this hosts only the selection translator
 * and still detects the page language for selection direction fallbacks.
 */
export class PageTranslationContext {
	private readonly $config: Store<AppConfigType>;
	private readonly $pageData: Store<PageData>;
	private readonly $translatorsState: Store<TranslatorsState>;

	constructor($config: Store<AppConfigType>) {
		this.$config = $config;

		this.$pageData = createStore<PageData>({
			language: null,
		});

		this.$translatorsState = createStore<TranslatorsState>({
			textTranslation: false,
		});

		const textTranslatorStateChanged = createEvent<boolean>();
		this.$translatorsState.on(
			textTranslatorStateChanged,
			(state, textTranslation) => ({ ...state, textTranslation }),
		);

		this.$config
			.map((config) => config.selectTranslator.enabled)
			.watch(textTranslatorStateChanged);
	}

	private readonly controllers: {
		selectTranslator: SelectTranslatorController | null;
	} = {
		selectTranslator: null,
	};

	public getTextTranslator() {
		return this.controllers.selectTranslator;
	}

	public async start() {
		const $masterStore = combine({
			config: this.$config,
			translatorsState: this.$translatorsState,
			pageData: this.$pageData,
		});

		const $selectTranslatorState = $masterStore.map(
			({ config, translatorsState, pageData }) => ({
				enabled: translatorsState.textTranslation,
				config: config.selectTranslator,
				themeMode: config.themeMode,
				pageData,
			}),
		);

		const selectTranslatorManager = new SelectTranslatorManager(
			$selectTranslatorState,
		);
		selectTranslatorManager.start();

		this.controllers.selectTranslator = new SelectTranslatorController(
			selectTranslatorManager,
		);

		// Detect page language for selection translator fallbacks
		const $docReadyState = createStore(document.readyState);
		const updatedDocReadyState = createEvent<DocumentReadyState>();
		$docReadyState.on(updatedDocReadyState, (_, state) => state);

		document.addEventListener('readystatechange', () => {
			updatedDocReadyState(document.readyState);
		});

		const $isPageLoaded = $docReadyState.map((readyState) => {
			const getReadyStateIndex = (state: DocumentReadyState) =>
				['loading', 'interactive', 'complete'].indexOf(state);

			return getReadyStateIndex(readyState) >= getReadyStateIndex('interactive');
		});

		const scanPageFx = createEffect(async (config: AppConfigType) => {
			if (config.fixedSourceLanguage !== null) {
				return { pageLanguage: config.fixedSourceLanguage };
			}

			const pageLanguage = await getPageLanguage(false);
			return { pageLanguage };
		});

		this.$pageData.on(scanPageFx.doneData, (state, payload) => ({
			...state,
			language: payload.pageLanguage,
		}));

		sample({
			clock: $isPageLoaded,
			source: this.$config,
		}).watch(scanPageFx);
	}
}
