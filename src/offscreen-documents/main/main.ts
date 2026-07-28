/**
 * Since we may use only one offscreen document, this is a root document,
 * that include another ones as iframes
 */

import { customTranslatorsFactory } from '../../requests/offscreen/customTranslators';
import { themeUpdate } from '../../requests/offscreen/theme';

const setupThemeListener = () => {
	const lightThemeQuery = window.matchMedia('(prefers-color-scheme: light)');
	lightThemeQuery.addEventListener('change', (evt) => {
		themeUpdate({ isLight: evt.matches });
	});

	themeUpdate({ isLight: lightThemeQuery.matches });
};

document.addEventListener('DOMContentLoaded', async () => {
	customTranslatorsFactory();
	setupThemeListener();
});
