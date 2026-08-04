// Resources
import '../polyfills/scrollfix';

import React, { ComponentType } from 'react';
import ReactDOM from 'react-dom';
import { configureRootTheme, ThemeWhitepaper } from 'react-elegant-ui/esm/theme';

import { ThemedPage } from './theme/ThemedPage';
import { applyRootTheme, ThemeMode } from './theme/themeMode';

type Options = {
	title?: string;
	styles?: string[];
	scripts?: string[];
	/**
	 * Static fallback theme applied before config loads.
	 * Prefer omitting this and letting ThemedPage resolve light/dark/auto.
	 */
	theme?: ThemeWhitepaper;
	/**
	 * When true (default), wrap the page so themeMode from config is applied
	 * and updates live when settings change.
	 */
	followConfigTheme?: boolean;
	rootNode?: Element | null;
	PageComponent: ComponentType;
};

/**
 * Helper for render page
 */
export const renderPage = ({
	title,
	theme,
	followConfigTheme = true,
	PageComponent,
	rootNode = document.body.querySelector('#root'),
}: Options) => {
	if (title !== undefined) {
		document.title = title;
	}

	// Immediate paint: static theme if provided, otherwise auto (system).
	if (theme !== undefined) {
		configureRootTheme({ theme, root: document.documentElement });
	} else if (followConfigTheme) {
		applyRootTheme('auto' satisfies ThemeMode);
	}

	const Root = followConfigTheme
		? () => <ThemedPage PageComponent={PageComponent} />
		: PageComponent;

	function render() {
		if (rootNode !== null && rootNode instanceof HTMLElement) {
			ReactDOM.render(<Root />, rootNode);
		}
	}

	// Render as fast as possible
	if (document.readyState == 'loading') {
		document.addEventListener('DOMContentLoaded', render);
	} else {
		render();
	}
};
