import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import browser from 'webextension-polyfill';
import { cn } from '@bem-react/classname';

// Components
import { Button } from '../../../../../../components/primitives/Button/Button.bundle/desktop';
import { Loader } from '../../../../../../components/primitives/Loader/Loader';
import { isMobileBrowser } from '../../../../../../lib/browser';
import { detectLanguage, getMessage } from '../../../../../../lib/language';
import { SimpleMarkdown } from '../../../../../../lib/simpleMarkdown/SimpleMarkdown';
import { getTranslatorProviderName } from '../../../../../../lib/translators/getTranslatorProviderName';
import { TranslatorFeatures } from '../../../../../../pages/popup/layout/PopupWindow';
import { getConfig } from '../../../../../../requests/backend/getConfig';
import { getTranslatorFeatures } from '../../../../../../requests/backend/getTranslatorFeatures';
import { getUserLanguagePreferences } from '../../../../../../requests/backend/getUserLanguagePreferences';
import { addTranslationHistoryEntry } from '../../../../../../requests/backend/history/addTranslationHistoryEntry';
import { TRANSLATION_ORIGIN } from '../../../../../../requests/backend/history/constants';
import { ping as pingBackend } from '../../../../../../requests/backend/ping';
import { getAvailableTranslators } from '../../../../../../requests/backend/translators/getAvailableTranslators';

import './TextTranslator.css';

export const cnTextTranslator = cn('TextTranslator');

const formatErrorReason = (reason: unknown) => {
	if (typeof reason === 'string' && reason.trim().length > 0) return reason;
	if (reason instanceof Error && reason.message.trim().length > 0) {
		return reason.message;
	}
	return getMessage('message_unknownError');
};

