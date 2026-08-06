import React from 'react';
import { Store } from 'effector';

import { ShadowDOMContainerManager } from '../../../lib/ShadowDOMContainerManager';
import { AppConfigType } from '../../../types/runtime';

import { QuickInputPopup } from './QuickInputPopup';

export class QuickInputManager {
	private readonly $state: Store<{
		language: string;
		fixedSourceLanguage: string | null;
		themeMode: AppConfigType['themeMode'];
	}>;

	private readonly shadowRoot: ShadowDOMContainerManager;
	private config: {
		language: string;
		fixedSourceLanguage: string | null;
		themeMode: AppConfigType['themeMode'];
	} | null = null;
	private isOpen = false;

	constructor(
		$state: Store<{
			language: string;
			fixedSourceLanguage: string | null;
			themeMode: AppConfigType['themeMode'];
		}>,
	) {
		this.$state = $state;
		this.shadowRoot = new ShadowDOMContainerManager({
			styles: ['contentscript.css'],
		});
	}

	public start() {
		this.shadowRoot.createRootNode();

		this.$state.watch((state) => {
			this.config = state;
			// If popup is open and config changes, re-render with new langs/theme
			if (this.isOpen) this.render();
		});

		document.addEventListener('keydown', this.onKeyDown, true);
		this.shadowRoot.getRootNode()?.addEventListener('keydown', this.onShadowKeyDown);
	}

	public stop() {
		document.removeEventListener('keydown', this.onKeyDown, true);
		this.shadowRoot
			.getRootNode()
			?.removeEventListener('keydown', this.onShadowKeyDown);
		this.hide();
		this.shadowRoot.unmountComponent();
		this.shadowRoot.removeRootNode();
	}

	private readonly onShadowKeyDown = (evt: KeyboardEvent) => {
		if (evt.key === 'Escape' || evt.key === 'Esc') {
			evt.preventDefault();
			evt.stopImmediatePropagation();
			if (this.isOpen) this.hide();
			return;
		}
		evt.stopImmediatePropagation();
	};

	private readonly onKeyDown = (evt: KeyboardEvent) => {
		// Shift+Q without Ctrl/Alt/Meta. Use code for physical key, not locale-dependent key.
		if (evt.code !== 'KeyQ') return;
		if (!evt.shiftKey || evt.ctrlKey || evt.altKey || evt.metaKey) return;
		// Do not hijack when typing in editable
		const target = evt.target as HTMLElement | null;
		if (target !== null) {
			const tag = target.tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
			if (target.isContentEditable) return;
			// Also check active element
			const active = document.activeElement as HTMLElement | null;
			if (
				active !== null &&
				(active.isContentEditable ||
					/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))
			) {
				return;
			}
		}
		if (this.isOpen) return;
		evt.preventDefault();
		evt.stopImmediatePropagation();
		this.show();
	};

	private show() {
		this.isOpen = true;
		this.render();
	}

	private readonly hide = () => {
		this.isOpen = false;
		this.shadowRoot.mountComponent();
	};

	private render() {
		if (!this.isOpen || this.config === null) return;
		const { language, fixedSourceLanguage, themeMode } = this.config;
		this.shadowRoot.mountComponent(
			React.createElement(QuickInputPopup, {
				from: language,
				to: fixedSourceLanguage,
				themeMode,
				closeHandler: this.hide,
			}),
		);
	}
}
