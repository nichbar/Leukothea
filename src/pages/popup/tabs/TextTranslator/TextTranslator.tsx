import React, { FC } from 'react';
import { cn } from '@bem-react/classname';

import { Button } from '../../../../components/primitives/Button/Button.bundle/desktop';
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
	description?: string;
	icon: (className: string) => React.ReactElement;
};

const HistoryIcon = (className: string) => (
	<Icon glyph="history" scalable={false} className={className} />
);

const DictionaryIcon = (className: string) => (
	<Icon
		glyph="dictionary"
		scalable={false}
		style={{ transform: 'scale(1.5)' }}
		className={className}
	/>
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
			icon: SettingsIcon,
		},
		{
			id: 'history',
			url: '/pages/history/history.html',
			title: getMessage('history_pageTitle'),
			icon: HistoryIcon,
		},
		{
			id: 'dictionary',
			url: '/pages/dictionary/dictionary.html',
			title: getMessage('dictionary_pageTitle'),
			description: getMessage('dictionary_description'),
			icon: DictionaryIcon,
		},
	];

	return (
		<div className={cnTextTranslator({ view: isMobile ? 'mobile' : undefined })}>
			<nav
				className={cnTextTranslator('Hub')}
				aria-label={getMessage('popup_tab_translateText')}
			>
				{links.map(({ id, url, title, description, icon }) => (
					<Button
						key={id}
						as="a"
						type="link"
						url={url}
						target="_blank"
						view="default"
						size="m"
						width="max"
						className={cnTextTranslator('HubLink')}
						iconLeft={icon}
					>
						<span className={cnTextTranslator('HubLinkBody')}>
							<span className={cnTextTranslator('HubLinkTitle')}>
								{title}
							</span>
							{description ? (
								<span className={cnTextTranslator('HubLinkDescription')}>
									{description}
								</span>
							) : null}
						</span>
					</Button>
				))}
			</nav>
		</div>
	);
};
