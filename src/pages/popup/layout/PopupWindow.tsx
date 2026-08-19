import React, { FC, ReactNode, useEffect, useMemo, useRef } from 'react';
import { cn } from '@bem-react/classname';

import { isMobileBrowser } from '../../../lib/browser';
import { getMessage } from '../../../lib/language';
import { XResizeObserver } from '../../../lib/XResizeObserver';
import LogoElement from '../../../res/logo-icon.svg';

import './PopupWindow.css';

export const cnPopupWindow = cn('PopupWindow');

/** Shared by selection translator UI (not used by the static popup entrance). */
export type TranslatorFeatures = {
	supportedLanguages: string[];
	isSupportAutodetect: boolean;
};

export interface PopupWindowProps {
	/**
	 * Root element for detect decreasing size
	 */
	rootElement: HTMLElement;

	/**
	 * Error message which show instead of main content
	 */
	error?: ReactNode;

	/**
	 * Main popup body (static entrance, etc.)
	 */
	children?: ReactNode;

	/**
	 * Set min width of window
	 */
	minWidth?: number;
}

/**
 * Popup chrome: logo header + body. No async bootstrap — body is static.
 */
export const PopupWindow: FC<PopupWindowProps> = ({
	error,
	children,
	rootElement,
	minWidth,
}) => {
	// Resize window
	const resizeObserver = useRef<XResizeObserver>();
	useEffect(() => {
		// Disable on mobile browsers
		if (isMobileBrowser()) return;

		resizeObserver.current = new XResizeObserver({
			sizeGetter: (node: Element) => ({
				height: node.scrollHeight,
				width: node.scrollWidth,
			}),
		});

		const doc = document.body;
		const wrap = rootElement;

		// Hack which implement resize body in firefox
		// It need when popup wrap have overflow items
		// Standard ResizeObserver can't track this even with option `box: 'border-box'`
		const isFirefox = /firefox/i.test(navigator.userAgent);
		if (isFirefox) {
			// TODO: fix size decreasing
			// Size decreasing is not work now. Block is hungry. Else it work, but layout always small
			// Max size remember module below is not affect on this problem

			resizeObserver.current.addHandler(wrap, () => {
				let wCounter = 0;
				while (wCounter < 2) {
					if (doc.scrollWidth > doc.clientWidth) {
						doc.style.width = doc.scrollWidth + 'px';
						break;
					} else if (wCounter < 2) {
						// Reset size for handle in next tick
						doc.style.width = '';
					}

					wCounter++;
				}

				let hCounter = 0;
				while (hCounter < 2) {
					if (doc.scrollHeight > doc.clientHeight) {
						doc.style.height = doc.scrollHeight + 'px';
						break;
					} else if (hCounter < 2) {
						// Reset size for handle in next tick
						doc.style.height = '';
					}

					hCounter++;
				}
			});
		}

		// Remember max width to prevent layout jump
		let lastMaxWidth = 0;
		resizeObserver.current.addHandler(wrap, () => {
			const currentWidth = wrap.scrollWidth;

			doc.style.width = '';
			const resetWidth = wrap.scrollWidth;

			lastMaxWidth = Math.max(lastMaxWidth, currentWidth, resetWidth);
			doc.style.width = lastMaxWidth + 'px';
		});

		return () => {
			if (resizeObserver.current !== undefined) {
				resizeObserver.current.purgeHandlers(rootElement);
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const isMobile = useMemo(() => isMobileBrowser(), []);

	const content: ReactNode =
		error !== undefined ? (
			<div className={cnPopupWindow('ErrorMessage', { plainText: true })}>
				{error}
			</div>
		) : (
			<div className={cnPopupWindow('Content')}>{children}</div>
		);

	const contentStyle = useMemo(
		() => ({ minWidth: minWidth !== undefined ? minWidth + 'px' : undefined }),
		[minWidth],
	);

	return (
		<div className={cnPopupWindow({ view: isMobile ? 'mobile' : undefined })}>
			<div className={cnPopupWindow('Header')}>
				<div className={cnPopupWindow('Logo')}>
					<LogoElement />
				</div>
				<h1 className={cnPopupWindow('Title')}>
					{getMessage('popup_hub_title')}
				</h1>
			</div>
			<div style={contentStyle}>{content}</div>
		</div>
	);
};
