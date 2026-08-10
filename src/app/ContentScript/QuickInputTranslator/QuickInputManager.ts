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
	/** Session-only direction flip for the open popup (resets on close). */
	private swapped = false;

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
		// Warm contentscript.css inside the closed shadow so first Shift+Q
		// does not paint an unstyled white flash at the top-left.
		this.shadowRoot.preloadStyles();

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

	private isSwapHotkey(evt: KeyboardEvent) {
		// Shift+Q without Ctrl/Alt/Meta. Use code for physical key, not locale-dependent key.
		return (
			evt.code === 'KeyQ' &&
			evt.shiftKey &&
			!evt.ctrlKey &&
			!evt.altKey &&
			!evt.metaKey &&
			!evt.repeat
		);
	}

	private readonly onShadowKeyDown = (evt: KeyboardEvent) => {
		if (evt.key === 'Escape' || evt.key === 'Esc') {
			evt.preventDefault();
			evt.stopImmediatePropagation();
			if (this.isOpen) this.hide();
			return;
		}
		// Closed shadow: also catch Shift+Q on the host path and cancel default.
		if (this.isOpen && this.isSwapHotkey(evt)) {
			evt.preventDefault();
			evt.stopImmediatePropagation();
			this.toggleSwap();
			return;
		}
		evt.stopImmediatePropagation();
	};

	private readonly onKeyDown = (evt: KeyboardEvent) => {
		if (!this.isSwapHotkey(evt)) return;

		// While open, popup/shadow handlers own Shift+Q. Document-level
		// preventDefault + stopImmediatePropagation cannot cancel typing into a
		// closed-shadow textarea (and would also block the target handler).
		if (this.isOpen) return;

		// Do not hijack when typing in editable page fields.
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
		evt.preventDefault();
		evt.stopImmediatePropagation();
		this.show();
	};

	private show() {
		this.swapped = false;
		this.isOpen = true;
		this.render();
	}

	private readonly hide = () => {
		this.isOpen = false;
		this.swapped = false;
		this.shadowRoot.mountComponent();
	};

	private lastSwapAt = 0;

	private readonly toggleSwap = () => {
		// Nothing useful to swap without a fixed source language.
		if (this.config?.fixedSourceLanguage === null) return;
		// React target handler + shadow host listener can both see the same key.
		const now = Date.now();
		if (now - this.lastSwapAt < 50) return;
		this.lastSwapAt = now;
		this.swapped = !this.swapped;
		this.render();
	};

	private render() {
		if (!this.isOpen || this.config === null) return;
		const { language, fixedSourceLanguage, themeMode } = this.config;
		const from =
			this.swapped && fixedSourceLanguage !== null ? fixedSourceLanguage : language;
		const to =
			this.swapped && fixedSourceLanguage !== null ? language : fixedSourceLanguage;
		this.shadowRoot.mountComponent(
			React.createElement(QuickInputPopup, {
				from,
				to,
				themeMode,
				closeHandler: this.hide,
				// Handle on the focused control: document preventDefault can miss
				// closed-shadow inputs and still insert "Q".
				swapHandler: this.toggleSwap,
			}),
		);
	}
}
