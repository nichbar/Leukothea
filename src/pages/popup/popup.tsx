import '../../polyfills/scrollfix';

import React, { FC, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';

import { isMobileBrowser } from '../../lib/browser';
import { applyRootTheme } from '../../lib/theme/themeMode';
import { useAppTheme } from '../../lib/theme/useAppTheme';
import { getConfig } from '../../requests/backend/getConfig';
import { onAppConfigUpdated } from '../../requests/global/appConfigUpdate';
import { AppConfigType } from '../../types/runtime';

import { PopupWindow } from './layout/PopupWindow';
import { TextTranslator } from './tabs/TextTranslator/TextTranslator';

interface PopupPageProps {
	rootElement: HTMLElement;
}

const PopupPage: FC<PopupPageProps> = ({ rootElement }) => {
	// Theme only — does not block the static entrance
	const [themeMode, setThemeMode] = useState<AppConfigType['themeMode']>();
	useAppTheme(themeMode);

	useEffect(() => {
		let active = true;

		getConfig()
			.then((config) => {
				if (active) {
					setThemeMode(config.themeMode);
				}
			})
			.catch((reason) => {
				console.error('[popup] failed to load theme config:', reason);
			});

		const unsubscribe = onAppConfigUpdated((config) => {
			setThemeMode(config.themeMode);
		});

		return () => {
			active = false;
			unsubscribe();
		};
	}, []);

	const minWidth = useMemo(() => (isMobileBrowser() ? undefined : 320), []);
	const isMobile = useMemo(() => isMobileBrowser(), []);

	return (
		<PopupWindow rootElement={rootElement} minWidth={minWidth}>
			<TextTranslator isMobile={isMobile} />
		</PopupWindow>
	);
};

function renderPage() {
	const rootElement = document.body.querySelector('#root');
	if (rootElement !== null && rootElement instanceof HTMLElement) {
		ReactDOM.render(<PopupPage rootElement={rootElement} />, rootElement);
	}
}

// Immediate paint before config loads: follow system preference
applyRootTheme('auto');

// For universal render
if (document.readyState == 'loading') {
	document.addEventListener('DOMContentLoaded', renderPage);
} else {
	renderPage();
}
