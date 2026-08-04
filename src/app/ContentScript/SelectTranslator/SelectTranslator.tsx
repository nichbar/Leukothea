import React from 'react';

import { detectLanguage } from '../../../lib/language';
import { ShadowDOMContainerManager } from '../../../lib/ShadowDOMContainerManager';
import { getUserLanguagePreferences } from '../../../requests/backend/getUserLanguagePreferences';
import { translate } from '../../../requests/backend/translate';

import { TextTranslatorPopup } from './components/TextTranslatorPopup/TextTranslatorPopup';
import {
	AnchorRect,
	getSelectionAnchorRect,
} from './components/TextTranslatorPopup/TextTranslatorPopup.utils/getSelectionAnchorRect';

export interface Options {
	/**
	 * Key modifiers to activate translate of selected text
	 */
	modifiers: ('ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey')[];

	/**
	 * Skip when pointerdown not on the selected text
	 */
	strictSelection: boolean;

	/**
	 * Don't show translate button and translate at once
	 */
	quickTranslate: boolean;

	/**
	 * Page language for translate direction
	 */
	pageLanguage?: string;

	/**
	 * Detected language is firstly than page language
	 */
	detectedLangFirst: boolean;

	/**
	 * Use auto detection for `from` direction
	 */
	isUseAutoForDetectLang: boolean;

	/**
	 * Hide selection popup when detected language matches "Your language"
	 */
	skipWhenSameAsUserLanguage: boolean;

	/**
	 * Remember translate direction
	 */
	rememberDirection: boolean;

	/**
	 * CSS property for popup
	 */
	zIndex?: number;

	/**
	 * Hide translate button after delay when specified positive number
	 */
	timeoutForHideButton?: number;

	/**
	 * Useful for keyboard navigation
	 */
	focusOnTranslateButton?: boolean;

	/**
	 * Show translate block once for each text selection
	 */
	showOnceForSelection?: boolean;

	/**
	 * Opacity of the selection TextTranslator popup card (0–1)
	 */
	opacity?: number;

	/**
	 * UI theme: light / dark / auto (system)
	 */
	themeMode?: 'light' | 'dark' | 'auto';

	enableTranslateFromContextMenu?: boolean;
}

export const getSelectedTextOfInput = (elm: HTMLInputElement | HTMLTextAreaElement) => {
	const { selectionStart, selectionEnd } = elm;

	if (selectionStart === null || selectionEnd === null) return '';
	return elm.value.slice(selectionStart, selectionEnd);
};

export const getAbsolutePositionOfElement = (element: HTMLElement) => {
	const bounds = element.getBoundingClientRect();
	const { scrollX = 0, scrollY = 0 } = window;
	return {
		x: bounds.x + scrollX,
		y: bounds.y + scrollY,
	};
};

/**
 * This wrapper on component need to allow convenient manage state
 */
export class SelectTranslator {
	private readonly options: Options = {
		modifiers: ['ctrlKey'],
		detectedLangFirst: false,
		quickTranslate: false,
		strictSelection: false,
		rememberDirection: false,
		showOnceForSelection: true,
		isUseAutoForDetectLang: true,
		skipWhenSameAsUserLanguage: false,
		opacity: 0.95,
		themeMode: 'auto',
		enableTranslateFromContextMenu: false,
	};

	constructor(options?: Partial<Options>) {
		if (options !== undefined) {
			this.setOptions(options);
		}
	}

	/**
	 * Update options on a live instance without remounting the popup.
	 * Used when config/pageData changes while the translator is running
	 * (e.g. SW wake broadcasting the same appConfig, pageLanguage scan).
	 */
	public setOptions(options: Partial<Options>) {
		for (const key in options) {
			(this.options as any)[key] = (options as any)[key];
		}
	}