export interface TextTranslatorComponentProps {
	detectedLangFirst: boolean;
	isUseAutoForDetectLang: boolean;
	rememberDirection: boolean;
	text: string;
	translate: (
		text: string,
		from: string,
		to: string,
		pageTitle?: string,
	) => Promise<string>;
	/**
	 * Recalculate popup position
	 */
	updatePopup: () => void;
	pageLanguage?: string;
	/**
	 * Optional page title to send as LLM context (when enabled in settings).
	 */
	pageTitle?: string;
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
	pageTitle,
}) => {
	const [from, setFrom] = useState<string>();
	const [to, setTo] = useState<string>();
	const [translatorFeatures, setTranslatorFeatures] = useState<TranslatorFeatures>();

	const [originalText] = useState<string>(text);
	const [translatedText, setTranslatedText] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [providerName, setProviderName] = useState<string | null>(null);

	const translateContext = useRef(Symbol('TranslateContext'));
	const isUnmount = useRef(false);
	const [isInited, setIsInited] = useState(false);

	const translateText = useCallback(() => {
		// NOTE: maybe worth handle this error
		if (from === undefined || to === undefined) {
			throw Error(`Call to translate method with invalid direction: ${from}-${to}`);
		}

		translateContext.current = Symbol('TranslateContext');
		const context = translateContext.current;

		setTranslatedText(null);
		setError(null);

		translate(originalText, from, to, pageTitle)
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

				const nextError = formatErrorReason(reason);

				setTranslatedText(null);
				setError(nextError);
				console.error('[SelectTranslator] translate failed:', reason);
			})
			.finally(() => {
				if (context !== translateContext.current) return;

				translateContext.current = Symbol('TranslateContext');
			});
	}, [from, originalText, to, translate, pageTitle]);

	// Resolve languages / features before the first LLM call. Failures used to
	// leave the Loader forever because this path had no catch.
	const initTranslator = useCallback(async () => {
		setError(null);
		setTranslatedText(null);

		try {
			// Wait for the MV3 service worker to finish registering handlers.
			// Without this, getTranslatorFeatures/getConfig can resolve as
			// `undefined` during SW wake and surface as "Invalid type".
			const backgroundReady = await pingBackend({ timeout: 2000, delay: 50 });
			if (!backgroundReady) {
				throw new Error(getMessage('common_bgUnavailable'));
			}

			const { supportedLanguages, isSupportAutodetect } =
				await getTranslatorFeatures();
			const [userLanguage, config] = await Promise.all([
				getUserLanguagePreferences(),
				getConfig(),
			]);

			let nextFrom: string | undefined;

			// Fixed source language overrides detection / remembered direction
			const fixedSource = config.fixedSourceLanguage;
			if (fixedSource !== null && supportedLanguages.includes(fixedSource)) {
				nextFrom = fixedSource;
			}

			// Try recover last direction
			if (nextFrom === undefined && rememberDirection) {
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
						nextFrom = lastFrom;
					}
				} catch (storageError) {
					console.error(
						'[SelectTranslator] failed to restore last direction:',
						storageError,
					);
				}
			}

			// Set `from` language
			if (nextFrom === undefined) {
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
							return isSupportAutodetect ? 'auto' : supportedLanguages[0];
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
						nextFrom = selectedFromLang;
						break;
					}
				}
			}

			// Check for cases when component did close very fast
			if (isUnmount.current) return;

			if (nextFrom === undefined) {
				throw new Error('Unable to resolve source language for translation');
			}

			setTranslatorFeatures({
				supportedLanguages,
				isSupportAutodetect,
			});
			setFrom(nextFrom);
			setTo(userLanguage);
		} catch (reason) {
			if (isUnmount.current) return;

			const nextError = formatErrorReason(reason);
			setError(nextError);
			// Keep this log visible in the page console for intermittent SW/init races.
			console.error('[SelectTranslator] init failed:', reason);
		}
	}, [
		detectedLangFirst,
		isUseAutoForDetectLang,
		originalText,
		pageLanguage,
		rememberDirection,
	]);

	useEffect(() => {
		isUnmount.current = false;
		void initTranslator();

		// Resolve active translator display name for footer attribution
		Promise.all([getConfig(), getAvailableTranslators()])
			.then(([config, translators]) => {
				if (isUnmount.current) return;

				setProviderName(getTranslatorProviderName(config, translators));
			})
			.catch((reason) => {
				console.error('[SelectTranslator] provider name resolve failed:', reason);
			});

		return () => {
			isUnmount.current = true;
			translateContext.current = Symbol('TranslateContext');
		};
	}, [initTranslator]);

	// Set init state
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

	const handleRetry = useCallback(() => {
		if (!isInited) {
			void initTranslator();
			return;
		}

		translateText();
	}, [initTranslator, isInited, translateText]);

	const isMobile = useMemo(() => isMobileBrowser(), []);

	// Language panel and close button are intentionally omitted: outside click
	// closes the popup, and source/target languages come from settings.
	// Show the error card even when init never reached translatorFeatures, so a
	// hung background request is not stuck on the Loader forever.
	if (translatedText !== null) {
		return (
			<div className={cnTextTranslator({ mobile: isMobile })}>
				<div className={cnTextTranslator('Main')}>
					<div className={cnTextTranslator('Body')}>
						<SimpleMarkdown text={translatedText} />
					</div>
				</div>

				{providerName && (
					<div className={cnTextTranslator('Footer')}>
						<span
							className={cnTextTranslator('Provider')}
							title={providerName}
						>
							{getMessage('inlineTranslator_translatedBy', [providerName])}
						</span>
					</div>
				)}
			</div>
		);
	}

	if (error !== null) {
		return (
			<div className={cnTextTranslator({ mobile: isMobile })}>
				<div className={cnTextTranslator('Body', { error: true })}>{error}</div>
				<div className={cnTextTranslator('ErrorActions')}>
					<Button view="action" onPress={handleRetry}>
						{getMessage('common_retry')}
					</Button>
				</div>
				{providerName && (
					<div className={cnTextTranslator('Footer')}>
						<span
							className={cnTextTranslator('Provider')}
							title={providerName}
						>
							{getMessage('inlineTranslator_translatedBy', [providerName])}
						</span>
					</div>
				)}
			</div>
		);
	}

	return <Loader className={cnTextTranslator('Loader')} />;
};
