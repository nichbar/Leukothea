import { useEffect, useMemo, useState } from 'react';
import { ThemeWhitepaper } from 'react-elegant-ui/esm/theme';

import {
	applyRootTheme,
	getThemeByMode,
	resolveIsLightTheme,
	subscribeSystemColorScheme,
	ThemeMode,
} from './themeMode';

type Options = {
	/**
	 * When true (default), also write theme classes on documentElement.
	 * Set false for shadow-DOM / local theme roots that only need the object.
	 */
	applyToDocument?: boolean;
	root?: HTMLElement | null;
};

/**
 * Resolve light/dark theme from config `themeMode` and the system color scheme.
 * Re-applies when mode or OS preference changes.
 */
export const useAppTheme = (
	themeMode: ThemeMode | undefined,
	{ applyToDocument = true, root }: Options = {},
): ThemeWhitepaper => {
	const mode: ThemeMode = themeMode ?? 'auto';
	const [systemPrefersLight, setSystemPrefersLight] = useState(() =>
		resolveIsLightTheme('auto'),
	);

	useEffect(() => {
		if (mode !== 'auto') return;

		setSystemPrefersLight(resolveIsLightTheme('auto'));
		return subscribeSystemColorScheme(setSystemPrefersLight);
	}, [mode]);

	const theme = useMemo(
		() => getThemeByMode(mode, systemPrefersLight),
		[mode, systemPrefersLight],
	);

	useEffect(() => {
		if (!applyToDocument) return;
		applyRootTheme(mode, { root, systemPrefersLight });
	}, [applyToDocument, mode, root, systemPrefersLight]);

	return theme;
};
