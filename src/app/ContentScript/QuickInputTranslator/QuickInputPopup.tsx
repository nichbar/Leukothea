import '../../../themes/presets/dark/desktop';
import '../../../themes/presets/default/desktop';

import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@bem-react/classname';

import { Button } from '../../../components/primitives/Button/Button.bundle/desktop';
import { Loader } from '../../../components/primitives/Loader/Loader';
import { getLanguageNameByCode, getMessage } from '../../../lib/language';
import { SimpleMarkdown } from '../../../lib/simpleMarkdown/SimpleMarkdown';
import { getThemeByMode, ThemeMode } from '../../../lib/theme/themeMode';
import { getTranslatorProviderName } from '../../../lib/translators/getTranslatorProviderName';
import { getConfig } from '../../../requests/backend/getConfig';
import { translate } from '../../../requests/backend/translate';
import { getAvailableTranslators } from '../../../requests/backend/translators/getAvailableTranslators';

import './QuickInputPopup.css';

const cnTheme = cn('Theme');
const cnQuickInputPopup = cn('QuickInputPopup');

export interface QuickInputPopupProps {
	from: string;
	to: string | null;
	themeMode: ThemeMode;
	closeHandler: () => void;
	/** Shift+Q while open — must run with preventDefault on the focused control. */
	swapHandler?: () => void;
	zIndex?: number;
}

const formatError = (reason: unknown): string => {
	if (typeof reason === 'string' && reason.trim().length > 0) return reason;
	if (reason instanceof Error && reason.message.trim().length > 0)
		return reason.message;
	return getMessage('message_unknownError');
};

const isSwapHotkey = (evt: React.KeyboardEvent | KeyboardEvent) =>
	evt.code === 'KeyQ' &&
	evt.shiftKey &&
	!evt.ctrlKey &&
	!evt.altKey &&
	!evt.metaKey &&
	!evt.repeat;

