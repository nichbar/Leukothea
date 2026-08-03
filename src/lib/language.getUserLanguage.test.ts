import { afterEach, describe, expect, test, vi } from 'vitest';
import browser from 'webextension-polyfill';

import { getUserLanguage } from './language';

describe('getUserLanguage', () => {
	const originalLanguages = navigator.languages;
	const originalLanguage = navigator.language;

	afterEach(() => {
		Object.defineProperty(navigator, 'languages', {
			configurable: true,
			get: () => originalLanguages,
		});
		Object.defineProperty(navigator, 'language', {
			configurable: true,
			get: () => originalLanguage,
		});
		vi.restoreAllMocks();
	});

	test('prefers first valid entry from navigator.languages', () => {
		Object.defineProperty(navigator, 'languages', {
			configurable: true,
			get: () => ['zh-CN', 'en-US'],
		});
		Object.defineProperty(navigator, 'language', {
			configurable: true,
			get: () => 'en-US',
		});
		vi.spyOn(browser.i18n, 'getUILanguage').mockReturnValue('en-US');

		expect(getUserLanguage()).toBe('zh');
	});

	test('falls back to navigator.language when languages is empty', () => {
		Object.defineProperty(navigator, 'languages', {
			configurable: true,
			get: () => [],
		});
		Object.defineProperty(navigator, 'language', {
			configurable: true,
			get: () => 'ja-JP',
		});
		vi.spyOn(browser.i18n, 'getUILanguage').mockReturnValue('en');

		expect(getUserLanguage()).toBe('ja');
	});

	test('falls back to browser UI language', () => {
		Object.defineProperty(navigator, 'languages', {
			configurable: true,
			get: () => [],
		});
		Object.defineProperty(navigator, 'language', {
			configurable: true,
			get: () => '',
		});
		vi.spyOn(browser.i18n, 'getUILanguage').mockReturnValue('ko-KR');

		expect(getUserLanguage()).toBe('ko');
	});

	test('skips invalid tags and returns en as last resort', () => {
		Object.defineProperty(navigator, 'languages', {
			configurable: true,
			get: () => ['xx-YY', 'not-a-lang'],
		});
		Object.defineProperty(navigator, 'language', {
			configurable: true,
			get: () => 'also-bad',
		});
		vi.spyOn(browser.i18n, 'getUILanguage').mockReturnValue('nope');

		expect(getUserLanguage()).toBe('en');
	});
});
