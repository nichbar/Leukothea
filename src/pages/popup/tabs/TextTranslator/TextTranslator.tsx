import React, { FC } from 'react';
import { cn } from '@bem-react/classname';

import { Icon } from '../../../../components/primitives/Icon/Icon.bundle/desktop';
import { getMessage } from '../../../../lib/language';

import './TextTranslator.css';

export const cnTextTranslator = cn('TextTranslator');

export interface TextTranslatorProps {
	isMobile?: boolean;
}

type HubLink = {
	id: string;
	url: string;
	title: string;
	description: string;
	icon: (className: string) => React.ReactElement;
};

const HistoryIcon = (className: string) => (
	<Icon glyph="history" scalable={false} className={className} />
);

const DictionaryIcon = (className: string) => (
	<Icon glyph="dictionary" scalable={false} className={className} />
);

const SettingsIcon = (className: string) => (
	<Icon glyph="settings" scalable={false} className={className} />
);

/**
 * Popup hub: entrance to settings, history, and dictionary.
 * Text translation lives in the selection popup, not the extension popup.
 */
export const TextTranslator: FC<TextTranslatorProps> = ({ isMobile }) => {
	const links: HubLink[] = [
		{
			id: 'settings',
			url: '/pages/options/options.html',
			title: getMessage('settings_pageTitle'),
			description: getMessage('popup_hub_settings_description'),
			icon: SettingsIcon,
		},
		{
			id: 'history',
			url: '/pages/history/history.html',
			title: getMessage('history_pageTitle'),
			description: getMessage('popup_hub_history_description'),
			icon: HistoryIcon,
		},
		{
			id: 'dictionary',
			url: '/pages/dictionary/dictionary.html',
			title: getMessage('dictionary_pageTitle'),
			description: getMessage('popup_hub_dictionary_description'),
			icon: DictionaryIcon,
		},
	];

	return (
		<div className={cnTextTranslator({ view: isMobile ? 'mobile' : undefined })}>
			<p className={cnTextTranslator('Subtitle')}>
				{getMessage('popup_hub_subtitle')}
			</p>
			<nav
				className={cnTextTranslator('Hub')}
				aria-label={getMessage('popup_tab_translateText')}
			>
				{links.map(({ id, url, title, description, icon }) => (
					<a
						key={id}
						href={url}
						target="_blank"
						rel="noopener noreferrer"
						className={cnTextTranslator('HubLink')}
					>
						<span
							className={cnTextTranslator('HubLinkIcon', { id })}
							aria-hidden
						>
							{icon(cnTextTranslator('HubLinkGlyph'))}
						</span>
						<span className={cnTextTranslator('HubLinkBody')}>
							<span className={cnTextTranslator('HubLinkTitle')}>
								{title}
							</span>
							<span className={cnTextTranslator('HubLinkDescription')}>
								{description}
							</span>
						</span>
					</a>
				))}
			</nav>
		</div>
	);
};
