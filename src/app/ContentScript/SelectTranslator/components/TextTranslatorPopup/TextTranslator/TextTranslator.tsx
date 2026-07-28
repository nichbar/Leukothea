import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import browser from 'webextension-polyfill';
import { cn } from '@bem-react/classname';

// Components
import { Button } from '../../../../../../components/primitives/Button/Button.bundle/desktop';
import { Loader } from '../../../../../../components/primitives/Loader/Loader';
import { isMobileBrowser } from '../../../../../../lib/browser';
import { detectLanguage, getMessage } from '../../../../../../lib/language';
import { TranslatorFeatures } from '../../../../../../pages/popup/layout/PopupWindow';
import { getConfig } from '../../../../../../requests/backend/getConfig';
import { getTranslatorFeatures } from '../../../../../../requests/backend/getTranslatorFeatures';
import { getUserLanguagePreferences } from '../../../../../../requests/backend/getUserLanguagePreferences';
import { addTranslationHistoryEntry } from '../../../../../../requests/backend/history/addTranslationHistoryEntry';
import { TRANSLATION_ORIGIN } from '../../../../../../requests/backend/history/constants';
import { getAvailableTranslators } from '../../../../../../requests/backend/translators/getAvailableTranslators';

import './TextTranslator.css';

export const cnTextTranslator = cn('TextTranslator');

export interface TextTranslatorComponentProps {
	detectedLangFirst: boolean;
	isUseAutoForDetectLang: boolean;
	rememberDirection: boolean;
	text: string;
	translate: (text: string, from: string, to: string) => Promise<string>;
	/**
	 * Recalculate popup position
	 */
	updatePopup: () => void;
	pageLanguage?: string;
}