	/**
	 * Once the user engages the floating icon / card is translating, document-level
	 * `pointerdown` must not tear the popup down. LayerManager handles real
	 * outside clicks for the card; this flag also covers the first-engage race
	 * where a same-gesture or retargeted event would otherwise call hidePopup
	 * while the Loader is mounting (especially the first translation on a page
	 * when the service worker is cold).
	 */
	private suppressOutsidePointerClose = false;

	public setSuppressOutsidePointerClose = (suppress: boolean) => {
		this.suppressOutsidePointerClose = suppress;
	};

	// Flag which set while every selection event and reset while button shown
	private unhandledSelection = false;
	private selectionTarget: HTMLElement | null = null;
	private readonly selectionFlagUpdater = (evt: Event) => {
		this.unhandledSelection = true;
		this.selectionTarget = evt.target instanceof HTMLElement ? evt.target : null;
	};

	private readonly shadowRoot = new ShadowDOMContainerManager({
		styles: ['contentscript.css'],
	});

	public start() {
		if (this.shadowRoot.getRootNode() !== null) {
			throw new Error('Already started');
		}

		this.shadowRoot.createRootNode();
		const root = this.shadowRoot.getRootNode()!;

		// Add event listeners
		root.addEventListener('keydown', this.keyDown);
		document.addEventListener('selectionchange', this.selectionFlagUpdater);

		document.addEventListener('pointerdown', this.pointerDown);
		document.addEventListener('pointerup', this.pointerUp);

		document.addEventListener('touchstart', this.pointerDown);
		document.addEventListener('touchend', this.pointerUp);

		this.mountEmptyComponent();
	}

	public stop() {
		const root = this.shadowRoot.getRootNode();
		if (root === null) {
			throw new Error('Not started');
		}

		// Remove event listeners
		root.removeEventListener('keydown', this.keyDown);
		document.removeEventListener('selectionchange', this.selectionFlagUpdater);

		document.removeEventListener('pointerdown', this.pointerDown);
		document.removeEventListener('pointerup', this.pointerUp);

		document.removeEventListener('touchstart', this.pointerDown);
		document.removeEventListener('touchend', this.pointerUp);

		// Unmount component and remove root node
		this.shadowRoot.unmountComponent();
		this.shadowRoot.removeRootNode();
	}

	public isRun() {
		return this.shadowRoot.getRootNode() !== null;
	}

	public translateSelectedText = () => {
		this.hidePopup();

		this.getSelectedText().then((selection) => {
			let text: string | null = null;
			let selectedSelection: Selection | null = null;

			// TODO: #refactor move this logic to one method `getSelectedText(target?: Node)`
			if (selection !== null) {
				text = selection.text;
				selectedSelection = selection.selection;
			} else if (
				this.selectionTarget !== null &&
				(this.selectionTarget instanceof HTMLTextAreaElement ||
					this.selectionTarget instanceof HTMLInputElement)
			) {
				text = getSelectedTextOfInput(this.selectionTarget);
			}

			if (text !== null) {
				this.showPopup(
					text,
					this.resolveAnchorRect({
						selection: selectedSelection,
						fallbackElement: this.selectionTarget,
					}),
				);
			}
		});
	};

	private readonly getSelectedText = () =>
		new Promise<{ selection: Selection; text: string } | null>((res) => {
			const root = this.shadowRoot.getRootNode();

			this.context = Symbol('context');
			const context = this.context;

			// Get selected text in next frame
			requestAnimationFrame(() => {
				if (context !== this.context) {
					res(null);
					return;
				}
				this.context = Symbol('context');

				const selection = window.getSelection();

				// Skip empty selection
				if (selection === null) {
					res(null);
					return;
				}

				// Skip if selected a text inside root node
				if (
					root === null ||
					root.contains(selection.anchorNode) ||
					root.contains(selection.focusNode)
				)
					return;

				const selectedText = selection.toString();
				res(selectedText.length > 0 ? { selection, text: selectedText } : null);
			});
		});