export const QuickInputPopup: FC<QuickInputPopupProps> = ({
	from,
	to,
	themeMode,
	closeHandler,
	swapHandler,
	zIndex = 2147483647,
}) => {
	const theme = useMemo(() => getThemeByMode(themeMode), [themeMode]);
	const [input, setInput] = useState('');
	const [translated, setTranslated] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isTranslating, setIsTranslating] = useState(false);
	const [providerName, setProviderName] = useState<string | null>(null);

	const inputRef = useRef<HTMLTextAreaElement>(null);
	const translateContext = useRef(Symbol('ctx'));
	const timerRef = useRef<number | null>(null);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	useEffect(() => {
		let cancelled = false;
		Promise.all([getConfig(), getAvailableTranslators()])
			.then(([config, translators]) => {
				if (cancelled) return;
				setProviderName(getTranslatorProviderName(config, translators));
			})
			.catch(() => {
				// ignore
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		const onKey = (evt: KeyboardEvent) => {
			if (evt.key === 'Escape') {
				evt.stopPropagation();
				closeHandler();
			}
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [closeHandler]);

	// Cancel Shift+Q on the focused control so "Q" is not typed into the textarea.
	// Document-level preventDefault is unreliable for closed-shadow inputs.
	const handleHotkeys = useCallback(
		(evt: React.KeyboardEvent) => {
			if (!isSwapHotkey(evt)) return;
			evt.preventDefault();
			evt.stopPropagation();
			swapHandler?.();
		},
		[swapHandler],
	);

	// Closed-shadow: only an in-tree preventDefault cancels character insertion.
	// Attach a native listener on the focused textarea (React synthetic alone is enough
	// in most cases; this keeps swap reliable if focus stays on the field).
	useEffect(() => {
		const el = inputRef.current;
		if (el === null) return;
		const onKeyDown = (evt: KeyboardEvent) => {
			if (!isSwapHotkey(evt)) return;
			evt.preventDefault();
			evt.stopPropagation();
			swapHandler?.();
		};
		el.addEventListener('keydown', onKeyDown);
		return () => el.removeEventListener('keydown', onKeyDown);
	}, [swapHandler]);

	useEffect(() => {
		return () => {
			if (timerRef.current !== null) window.clearTimeout(timerRef.current);
		};
	}, []);

	const doTranslate = useCallback(
		(text: string) => {
			const trimmed = text.trim();
			if (trimmed.length === 0) {
				setTranslated(null);
				setError(null);
				setIsTranslating(false);
				return;
			}
			if (to === null) return;
			if (from === to) {
				setError(getMessage('quickInput_sameLanguage'));
				setTranslated(null);
				setIsTranslating(false);
				return;
			}
			const ctx = (translateContext.current = Symbol('ctx'));
			setIsTranslating(true);
			setError(null);
			setTranslated(null);
			const pageTitle = (
				typeof document !== 'undefined' ? document.title : ''
			).trim();
			translate(trimmed, from, to, pageTitle)
				.then((result) => {
					if (ctx !== translateContext.current) return;
					if (typeof result !== 'string')
						throw new Error(getMessage('message_unknownError'));
					setTranslated(result);
					setError(null);
				})
				.catch((reason) => {
					if (ctx !== translateContext.current) return;
					setTranslated(null);
					setError(formatError(reason));
				})
				.finally(() => {
					if (ctx !== translateContext.current) return;
					setIsTranslating(false);
				});
		},
		[from, to],
	);

	const onChange = useCallback(
		(value: string) => {
			setInput(value);
			if (timerRef.current !== null) {
				window.clearTimeout(timerRef.current);
				timerRef.current = null;
			}
			if (value.trim().length === 0) {
				translateContext.current = Symbol('ctx');
				setIsTranslating(false);
				setTranslated(null);
				setError(null);
				return;
			}
			if (to === null || from === to) return;
			timerRef.current = window.setTimeout(() => doTranslate(value), 600);
		},
		[doTranslate, from, to],
	);

	// Re-translate when direction is swapped while text is already entered.
	const directionKey = `${from}:${to ?? ''}`;
	const lastDirectionKey = useRef(directionKey);
	useEffect(() => {
		if (lastDirectionKey.current === directionKey) return;
		lastDirectionKey.current = directionKey;
		if (timerRef.current !== null) {
			window.clearTimeout(timerRef.current);
			timerRef.current = null;
		}
		if (input.trim().length === 0) {
			translateContext.current = Symbol('ctx');
			setTranslated(null);
			setError(null);
			setIsTranslating(false);
			return;
		}
		if (to === null || from === to) {
			translateContext.current = Symbol('ctx');
			setTranslated(null);
			setIsTranslating(false);
			if (from === to && to !== null) {
				setError(getMessage('quickInput_sameLanguage'));
			} else {
				setError(null);
			}
			return;
		}
		doTranslate(input);
	}, [directionKey, doTranslate, from, to, input]);

	const handleRetry = useCallback(() => {
		doTranslate(input);
	}, [doTranslate, input]);

	const fromName = useMemo(() => getLanguageNameByCode(from), [from]);
	const toName = useMemo(() => (to ? getLanguageNameByCode(to) : null), [to]);

	const isMissingTarget = to === null;
	const isSameLang = from === to && to !== null;

	return (
		<div className={cnQuickInputPopup({}, [cnTheme(theme)])} style={{ zIndex }}>
			<div
				className={cnQuickInputPopup('Overlay')}
				onClick={(evt) => {
					if (evt.target === evt.currentTarget) closeHandler();
				}}
			>
				<div
					className={cnQuickInputPopup('Card')}
					role="dialog"
					aria-modal="true"
					onClick={(evt) => evt.stopPropagation()}
					onKeyDown={handleHotkeys}
				>
					<div className={cnQuickInputPopup('Header')}>
						<span className={cnQuickInputPopup('TitleText')}>
							{getMessage('quickInput_title')}
						</span>
						<span className={cnQuickInputPopup('LangPair')}>
							{fromName} → {toName ?? '—'}
						</span>
					</div>

					{isMissingTarget && (
						<div className={cnQuickInputPopup('Warning')}>
							{getMessage('quickInput_fixedNotSet')}
						</div>
					)}
					{isSameLang && (
						<div className={cnQuickInputPopup('Warning')}>
							{getMessage('quickInput_sameLanguage')}
						</div>
					)}

					<textarea
						ref={inputRef}
						className={cnQuickInputPopup('Textarea')}
						placeholder={getMessage('quickInput_placeholder', [fromName])}
						value={input}
						onChange={(e) => onChange(e.target.value)}
						rows={3}
						spellCheck={false}
					/>

					<div className={cnQuickInputPopup('Result')}>
						{isTranslating ? (
							<Loader className={cnQuickInputPopup('Loader')} />
						) : error !== null ? (
							<div className={cnQuickInputPopup('ErrorWrap')}>
								<div className={cnQuickInputPopup('Error')}>{error}</div>
								<Button view="action" size="s" onPress={handleRetry}>
									{getMessage('common_retry')}
								</Button>
							</div>
						) : translated !== null ? (
							<div className={cnQuickInputPopup('Translated')}>
								<SimpleMarkdown text={translated} />
							</div>
						) : (
							<div className={cnQuickInputPopup('Placeholder')}>
								{isMissingTarget
									? getMessage('quickInput_fixedNotSet')
									: getMessage('quickInput_resultPlaceholder')}
							</div>
						)}
					</div>

					<div className={cnQuickInputPopup('Footer')}>
						<span className={cnQuickInputPopup('Hint')}>
							{getMessage('quickInput_footerHint')}
						</span>
						{providerName &&
							translated !== null &&
							!isTranslating &&
							error === null && (
								<span
									className={cnQuickInputPopup('Provider')}
									title={providerName}
								>
									{getMessage('inlineTranslator_translatedBy', [
										providerName,
									])}
								</span>
							)}
					</div>
				</div>
			</div>
		</div>
	);
};
