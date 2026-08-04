import { Store } from 'effector';

import { AppConfigType } from '../../../types/runtime';

import { PageData } from '../PageTranslationContext';
import { SelectTranslator } from './SelectTranslator';

export class SelectTranslatorManager {
	private readonly $state;
	constructor(
		$state: Store<{
			enabled: boolean;
			config: AppConfigType['selectTranslator'];
			themeMode: AppConfigType['themeMode'];
			pageData: PageData;
		}>,
	) {
		this.$state = $state;
	}

	private selectTranslator: SelectTranslator | null = null;

	public getSelectTranslator() {
		return this.selectTranslator;
	}

	public start() {
		// Manage text translation instance
		this.$state.watch(({ config: preferences, themeMode, pageData }) => {
			if (preferences.enabled) {
				const { mode, ...restPreferences } = preferences;
				const config = {
					...restPreferences,
					themeMode,
					pageLanguage: pageData.language || undefined,
					quickTranslate: mode === 'quickTranslate',
					enableTranslateFromContextMenu: mode === 'contextMenu',
				};

				if (this.selectTranslator === null) {
					this.selectTranslator = new SelectTranslator(config);
				} else {
					// Soft-update options without stop/start so an open
					// selection popup (including the loading spinner) is not
					// torn down by identical config broadcasts or soft field
					// changes like pageLanguage.
					this.selectTranslator.setOptions(config);
				}
			} else {
				if (this.selectTranslator === null) return;

				if (this.selectTranslator.isRun()) {
					this.selectTranslator.stop();
				}

				this.selectTranslator = null;
			}
		});

		// Manage text translation state
		const $isTextTranslationStarted = this.$state.map(({ enabled }) => enabled);
		$isTextTranslationStarted.watch((isTranslating) => {
			if (this.selectTranslator === null) return;
			if (isTranslating === this.selectTranslator.isRun()) return;

			if (isTranslating) {
				this.selectTranslator.start();
			} else {
				this.selectTranslator.stop();
			}
		});
	}
}
