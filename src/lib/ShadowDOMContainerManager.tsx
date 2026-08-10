import React from 'react';
import ReactDOM from 'react-dom';
import root from 'react-shadow';
import browser from 'webextension-polyfill';

// Set position explicitly
const rootContainerStyles = {
	all: 'unset',
	position: 'absolute',
	top: 0,
	left: 0,
} satisfies React.CSSProperties;

/**
 * Shadow DOM container manager
 */
export class ShadowDOMContainerManager {
	private root: HTMLElement | null = null;

	private readonly styles: string[];

	/** Paths that finished loading (or failed) for the current style set. */
	private readonly loadedStyles = new Set<string>();

	/** Once true, never hide the host for style loading again. */
	private stylesReady = false;

	constructor(options?: { styles?: string[] }) {
		const { styles } = options ?? {};
		this.styles = styles ?? [];
		// No external CSS → nothing to wait for.
		if (this.styles.length === 0) {
			this.stylesReady = true;
		}
	}

	public createRootNode() {
		// Skip
		if (this.root !== null) return this.root;

		// Create and insert root node
		this.root = document.createElement('div');
		document.body.appendChild(this.root);

		// Reset all styles
		for (const style of Object.entries(rootContainerStyles)) {
			const [name, value] = style;
			this.root.style.setProperty(name, String(value));
		}

		return this.root;
	}

	public removeRootNode() {
		// Skip
		if (this.root === null) return;

		this.root.remove();
		this.root = null;
		this.loadedStyles.clear();
		// Keep stylesReady if styles were already loaded once in this manager lifetime
		// so a recreate after accidental DOM wipe does not flash unstyled content again
		// with cached CSS.
	}

	public getRootNode() {
		return this.root;
	}

	/**
	 * Mount stylesheet shell only so the first real UI paint is not unstyled.
	 * Safe to call after createRootNode(); no-op when there are no styles.
	 */
	public preloadStyles = () => {
		if (this.styles.length === 0 || this.stylesReady) return;
		this.mountComponent();
	};

	public mountComponent = (child?: React.ReactNode) => {
		// Skip when root node is not exist
		if (this.root === null) return;

		// #123 attach root node again on the page, for cases when whole DOM been replaced
		if (!document.body.contains(this.root)) {
			document.body.appendChild(this.root);
		}

		// Hide host until CSS is ready so unstyled popup content does not flash top-left.
		if (!this.stylesReady && child !== undefined && child !== null) {
			this.root.style.visibility = 'hidden';
		}

		ReactDOM.render(
			<root.div style={{ ...rootContainerStyles }} mode="closed">
				{/* Include styles and scripts */}
				{this.styles.map((path) => (
					<link
						key={path}
						rel="stylesheet"
						href={browser.runtime.getURL(path)}
						ref={this.bindStyleLink(path)}
					/>
				))}
				{child}
			</root.div>,
			this.root,
		);

		// Empty mount with no styles.
		if (this.styles.length === 0) {
			this.markStylesReady();
		}
	};

	public unmountComponent = () => {
		if (this.root !== null) {
			ReactDOM.unmountComponentAtNode(this.root);
		}
	};

	/**
	 * Attach load/error listeners via ref so cached stylesheets that skip a late
	 * onLoad still mark ready (link.sheet is non-null once applied).
	 */
	private readonly bindStyleLink = (path: string) => (el: HTMLLinkElement | null) => {
		if (el === null) return;
		if (el.dataset.styleSettled === '1') return;

		const settle = () => {
			if (el.dataset.styleSettled === '1') return;
			el.dataset.styleSettled = '1';
			this.onStyleSettled(path);
		};

		el.addEventListener('load', settle, { once: true });
		el.addEventListener('error', settle, { once: true });

		// Already applied from cache (common after preload / second open).
		if (el.sheet !== null) {
			settle();
			return;
		}

		// Never leave the host hidden forever if load events are swallowed.
		window.setTimeout(settle, 2000);
	};

	private readonly onStyleSettled = (path: string) => {
		this.loadedStyles.add(path);
		if (this.styles.every((stylePath) => this.loadedStyles.has(stylePath))) {
			this.markStylesReady();
		}
	};

	private markStylesReady() {
		if (this.stylesReady && this.root?.style.visibility !== 'hidden') return;
		this.stylesReady = true;
		if (this.root !== null) {
			this.root.style.visibility = '';
		}
	}
}
