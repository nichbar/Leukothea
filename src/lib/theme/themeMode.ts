import { configureRootTheme, ThemeWhitepaper } from 'react-elegant-ui/esm/theme';

import { theme as darkTheme } from '../../themes/presets/dark/desktop';
import { theme as lightTheme } from '../../themes/presets/default/desktop';

export type ThemeMode = 'light' | 'dark' | 'auto';

export const THEME_MODES: ThemeMode[] = ['light', 'dark', 'auto'];

export const isThemeMode = (value: unknown): value is ThemeMode =>
	value === 'light' || value === 'dark' || value === 'auto';

/**
 * Resolve configured theme mode to whether the light palette should be used.
 * `auto` follows the OS / browser color scheme.
 */
export const resolveIsLightTheme = (
	mode: ThemeMode,
	systemPrefersLight?: boolean,
): boolean => {
	if (mode === 'light') return true;
	if (mode === 'dark') return false;

	if (typeof systemPrefersLight === 'boolean') {
		return systemPrefersLight;
	}

	if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
		return window.matchMedia('(prefers-color-scheme: light)').matches;
	}

	// Prefer light when system preference is unavailable (tests / SSR).
	return true;
};

export const getThemeByMode = (
	mode: ThemeMode,
	systemPrefersLight?: boolean,
): ThemeWhitepaper => {
	const isLight = resolveIsLightTheme(mode, systemPrefersLight);
	return isLight ? lightTheme : darkTheme;
};

/**
 * Apply the resolved theme classes on a root element (documentElement by default).
 * Safe to call repeatedly when mode or system preference changes.
 */
export const applyRootTheme = (
	mode: ThemeMode,
	options?: {
		root?: HTMLElement | null;
		systemPrefersLight?: boolean;
	},
): ThemeWhitepaper => {
	const theme = getThemeByMode(mode, options?.systemPrefersLight);
	const root =
		options?.root ??
		(typeof document !== 'undefined' ? document.documentElement : null);

	if (root) {
		configureRootTheme({ theme, root });
	}

	return theme;
};

/**
 * Subscribe to OS light/dark preference changes. Returns an unsubscribe.
 */
export const subscribeSystemColorScheme = (
	handler: (prefersLight: boolean) => void,
): (() => void) => {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
		return () => {};
	}

	const media = window.matchMedia('(prefers-color-scheme: light)');
	const listener = (event: MediaQueryListEvent) => {
		handler(event.matches);
	};

	// Safari < 14 uses addListener
	if (typeof media.addEventListener === 'function') {
		media.addEventListener('change', listener);
		return () => media.removeEventListener('change', listener);
	}

	media.addListener(listener);
	return () => media.removeListener(listener);
};