// TODO: rename component and move to element dir
export const TextTranslator: FC<TextTranslatorComponentProps> = ({
	pageLanguage,
	detectedLangFirst,
	isUseAutoForDetectLang,
	rememberDirection,
	text,
	translate,
	updatePopup,
}) => {
	const [from, setFrom] = useState<string>();
	const [to, setTo] = useState<string>();
	const [translatorFeatures, setTranslatorFeatures] = useState<TranslatorFeatures>();

	const [originalText] = useState<string>(text);
	const [translatedText, setTranslatedText] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [providerName, setProviderName] = useState<string | null>(null);

	const translateContext = useRef(Symbol('TranslateContext'));
	const translateText = useCallback(() => {
		// NOTE: maybe worth handle this error
		if (from === undefined || to === undefined) {
			throw Error(`Call to translate method with invalid direction: ${from}-${to}`);
		}

		translateContext.current = Symbol('TranslateContext');
		const context = translateContext.current;

		setTranslatedText(null);
		setError(null);

		translate(originalText, from, to)
			.then((translatedText) => {
				if (context !== translateContext.current) return;

				setTranslatedText(translatedText);
				setError(null);

				addTranslationHistoryEntry({
					origin: TRANSLATION_ORIGIN.USER_INPUT,
					translation: {
						from,
						to,
						originalText,
						translatedText,
					},
				});
			})
			.catch((reason) => {
				if (context !== translateContext.current) return;

				let error = 'Unknown error';
				if (typeof reason === 'string') {
					error = reason;
				} else if (reason instanceof Error) {
					error = reason.message;
				}

				setTranslatedText(null);
				setError(error);
				console.error(error);
			})
			.finally(() => {
				if (context !== translateContext.current) return;

				translateContext.current = Symbol('TranslateContext');
			});
	}, [from, originalText, to, translate]);

	// Init
	const isUnmount = useRef(false);
	useEffect(() => {
		getTranslatorFeatures().then(
			async ({ supportedLanguages, isSupportAutodetect }) => {
				const [userLanguage, config] = await Promise.all([
					getUserLanguagePreferences(),
					getConfig(),
				]);

				let from: string | undefined;

				// Fixed source language overrides detection / remembered direction
				const fixedSource = config.fixedSourceLanguage;
				if (fixedSource !== null && supportedLanguages.includes(fixedSource)) {
					from = fixedSource;
				}

				// Try recover last direction
				if (from === undefined && rememberDirection) {
					try {
						// TODO: migrate data to another storage property
						// TODO: move storage operations to a hook
						const lastFrom = await browser.storage.local
							.get('SelectTranslator')
							.then((store) => {
								const data = store?.SelectTranslator?.lastFrom;
								return typeof data === 'string' ? data : null;
							});

						if (
							lastFrom !== null &&
							((isSupportAutodetect && lastFrom == 'auto') ||
								supportedLanguages.indexOf(lastFrom)) !== -1
						) {
							from = lastFrom;
						}
					} catch (error) {
						console.error(error);
					}
				}

				// Set `from` language
				if (from === undefined) {
					const detectedLanguage = await detectLanguage(originalText);

					const isValidLang = (lang: any): lang is string => {
						if (typeof lang !== 'string') return false;

						if (supportedLanguages.includes(lang)) return true;
						// TODO: rename `isSupportAutodetect` to `isSupportAutoDetect`
						if (lang === 'auto' && isSupportAutodetect) return true;

						return false;
					};

					// List of lang detectors which define language depends on config
					const langDetectors: {
						getLang: () => string | void;
						priority: number;
					}[] = [
						{
							// Detect language from text or use `auto` if support
							getLang() {
								// Set detected lang if found
								if (detectedLanguage !== null) return detectedLanguage;

								// Set `auto` if support and enable
								if (isUseAutoForDetectLang && isSupportAutodetect)
									return 'auto';

								return;
							},
							priority: 0,
						},

						{
							// Set page lang if found
							getLang() {
								if (pageLanguage !== undefined) return pageLanguage;

								return;
							},
							priority: 0,
						},

						{
							// Default value. Auto detect if supported, first lang otherwise
							getLang() {
								return isSupportAutodetect
									? 'auto'
									: supportedLanguages[0];
							},
							priority: -1,
						},
					];

					// Set priority
					if (detectedLangFirst) {
						langDetectors[0].priority++;
					} else {
						langDetectors[1].priority++;
					}

					// Reverse sort by priority
					const sortedLangDetectors = langDetectors.sort(
						(x, y) => y.priority - x.priority,
					);

					// Select language
					for (const detector of sortedLangDetectors) {
						const selectedFromLang = detector.getLang();
						if (isValidLang(selectedFromLang)) {
							from = selectedFromLang;
							break;
						}
					}
				}

				// Check for cases when component did close very fast
				if (!isUnmount.current) {
					setTranslatorFeatures({
						supportedLanguages,
						isSupportAutodetect,
					});
					setFrom(from);
					setTo(userLanguage);
				}
			},
		);

		// Resolve active translator display name for footer attribution
		Promise.all([getConfig(), getAvailableTranslators()])
			.then(([config, translators]) => {
				if (isUnmount.current) return;

				const moduleId = config.translatorModule;
				// For the LLM translator, show the configured model instead of the generic name
				if (moduleId === 'LLMTranslator') {
					const model = config.llmTranslator?.model?.trim();
					setProviderName(model || translators[moduleId] || moduleId);
					return;
				}

				setProviderName(translators[moduleId] ?? moduleId);
			})
			.catch(console.error);

		return () => {
			isUnmount.current = true;
			translateContext.current = Symbol('TranslateContext');
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Set init state
	const [isInited, setIsInited] = useState(false);
	useEffect(() => {
		// Skip if already inited
		if (isInited) return;

		// Set inited
		if (from !== undefined && to !== undefined && translatorFeatures !== undefined) {
			setIsInited(true);
		}
	}, [isInited, from, to, translatorFeatures]);

	useEffect(() => {
		// Save direction
		if (rememberDirection && from !== undefined) {
			browser.storage.local
				.set({ SelectTranslator: { lastFrom: from } })
				.catch(console.error);
		}
	}, [from, rememberDirection]);

	// Translate once init is ready, and again when language/text changes
	// (both are covered by `translateText` identity via its useCallback deps).
	// Do not split this into multiple effects keyed on `isInited` — they would
	// both fire on the same commit and send duplicate LLM requests.
	useEffect(() => {
		if (!isInited) return;
		translateText();
	}, [isInited, translateText]);

	// Reposition once after Loader mounts and again when the result/error card
	// appears. Avoid calling on every render — that can thrash popper while the
	// first backend round-trip is in flight.
	useEffect(() => {
		if (updatePopup) updatePopup();
	}, [isInited, translatedText, error, updatePopup]);

	const isMobile = useMemo(() => isMobileBrowser(), []);

	// Language panel and close button are intentionally omitted: outside click
	// closes the popup, and source/target languages come from settings.
	if (translatorFeatures !== undefined && (translatedText !== null || error !== null)) {
		return (
			<div className={cnTextTranslator({ mobile: isMobile })}>
				{error === null ? (
					<>
						<div className={cnTextTranslator('Main')}>
							<div className={cnTextTranslator('Body')}>
								{translatedText}
							</div>
						</div>

						{providerName && (
							<div className={cnTextTranslator('Footer')}>
								<span
									className={cnTextTranslator('Provider')}
									title={providerName}
								>
									{getMessage('inlineTranslator_translatedBy', [
										providerName,
									])}
								</span>
							</div>
						)}
					</>
				) : (
					<>
						<div className={cnTextTranslator('Body', { error: true })}>
							{error}
						</div>
						<div className={cnTextTranslator('ErrorActions')}>
							<Button view="action" onPress={translateText}>
								{getMessage('common_retry')}
							</Button>
						</div>
						{providerName && (
							<div className={cnTextTranslator('Footer')}>
								<span
									className={cnTextTranslator('Provider')}
									title={providerName}
								>
									{getMessage('inlineTranslator_translatedBy', [
										providerName,
									])}
								</span>
							</div>
						)}
					</>
				)}
			</div>
		);
	}

	return <Loader className={cnTextTranslator('Loader')} />;
};
