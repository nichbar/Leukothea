import { getLanguageCodesISO639 } from 'anylang/languages';

import {
	buildLink,
	getLanguageNameByCode,
	getLocalizedNode,
	getMessage,
} from '../../../../lib/language';
import { DEFAULT_LLM_PROMPT } from '../../../../lib/translators/llm/LLMTranslator';
import { capitalizeString } from '../../../../lib/utils';

import { OptionsGroup } from '../OptionsTree/OptionsTree';

const langCodes = getLanguageCodesISO639('v1');

const docsUrl = (path: string) => {
	const url = new URL(path, 'https://linguister.io');
	url.searchParams.set('utm_source', 'linguist');
	return url.toString();
};

type Options = {
	clearCacheProcess: boolean;
	translatorModules: Record<string, string>;
	ttsModules: Record<string, string>;
	clearCache: () => void;
	toggleCustomTranslatorsWindow: () => void;
	toggleTTSModulesWindow: () => void;
	llmModels: string[];
	llmModelsLoading: boolean;
	llmModelsError?: string;
	llmModelsFetched: boolean;
	refreshLLMModels: () => void;
	webdavTestProcess: boolean;
	webdavSyncProcess: boolean;
	webdavStatusText: string;
	/** Effective enable flag (saved + unsaved edits). */
	webdavEnabled: boolean;
	testWebDAV: () => void;
	syncWebDAVNow: () => void;
};

/**
 * Generate config tree for render with `OptionsTree`
 */
