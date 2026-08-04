import React, { ComponentType, FC, useEffect, useState } from 'react';

import { getConfig } from '../../requests/backend/getConfig';
import { onAppConfigUpdated } from '../../requests/global/appConfigUpdate';
import { AppConfigType } from '../../types/runtime';

import { ThemeMode } from './themeMode';
import { useAppTheme } from './useAppTheme';

/**
 * Loads config, applies light/dark/auto theme to documentElement, and re-renders
 * when the user changes themeMode (or the rest of config) from settings / sync.
 */
export const ThemedPage: FC<{ PageComponent: ComponentType }> = ({ PageComponent }) => {
	const [config, setConfig] = useState<AppConfigType | null>(null);

	useEffect(() => {
		let cancelled = false;

		getConfig()
			.then((next) => {
				if (!cancelled) setConfig(next);
			})
			.catch(() => {
				// Leave null; useAppTheme falls back to auto
			});

		const unsubscribe = onAppConfigUpdated((next) => {
			setConfig(next);
		});

		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, []);

	const themeMode: ThemeMode | undefined = config?.themeMode;
	useAppTheme(themeMode);

	return <PageComponent />;
};