	// Prevent handle keys by page. It important for search language on pages like youtube where F key can open fullscreen mode
	private readonly keyDown = (evt: KeyboardEvent) => {
		evt.stopImmediatePropagation();
	};

	/**
	 * True when the event originates inside our shadow host / root.
	 * Prefer composedPath so closed-shadow retargeting and nested hosts are covered.
	 */
	private readonly isEventInsideRoot = (evt: Event) => {
		const root = this.shadowRoot.getRootNode();
		if (root === null) return false;

		if (typeof evt.composedPath === 'function') {
			const path = evt.composedPath();
			if (path.includes(root)) return true;
			// react-shadow host is a child of root; path often ends at host for
			// retargeted events depending on browser / listener attachment.
			for (const node of path) {
				if (node instanceof Node && root.contains(node)) return true;
			}
		}

		return evt.target instanceof Node && root.contains(evt.target);
	};

	/**
	 * Close popup by click outside the root.
	 * Skipped while a translate session is engaged — LayerManager owns outside
	 * close for the card, and false positives here were killing the first Loader.
	 */
	private readonly pointerDown = (evt: PointerEvent | TouchEvent) => {
		if (this.isEventInsideRoot(evt)) return;
		if (this.suppressOutsidePointerClose) return;

		this.hidePopup();
	};

	private context = Symbol('context');

	private lastPointerPosition: { x: number; y: number } | null = null;

	/**
	 * Open popup by text selection on the page
	 */
	private readonly pointerUp = async (evt: PointerEvent | TouchEvent) => {
		await new Promise((res) => setTimeout(res, 10));

		const getIsTouchEvt = (evt: Event): evt is TouchEvent =>
			evt.type === 'touchstart' || evt.type === 'touchend';
		const isTouchEvt = getIsTouchEvt(evt);

		// Reject if press not left button or not just touch
		// Codes list: https://www.w3.org/TR/pointerevents1/#h5_chorded-button-interactions
		if (!isTouchEvt && evt.button !== 0) return;

		const { pageX, pageY } = isTouchEvt ? evt.changedTouches[0] : evt;
		this.lastPointerPosition = {
			x: pageX,
			y: pageY,
		};

		// Skip when enabled translation with context menu
		if (this.options.enableTranslateFromContextMenu) return;

		// Check modifier keys
		const requiredModifierKeys = this.options.modifiers;
		if (
			requiredModifierKeys.length > 0 &&
			!requiredModifierKeys.every((value) => evt[value])
		)
			return;

		const target = evt.target;
		const root = this.shadowRoot.getRootNode();

		// Skip events inside root node (icon / card clicks)
		if (root === null || this.isEventInsideRoot(evt)) return;

		this.getSelectedText().then((selectedTextObj) => {
			let text: string | null = null;
			let selectedSelection: Selection | null = null;

			if (selectedTextObj !== null) {
				// Use selected text on page
				text = selectedTextObj.text;
				selectedSelection = selectedTextObj.selection;

				const { selection } = selectedTextObj;

				// Skip when pointerdown not on the selected text
				if (this.options.strictSelection && selection.focusNode instanceof Text) {
					const parent = selection.focusNode.parentElement;
					if (parent !== null && parent !== target) return;
				}

				// Skip if it shown not first time
				if (this.options.showOnceForSelection && !this.unhandledSelection) return;
			} else if (
				this.selectionTarget !== null &&
				(this.selectionTarget instanceof HTMLTextAreaElement ||
					this.selectionTarget instanceof HTMLInputElement)
			) {
				// Use selected text in input
				text = getSelectedTextOfInput(this.selectionTarget);
			}

			if (text !== null) {
				this.showPopup(
					text,
					this.resolveAnchorRect({
						selection: selectedSelection,
						fallbackElement: this.selectionTarget,
						pointer: { x: pageX, y: pageY },
					}),
				);
			}
		});
	};

