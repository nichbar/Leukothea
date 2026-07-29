import { describe, expect, test } from 'vitest';

import { authHeader, joinWebDAVUrl, parentCollectionPath } from './WebDAVClient';

describe('joinWebDAVUrl', () => {
	test('joins relative path to base with trailing slash', () => {
		expect(
			joinWebDAVUrl(
				'https://example.com/dav/files/user/',
				'linguist/linguist-config.json',
			),
		).toBe('https://example.com/dav/files/user/linguist/linguist-config.json');
	});

	test('joins when base lacks trailing slash', () => {
		expect(
			joinWebDAVUrl(
				'https://example.com/dav/files/user',
				'linguist/linguist-config.json',
			),
		).toBe('https://example.com/dav/files/user/linguist/linguist-config.json');
	});

	test('absolute http path is used as-is', () => {
		expect(
			joinWebDAVUrl('https://example.com/dav/', 'https://other.example/file.json'),
		).toBe('https://other.example/file.json');
	});
});

describe('parentCollectionPath', () => {
	test('returns parent folder for nested path', () => {
		expect(parentCollectionPath('linguist/linguist-config.json')).toBe('linguist');
		expect(parentCollectionPath('a/b/c.json')).toBe('a/b');
	});

	test('returns null for top-level file', () => {
		expect(parentCollectionPath('linguist-config.json')).toBeNull();
	});
});

describe('authHeader', () => {
	test('builds basic auth', () => {
		const header = authHeader('user', 'pass');
		expect(header.startsWith('Basic ')).toBe(true);
		expect(atob(header.slice('Basic '.length))).toBe('user:pass');
	});
});
