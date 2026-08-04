import { describe, expect, test } from 'vitest';

import { getThemeByMode, isThemeMode, resolveIsLightTheme } from '../themeMode';

describe('themeMode helpers', () => {
	test('isThemeMode accepts only light/dark/auto', () => {
		expect(isThemeMode('light')).toBe(true);
		expect(isThemeMode('dark')).toBe(true);
		expect(isThemeMode('auto')).toBe(true);
		expect(isThemeMode('system')).toBe(false);
		expect(isThemeMode(null)).toBe(false);
	});

	test('resolveIsLightTheme respects fixed modes', () => {
		expect(resolveIsLightTheme('light')).toBe(true);
		expect(resolveIsLightTheme('dark')).toBe(false);
	});

	test('resolveIsLightTheme auto uses system preference when provided', () => {
		expect(resolveIsLightTheme('auto', true)).toBe(true);
		expect(resolveIsLightTheme('auto', false)).toBe(false);
	});

	test('getThemeByMode returns matching color modifier', () => {
		expect(getThemeByMode('light').color).toBe('default');
		expect(getThemeByMode('dark').color).toBe('dark');
		expect(getThemeByMode('auto', false).color).toBe('dark');
		expect(getThemeByMode('auto', true).color).toBe('default');
	});
});
