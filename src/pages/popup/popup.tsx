import '../../polyfills/scrollfix';

import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';

import { isMobileBrowser } from '../../lib/browser';
import { getMessage } from '../../lib/language';
import { applyRootTheme } from '../../lib/theme/themeMode';
import { useAppTheme } from '../../lib/theme/useAppTheme';
import { getConfig } from '../../requests/backend/getConfig';
import { getTranslatorFeatures } from '../../requests/backend/getTranslatorFeatures';
import { ping as pingBackend } from '../../requests/backend/ping';
import { onAppConfigUpdated } from '../../requests/global/appConfigUpdate';
import { AppConfigType } from '../../types/runtime';

import { IPopupWindowTab, PopupWindow, TranslatorFeatures } from './layout/PopupWindow';
import { PopupWindowStorage } from './layout/PopupWindow.utils/PopupWindowStorage';
// Tabs
import { TextTranslatorTab } from './tabs/TextTranslator/TextTranslator@tab';

interface PopupPageProps {
	rootElement: HTMLElement;
}

const baseTabs: IPopupWindowTab[] = [
	{
		id: 'translateText',
		component: TextTranslatorTab,
	},
];

const PopupPage: FC<PopupPageProps> = ({ rootElement }) => {
	const [tabs, setTabs] = useState<IPopupWindowTab[]>();
	const [activeTab, setActiveTab] = useState<string>();

	const [config, setConfig] = useState<AppConfigType>();
	const [translatorFeatures, setTranslatorFeatures] = useState<TranslatorFeatures>();

	const [error, setError] = useState<string>();

	// Apply light/dark/auto from config (and live updates from settings / sync)
	useAppTheme(config?.themeMode);

	const getTabsHash = useCallback(() => {
		if (tabs === undefined) {
			return null;
		}

		const tabsHash = tabs
			.map(({ id }) => id)
			// Sort for independent hash of string order
			.sort((str1, str2) => {
				if (str1 > str2) {
					return 1;
				} else if (str2 > str1) {
					return -1;
				}
				return 0;
			})
			.join(';');

		return tabsHash;
	}, [tabs]);

	const popupStorage = useMemo(() => new PopupWindowStorage(), []);

	const isRememberLastTab = config?.popup.rememberLastTab;
	const setActiveTabProxy = useCallback(
		(id: string) => {
			// Remember active tab
			if (isRememberLastTab) {
				const tabsHash = getTabsHash();
				if (tabsHash !== null) {
					popupStorage.setActiveTab(tabsHash, id);
				}
			}

			setActiveTab(id);
		},
		[isRememberLastTab, getTabsHash, popupStorage],
	);

	// Init
	useEffect(() => {
		// Background is required
		pingBackend({ timeout: 1000 })
			.then((isSuccess) => {
				if (!isSuccess) {
					throw new Error(getMessage('common_bgUnavailable'));
				}

				setTabs([...baseTabs]);
				getConfig().then(setConfig);
				getTranslatorFeatures().then(setTranslatorFeatures);
			})
			.catch((reason) => {
				setError(
					reason instanceof Error
						? reason.message
						: getMessage('message_unknownError'),
				);
			});

		return onAppConfigUpdated(setConfig);
	}, []);

	// Update active tab
	useEffect(() => {
		// Skip pre init state
		if (tabs === undefined || config === undefined) return;

		const firstTabId = tabs[0].id;
		const tabsHash = getTabsHash();

		if (!config.popup.rememberLastTab || tabsHash === null) {
			setActiveTabProxy(firstTabId);
		} else {
			popupStorage.getActiveTab(tabsHash).then((lastActiveTab) => {
				// Validate tab id
				if (
					lastActiveTab !== null &&
					tabs.findIndex(({ id }) => id === lastActiveTab) !== -1
				) {
					setActiveTabProxy(lastActiveTab);
				} else {
					setActiveTabProxy(firstTabId);
				}
			});
		}
	}, [config, getTabsHash, popupStorage, setActiveTabProxy, tabs]);

	const minWidth = useMemo(() => (isMobileBrowser() ? undefined : 450), []);

	return (
		<PopupWindow
			rootElement={rootElement}
			tabs={tabs}
			activeTab={activeTab}
			setActiveTab={setActiveTabProxy}
			error={error}
			config={config}
			translatorFeatures={translatorFeatures}
			minWidth={minWidth}
		/>
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
