import { afterEach, describe, expect, test, vi } from 'vitest';

import {
	authHeader,
	joinWebDAVUrl,
	parentCollectionPath,
	WebDAVClient,
	WebDAVPreconditionFailedError,
} from './WebDAVClient';

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

	test('uses plain btoa for Latin-1 credentials (same as original client)', () => {
		const header = authHeader('user', 'pass');
		expect(header).toBe(`Basic ${btoa('user:pass')}`);
	});

	test('encodes unicode password as UTF-8 when btoa rejects non-Latin-1', () => {
		// Characters outside Latin-1 make btoa throw in browsers.
		const header = authHeader('user', '密码');
		expect(header.startsWith('Basic ')).toBe(true);
		const binary = atob(header.slice('Basic '.length));
		const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
		expect(new TextDecoder().decode(bytes)).toBe('user:密码');
	});

	test('ensureParentCollections ignores MKCOL failures (existing collection)', async () => {
		const fetchMock = vi.fn(async () => {
			return new Response(null, { status: 401, statusText: 'Unauthorized' });
		});
		vi.stubGlobal('fetch', fetchMock);

		const client = new WebDAVClient({
			url: 'https://example.com/dav/files/user/',
			username: 'user',
			password: 'pass',
			path: 'linguist/linguist-config.json',
		});
		// Must not throw — PUT may still succeed when the collection already exists.
		await expect(client.ensureParentCollections()).resolves.toBeUndefined();
		expect(fetchMock).toHaveBeenCalled();
	});
});

describe('WebDAVClient conditional headers', () => {
	const credentials = {
		url: 'https://example.com/dav/files/user/',
		username: 'user',
		password: 'pass',
		path: 'linguist/linguist-config.json',
	};

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	test('get returns etag from response', async () => {
		const fetchMock = vi.fn(async () => {
			return new Response('{}', {
				status: 200,
				headers: { ETag: '"abc123"' },
			});
		});
		vi.stubGlobal('fetch', fetchMock);

		const client = new WebDAVClient(credentials);
		const result = await client.get();
		expect(result.status).toBe(200);
		expect(result.etag).toBe('"abc123"');
	});

	test('put sends If-Match when provided', async () => {
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			if (init?.method === 'MKCOL') {
				return new Response(null, { status: 201 });
			}
			return new Response(null, {
				status: 204,
				headers: { ETag: '"new"' },
			});
		});
		vi.stubGlobal('fetch', fetchMock);

		const client = new WebDAVClient(credentials);
		const result = await client.put('{"ok":true}', { ifMatch: '"old"' });
		expect(result.etag).toBe('"new"');

		const putCall = fetchMock.mock.calls.find(
			(call) => (call[1] as RequestInit | undefined)?.method === 'PUT',
		);
		expect(putCall).toBeDefined();
		const headers = (putCall?.[1] as RequestInit).headers as Record<string, string>;
		expect(headers['If-Match']).toBe('"old"');
	});

	test('put createOnly sends If-None-Match: *', async () => {
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			if (init?.method === 'MKCOL') {
				return new Response(null, { status: 201 });
			}
			return new Response(null, { status: 201, headers: { ETag: '"created"' } });
		});
		vi.stubGlobal('fetch', fetchMock);

		const client = new WebDAVClient(credentials);
		await client.put('{}', { createOnly: true });

		const putCall = fetchMock.mock.calls.find(
			(call) => (call[1] as RequestInit | undefined)?.method === 'PUT',
		);
		const headers = (putCall?.[1] as RequestInit).headers as Record<string, string>;
		expect(headers['If-None-Match']).toBe('*');
	});

	test('put throws WebDAVPreconditionFailedError on 412', async () => {
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			if (init?.method === 'MKCOL') {
				return new Response(null, { status: 201 });
			}
			return new Response(null, { status: 412, statusText: 'Precondition Failed' });
		});
		vi.stubGlobal('fetch', fetchMock);

		const client = new WebDAVClient(credentials);
		await expect(client.put('{}', { ifMatch: '"stale"' })).rejects.toBeInstanceOf(
			WebDAVPreconditionFailedError,
		);
	});
});