export const generateTree = ({
	clearCacheProcess,
	translatorModules,
	ttsModules,
	clearCache,
	toggleCustomTranslatorsWindow,
	toggleTTSModulesWindow,
	llmModels,
	llmModelsLoading,
	llmModelsError,
	llmModelsFetched,
	refreshLLMModels,
	webdavTestProcess,
	webdavSyncProcess,
	webdavStatusText,
	webdavEnabled,
	testWebDAV,
	syncWebDAVNow,
}: Options): OptionsGroup[] => {
	return [
		{
			title: getMessage('settings_option_commonSettings'),
			groupContent: [
				{
					title: getMessage('settings_option_userLanguage'),
					description: getMessage('settings_option_userLanguage_desc'),
					path: 'language',
					optionContent: {
						type: 'SelectList',
						options: langCodes
							// Remove repeated langs
							.filter((lang, idx, arr) => arr.indexOf(lang) === idx)
							.map((code) => ({
								id: code,
								content: getLanguageNameByCode(code),
							}))
							.sort(({ content: a }, { content: b }) =>
								a > b ? 1 : a < b ? -1 : 0,
							),
					},
				},
				{
					title: getMessage('settings_option_fixedSourceLanguage'),
					description: getMessage('settings_option_fixedSourceLanguage_desc'),
					path: 'fixedSourceLanguage',
					optionContent: {
						type: 'SelectList',
						options: [
							{
								id: '',
								content: getMessage(
									'settings_option_fixedSourceLanguage_detect',
								),
							},
							...langCodes
								.filter((lang, idx, arr) => arr.indexOf(lang) === idx)
								.map((code) => ({
									id: code,
									content: getLanguageNameByCode(code),
								}))
								.sort(({ content: a }, { content: b }) =>
									a > b ? 1 : a < b ? -1 : 0,
								),
						],
					},
				},
			],
		},
		{
			title: getMessage('settings_option_translatePreferences'),
			groupContent: [
				Object.keys(translatorModules).length === 0
					? undefined
					: {
							title: getMessage('settings_option_translatorModule'),
							description: getMessage(
								'settings_option_translatorModule_desc',
							),
							path: 'translatorModule',
							optionContent: {
								type: 'SelectList',
								options: Object.keys(translatorModules).map((value) => ({
									id: value,
									content: translatorModules[value],
								})),
							},
						},
				{
					title: getMessage('settings_option_llmTranslator'),
					description: getMessage('settings_option_llmTranslator_desc'),
					groupContent: [
						{
							title: getMessage('settings_option_llmTranslator_apiKey'),
							description: getMessage(
								'settings_option_llmTranslator_apiKey_desc',
							),
							path: 'llmTranslator.apiKey',
							optionContent: {
								type: 'InputText',
								password: true,
								placeholder: 'public',
							},
						},
						{
							title: getMessage('settings_option_llmTranslator_apiUrl'),
							description: getMessage(
								'settings_option_llmTranslator_apiUrl_desc',
							),
							path: 'llmTranslator.apiUrl',
							optionContent: {
								type: 'InputText',
								placeholder:
									'https://opencode.ai/zen/v1/chat/completions',
							},
						},
						{
							title: getMessage('settings_option_llmTranslator_model'),
							description: (() => {
								const base = getMessage(
									'settings_option_llmTranslator_model_desc',
								);
								if (llmModelsError) {
									return `${base} ${getMessage(
										'settings_option_llmTranslator_model_loadError',
										llmModelsError,
									)}`;
								}
								if (
									!llmModelsLoading &&
									llmModels.length === 0 &&
									llmModelsFetched
								) {
									return `${base} ${getMessage(
										'settings_option_llmTranslator_model_empty',
									)}`;
								}
								if (
									!llmModelsLoading &&
									llmModels.length > 0 &&
									llmModelsFetched
								) {
									return `${base} ${getMessage(
										'settings_option_llmTranslator_model_loaded',
										String(llmModels.length),
									)}`;
								}
								return base;
							})(),
							path: 'llmTranslator.model',
							optionContent: {
								type: 'InputTextWithSuggestions',
								placeholder: 'big-pickle',
								suggestions: llmModels,
								action: {
									text: getMessage(
										'settings_option_llmTranslator_model_refresh',
									),
									action: refreshLLMModels,
									disabled: llmModelsLoading,
									pending: llmModelsLoading,
								},
							},
						},
						{
							title: getMessage('settings_option_llmTranslator_prompt'),
							description: getMessage(
								'settings_option_llmTranslator_prompt_desc',
							),
							path: 'llmTranslator.prompt',
							optionContent: {
								type: 'InputTextarea',
								placeholder: DEFAULT_LLM_PROMPT,
							},
						},
						{
							description: getMessage(
								'settings_option_llmTranslator_includePageTitle_desc',
							),
							path: 'llmTranslator.includePageTitle',
							optionContent: {
								type: 'Checkbox',
								text: getMessage(
									'settings_option_llmTranslator_includePageTitle',
								),
							},
						},
					],
				},
				{
					title: getMessage('settings_option_customTranslatorModule'),
					groupContent: [
						{
							description: getLocalizedNode({
								messageName:
									'settings_option_customTranslatorModule_desc',
								slots: {
									docs: buildLink(docsUrl('/docs/CustomTranslator')),
								},
							}),
							optionContent: {
								type: 'Button',
								text: getMessage(
									'settings_option_customTranslatorModule_manageButton',
								),
								action: toggleCustomTranslatorsWindow,
							},
						},
					],
				},
				{
					title: getMessage('settings_option_translateScheduler'),
					groupContent: [
						{
							title: getMessage('settings_option_translateScheduler_delay'),
							description: getMessage(
								'settings_option_translateScheduler_delay_desc',
							),
							path: 'scheduler.translatePoolDelay',
							optionContent: {
								type: 'InputNumber',
							},
						},
						{
							title: getMessage(
								'settings_option_translateScheduler_retryLimit',
							),
							description: getMessage(
								'settings_option_translateScheduler_retryLimit_desc',
							),
							path: 'scheduler.translateRetryAttemptLimit',
							optionContent: {
								type: 'InputNumber',
							},
						},
					],
				},
				{
					title: getMessage('settings_option_cache'),
					groupContent: [
						{
							description: getMessage('settings_option_cache_enable_desc'),
							path: 'scheduler.useCache',
							optionContent: {
								type: 'Checkbox',
								text: getMessage('settings_option_cache_enable'),
							},
						},
						{
							description: getMessage(
								'settings_option_cache_ignoreCase_desc',
							),
							path: 'cache.ignoreCase',
							optionContent: {
								type: 'Checkbox',
								text: getMessage('settings_option_cache_ignoreCase'),
							},
						},
						{
							description: getMessage('settings_option_cache_clear_desc'),
							optionContent: {
								type: 'Button',
								text: getMessage('settings_option_cache_clear'),
								disabled: clearCacheProcess,
								action: clearCache,
							},
						},
					],
				},
			],
		},
		{
			title: getMessage('settings_option_tts'),
			groupContent: [
				Object.keys(ttsModules).length === 0
					? undefined
					: {
							title: getMessage('settings_option_ttsModule'),
							description: getMessage('settings_option_ttsModule_desc'),
							path: 'ttsModule',
							optionContent: {
								type: 'SelectList',
								options: Object.entries(ttsModules).map(([id, name]) => ({
									id,
									content: name,
								})),
							},
						},
				{
					title: getMessage('settings_option_ttsCustomModules'),
					description: getLocalizedNode({
						messageName: 'settings_option_ttsCustomModules_desc',
						slots: {
							docs: buildLink(docsUrl('/docs/CustomTTS')),
						},
					}),
					optionContent: {
						type: 'Button',
						text: getMessage('settings_option_ttsCustomModules_button'),
						action: toggleTTSModulesWindow,
					},
				},
			],
		},
		{
			title: getMessage('settings_option_selectTranslation'),
			groupContent: [
				{
					path: 'selectTranslator.enabled',
					description: getMessage(
						'settings_option_selectTranslation_enable_desc',
					),
					optionContent: {
						type: 'Checkbox',
						text: getMessage('settings_option_selectTranslation_enable'),
					},
				},
				{
					title: getMessage('settings_option_selectTranslation_mode'),
					path: 'selectTranslator.mode',
					optionContent: {
						type: 'SelectList',
						options: ['popupButton', 'quickTranslate', 'contextMenu'].map(
							(id) => ({
								id,
								content: getMessage(
									`settings_option_selectTranslation_mode_item_${id}`,
								),
							}),
						),
					},
				},
				{
					title: getMessage('settings_option_selectTranslation_modifiers'),
					description: getMessage(
						'settings_option_selectTranslation_modifiers_desc',
					),
					path: 'selectTranslator.modifiers',
					optionContent: {
						type: 'CheckboxGroup',
						valueMap: ['ctrlKey', 'altKey', 'shiftKey', 'metaKey'],
						options: (
							[
								{
									type: 'Checkbox',
									text: getMessage(
										'settings_option_selectTranslation_modifiers_key_ctrl',
									),
								},
								{
									type: 'Checkbox',
									text: getMessage(
										'settings_option_selectTranslation_modifiers_key_alt',
									),
								},
								{
									type: 'Checkbox',
									text: getMessage(
										'settings_option_selectTranslation_modifiers_key_shift',
									),
								},
								{
									type: 'Checkbox',
									text: getMessage(
										'settings_option_selectTranslation_modifiers_key_meta',
									),
								},
							] as const
						).map(({ text, ...rest }) => ({
							text: capitalizeString(text),
							...rest,
						})),
					},
				},
				{
					description: getMessage(
						'settings_option_selectTranslation_strictSelection_desc',
					),
					path: 'selectTranslator.strictSelection',
					optionContent: {
						type: 'Checkbox',
						text: getMessage(
							'settings_option_selectTranslation_strictSelection',
						),
					},
				},
				{
					title: getMessage(
						'settings_option_selectTranslation_header_languageChoice',
					),
					groupContent: [
						{
							path: 'selectTranslator.rememberDirection',
							optionContent: {
								type: 'Checkbox',
								text: getMessage(
									'settings_option_selectTranslation_rememberDirection',
								),
							},
						},
						{
							description: getMessage(
								'settings_option_selectTranslation_detectTextLanguage_desc',
							),

							path: 'selectTranslator.detectedLangFirst',
							optionContent: {
								type: 'Checkbox',
								text: getMessage(
									'settings_option_selectTranslation_detectTextLanguage',
								),
							},
						},
						{
							description: getMessage(
								'settings_option_selectTranslation_isUseAutoForDetectLang_desc',
							),
							path: 'selectTranslator.isUseAutoForDetectLang',
							optionContent: {
								type: 'Checkbox',
								text: getMessage(
									'settings_option_selectTranslation_isUseAutoForDetectLang',
								),
							},
						},
						{
							description: getMessage(
								'settings_option_selectTranslation_skipWhenSameAsUserLanguage_desc',
							),
							path: 'selectTranslator.skipWhenSameAsUserLanguage',
							optionContent: {
								type: 'Checkbox',
								text: getMessage(
									'settings_option_selectTranslation_skipWhenSameAsUserLanguage',
								),
							},
						},
					],
				},
				{
					title: 'Popup button',
					groupContent: [
						{
							description: getMessage(
								'settings_option_selectTranslation_showOnceForSelection_desc',
							),
							path: 'selectTranslator.showOnceForSelection',
							optionContent: {
								type: 'Checkbox',
								text: getMessage(
									'settings_option_selectTranslation_showOnceForSelection',
								),
							},
						},
						{
							description: getMessage(
								'settings_option_selectTranslation_focusOnTranslateButton_desc',
							),
							path: 'selectTranslator.focusOnTranslateButton',
							optionContent: {
								type: 'Checkbox',
								text: getMessage(
									'settings_option_selectTranslation_focusOnTranslateButton',
								),
							},
						},
						{
							title: getMessage(
								'settings_option_selectTranslation_timeoutForHideButton',
							),
							description: getMessage(
								'settings_option_selectTranslation_timeoutForHideButton_desc',
							),
							path: 'selectTranslator.timeoutForHideButton',
							optionContent: {
								type: 'InputNumber',
							},
						},
						{
							title: getMessage(
								'settings_option_selectTranslation_opacity',
							),
							description: getMessage(
								'settings_option_selectTranslation_opacity_desc',
							),
							path: 'selectTranslator.opacity',
							optionContent: {
								type: 'InputNumber',
							},
						},
						{
							title: getMessage('settings_option_selectTranslation_zIndex'),
							description: getMessage(
								'settings_option_selectTranslation_zIndex_desc',
							),
							path: 'selectTranslator.zIndex',
							optionContent: {
								type: 'InputNumber',
							},
						},
					],
				},
			],
		},
		{
			title: getMessage('settings_option_textTranslator'),
			groupContent: [
				{
					description: getMessage(
						'settings_option_textTranslator_rememberText_desc',
					),
					path: 'textTranslator.rememberText',
					optionContent: {
						type: 'Checkbox',
						text: getMessage('settings_option_textTranslator_rememberText'),
					},
				},
				{
					path: 'textTranslator.spellCheck',
					optionContent: {
						type: 'Checkbox',
						text: getMessage('settings_option_textTranslator_spellCheck'),
					},
				},
				{
					path: 'textTranslator.suggestLanguage',
					optionContent: {
						type: 'Checkbox',
						text: getMessage(
							'settings_option_textTranslator_suggestLanguage',
						),
					},
				},
				{
					description: getMessage(
						'settings_option_textTranslator_suggestLanguageAlways_desc',
					),
					path: 'textTranslator.suggestLanguageAlways',
					optionContent: {
						type: 'Checkbox',
						text: getMessage(
							'settings_option_textTranslator_suggestLanguageAlways',
						),
					},
				},
			],
		},

		{
			title: getMessage('settings_section_history'),
			groupContent: [
				{
					description: getLocalizedNode({
						messageName: 'settings_option_history_enable_desc',
						slots: {
							historyPage: buildLink(`/pages/history/history.html`),
						},
					}),
					path: 'history.enabled',
					optionContent: {
						type: 'Checkbox',
						text: getMessage('settings_option_history_enable'),
					},
				},
			],
		},
		{
			title: getMessage('settings_section_sync'),
			groupContent: [
				{
					title: getMessage('settings_option_syncWebdav'),
					description: webdavEnabled
						? getMessage('settings_option_syncWebdav_desc')
						: undefined,
					groupContent: [
						{
							description: webdavEnabled
								? getMessage('settings_option_syncWebdav_enable_desc')
								: undefined,
							path: 'sync.webdav.enabled',
							optionContent: {
								type: 'Checkbox',
								text: getMessage('settings_option_syncWebdav_enable'),
							},
						},
						// Connection + actions only when sync is enabled (incl. unsaved toggle).
						...(webdavEnabled
							? [
									{
										title: getMessage(
											'settings_option_syncWebdav_url',
										),
										description: getMessage(
											'settings_option_syncWebdav_url_desc',
										),
										path: 'sync.webdav.url',
										optionContent: {
											type: 'InputText' as const,
											placeholder:
												'https://nextcloud.example/remote.php/dav/files/user/',
										},
									},
									{
										title: getMessage(
											'settings_option_syncWebdav_username',
										),
										path: 'sync.webdav.username',
										optionContent: {
											type: 'InputText' as const,
										},
									},
									{
										title: getMessage(
											'settings_option_syncWebdav_password',
										),
										description: getMessage(
											'settings_option_syncWebdav_password_desc',
										),
										path: 'sync.webdav.password',
										optionContent: {
											type: 'InputText' as const,
											password: true,
										},
									},
									{
										description: getMessage(
											'settings_option_syncWebdav_syncSecrets_desc',
										),
										path: 'sync.webdav.syncSecrets',
										optionContent: {
											type: 'Checkbox' as const,
											text: getMessage(
												'settings_option_syncWebdav_syncSecrets',
											),
										},
									},
									{
										description: webdavStatusText,
										optionContent: {
											type: 'Button' as const,
											text: getMessage(
												'settings_option_syncWebdav_test',
											),
											disabled: webdavTestProcess,
											action: testWebDAV,
										},
									},
									{
										optionContent: {
											type: 'Button' as const,
											text: getMessage(
												'settings_option_syncWebdav_syncNow',
											),
											disabled: webdavSyncProcess,
											action: syncWebDAVNow,
										},
									},
								]
							: []),
					],
				},
			],
		},
	];
};