	/**
	 * Resolve a page-coordinate rect for the selection popup.
	 * Prefer selected range bounds (Google Translate style).
	 */
	private readonly resolveAnchorRect = ({
		selection,
		fallbackElement,
		pointer = this.lastPointerPosition,
	}: {
		selection?: Selection | null;
		fallbackElement?: HTMLElement | null;
		pointer?: { x: number; y: number } | null;
	}): AnchorRect =>
		getSelectionAnchorRect({
			selection,
			fallbackElement,
			pointer,
		});

	private readonly showPopup = async (text: string, anchorRect: AnchorRect) => {
		const trimmedText = text.trim();

		if (trimmedText.length === 0) return;

		const pageTitle = (typeof document !== 'undefined' ? document.title : '').trim();

		// Update selection value
		this.unhandledSelection = false;

		const {
			pageLanguage,
			quickTranslate,
			detectedLangFirst,
			isUseAutoForDetectLang,
			skipWhenSameAsUserLanguage,
			rememberDirection,
			zIndex,
			timeoutForHideButton,
			focusOnTranslateButton,
			opacity,
			themeMode,
			enableTranslateFromContextMenu,
		} = this.options;

		const isForceQuickTranslate = enableTranslateFromContextMenu;
		const immediateTranslate = isForceQuickTranslate || quickTranslate;

		// Optional skip: hide selection UI when text is already in "Your language".
		// Context-menu translate always shows.
		// Use best-effort detection (reliableOnly=false). Chrome often marks short
		// CJK selections as "unreliable" while still returning the correct top
		// language (e.g. zh); requiring isReliable made the toggle look broken.
		if (skipWhenSameAsUserLanguage && !isForceQuickTranslate) {
			try {
				const [userLanguage, detectedLanguage] = await Promise.all([
					getUserLanguagePreferences(),
					detectLanguage(trimmedText, false),
				]);

				const normalizeLang = (lang: string) => lang.toLowerCase().split('-')[0];
				if (
					detectedLanguage !== null &&
					normalizeLang(detectedLanguage) === normalizeLang(userLanguage)
				) {
					return;
				}
			} catch (reason) {
				// Detection / config failures must not block the popup.
				console.error(
					'[SelectTranslator] skipWhenSameAsUserLanguage check failed:',
					reason,
				);
			}
		}

		// Quick-translate opens the card immediately — suppress document
		// pointerdown hide for the whole session until the popup is closed.
		this.suppressOutsidePointerClose = immediateTranslate;

		const rootNode = this.shadowRoot.getRootNode();
		if (!rootNode) throw new Error('Root node is not found');

		// Convert page coords to root-relative coords so positioning stays
		// correct when the host node is shifted (e.g. body resize). See #529
		const rootPosition = getAbsolutePositionOfElement(rootNode);
		const fixedAnchor = {
			left: anchorRect.left - rootPosition.x,
			top: anchorRect.top - rootPosition.y,
			width: anchorRect.width,
			height: anchorRect.height,
		};

		this.shadowRoot.mountComponent(
			<TextTranslatorPopup
				closeHandler={this.hidePopup}
				onTranslateEngage={() => {
					this.setSuppressOutsidePointerClose(true);
				}}
				quickTranslate={immediateTranslate}
				pageTitle={pageTitle}
				themeMode={themeMode}
				{...{
					translate,
					pageLanguage,
					detectedLangFirst,
					isUseAutoForDetectLang,
					rememberDirection,
					zIndex,
					timeoutForHideButton,
					focusOnTranslateButton,
					opacity,
					text: trimmedText,
					anchor: fixedAnchor,
				}}
			/>,
		);
	};

	private readonly hidePopup = () => {
		this.suppressOutsidePointerClose = false;
		this.mountEmptyComponent();
	};

	private readonly mountEmptyComponent = () => {
		this.shadowRoot.mountComponent();
	};
}
