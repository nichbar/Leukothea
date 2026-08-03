export type WebDAVCredentials = {
	url: string;
	username: string;
	password: string;
	path: string;
};

export type WebDAVGetResult = {
	status: number;
	bodyText: string;
	etag: string | null;
};

export type WebDAVPutResult = {
	etag: string | null;
};

export type WebDAVPutOptions = {
	/**
	 * When set, send If-Match for update-in-place.
	 * When null and `createOnly` is true, send If-None-Match: *.
	 */
	ifMatch?: string | null;
	/** Prefer create-only semantics (If-None-Match: *). */
	createOnly?: boolean;
	contentType?: string;
};

/** Thrown when the server rejects a conditional write (HTTP 412). */
export class WebDAVPreconditionFailedError extends Error {
	readonly status = 412;

	constructor(message = 'WebDAV PUT failed: 412 Precondition Failed') {
		super(message);
		this.name = 'WebDAVPreconditionFailedError';
	}
}

const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

/**
 * Join base WebDAV collection URL with a relative (or absolute) file path.
 */
export const joinWebDAVUrl = (baseUrl: string, path: string): string => {
	const trimmedPath = path.trim();
	if (trimmedPath === '') {
		throw new Error('WebDAV path is empty');
	}
	if (/^https?:\/\//i.test(trimmedPath)) {
		return trimmedPath;
	}

	const base = baseUrl.trim();
	if (base === '') {
		throw new Error('WebDAV URL is empty');
	}

	// Absolute path on same origin when path starts with /
	if (trimmedPath.startsWith('/')) {
		const u = new URL(base);
		u.pathname = trimmedPath;
		return u.toString();
	}

	const withSlash = base.endsWith('/') ? base : `${base}/`;
	return new URL(trimmedPath, withSlash).toString();
};

/**
 * Parent collection path for a relative file path (e.g. "linguist/config.json" → "linguist").
 * Returns null when the file sits directly under the base URL.
 */
export const parentCollectionPath = (filePath: string): string | null => {
	const trimmed = filePath.trim().replace(/^\/+|\/+$/g, '');
	const idx = trimmed.lastIndexOf('/');
	if (idx <= 0) return null;
	return trimmed.slice(0, idx);
};

/**
 * Build a Basic auth header.
 * Prefer native btoa for Latin-1 (identical to pre-regression clients / most app passwords).
 * Fall back to UTF-8 bytes when btoa throws on non-Latin-1 characters.
 */
export const authHeader = (username: string, password: string): string => {
	const credentials = `${username}:${password}`;
	try {
		// btoa is available in extension service workers / browsers
		return `Basic ${btoa(credentials)}`;
	} catch {
		// Non-Latin-1 password/username — encode as UTF-8 then base64.
		const bytes = new TextEncoder().encode(credentials);
		let binary = '';
		for (let i = 0; i < bytes.length; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return `Basic ${btoa(binary)}`;
	}
};

/** Map common auth failures to a clearer message. */
export const formatWebDAVHttpError = (
	method: string,
	status: number,
	statusText: string,
): string => {
	const base = `WebDAV ${method} failed: ${status} ${statusText || ''}`.trim();
	if (status === 401) {
		return `${base}. Check username/password (or app password) for write access.`;
	}
	if (status === 403) {
		return `${base}. Authenticated but not allowed to ${method} this path.`;
	}
	return base;
};

const readEtag = (response: Response): string | null => {
	const etag = response.headers.get('ETag') ?? response.headers.get('etag');
	if (etag == null || etag.trim() === '') return null;
	return etag.trim();
};

/**
 * Minimal WebDAV client (GET/PUT/MKCOL + Basic auth) via fetch — no extra dependency.
 */
export class WebDAVClient {
	private readonly credentials: WebDAVCredentials;
	private readonly fetchTimeoutMs: number;

	constructor(credentials: WebDAVCredentials, options?: { fetchTimeoutMs?: number }) {
		// Trim — paste from password managers often includes trailing newlines.
		this.credentials = {
			url: credentials.url.trim(),
			username: credentials.username.trim(),
			password: credentials.password, // do not trim middle spaces; only strip CR/LF ends
			path: credentials.path.trim(),
		};
		// Strip only trailing CR/LF that paste can introduce, keep intentional spaces.
		this.credentials.password = this.credentials.password.replace(/[\r\n]+$/g, '');
		this.fetchTimeoutMs = options?.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
	}

	public resolveFileUrl(): string {
		return joinWebDAVUrl(this.credentials.url, this.credentials.path);
	}

	private headers(extra?: Record<string, string>): Record<string, string> {
		const headers: Record<string, string> = {
			...extra,
		};
		if (this.credentials.username !== '' || this.credentials.password !== '') {
			headers.Authorization = authHeader(
				this.credentials.username,
				this.credentials.password,
			);
		}
		return headers;
	}

	private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.fetchTimeoutMs);
		try {
			return await fetch(url, {
				...init,
				signal: controller.signal,
			});
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				throw new Error(
					`WebDAV request timed out after ${this.fetchTimeoutMs}ms`,
				);
			}
			throw error;
		} finally {
			clearTimeout(timer);
		}
	}

	/**
	 * GET remote file. 404 is returned as status (not thrown).
	 */
	public async get(): Promise<WebDAVGetResult> {
		const response = await this.fetchWithTimeout(this.resolveFileUrl(), {
			method: 'GET',
			headers: this.headers(),
		});
		const bodyText = await response.text();
		return {
			status: response.status,
			bodyText,
			etag: readEtag(response),
		};
	}

	/**
	 * Create a collection (directory). Treats 201 and 405/409 (already exists) as success.
	 */
	public async mkcol(relativeCollectionPath: string): Promise<void> {
		const url = joinWebDAVUrl(this.credentials.url, relativeCollectionPath);
		// MKCOL expects the collection URL; trailing slash helps some servers
		const collectionUrl = url.endsWith('/') ? url : `${url}/`;
		const response = await this.fetchWithTimeout(collectionUrl, {
			method: 'MKCOL',
			headers: this.headers(),
		});
		// 201 Created; 405 Method Not Allowed / 409 Conflict often mean collection exists
		if (
			response.ok ||
			response.status === 405 ||
			response.status === 409 ||
			response.status === 301 ||
			response.status === 302
		) {
			return;
		}
		throw new Error(
			formatWebDAVHttpError('MKCOL', response.status, response.statusText),
		);
	}

	/**
	 * Ensure parent folders for the configured file path exist (creates each segment).
	 *
	 * MKCOL failures are ignored: many servers return 401/403/405 for collections
	 * that already exist or when MKCOL is not allowed, while PUT to the file still
	 * works. Real missing-parent errors surface on the subsequent PUT.
	 */
	public async ensureParentCollections(): Promise<void> {
		const parent = parentCollectionPath(this.credentials.path);
		if (parent == null) return;

		const segments = parent.split('/').filter(Boolean);
		let built = '';
		for (const segment of segments) {
			built = built ? `${built}/${segment}` : segment;
			try {
				await this.mkcol(built);
			} catch {
				// Ignore — PUT will fail clearly if the parent is truly missing.
			}
		}
	}

	/**
	 * PUT remote file body. Ensures parent collections first.
	 * Throws WebDAVPreconditionFailedError on 412; other non-2xx as Error.
	 */
	public async put(
		body: string,
		options: WebDAVPutOptions = {},
	): Promise<WebDAVPutResult> {
		await this.ensureParentCollections();

		const contentType = options.contentType ?? 'application/json';
		const extra: Record<string, string> = {
			'Content-Type': contentType,
		};

		if (options.createOnly) {
			extra['If-None-Match'] = '*';
		} else if (options.ifMatch != null && options.ifMatch !== '') {
			extra['If-Match'] = options.ifMatch;
		}

		const response = await this.fetchWithTimeout(this.resolveFileUrl(), {
			method: 'PUT',
			headers: this.headers(extra),
			body,
		});

		if (response.status === 412) {
			throw new WebDAVPreconditionFailedError(
				`WebDAV PUT failed: ${response.status} ${response.statusText || 'Precondition Failed'}`.trim(),
			);
		}

		if (!response.ok) {
			throw new Error(
				formatWebDAVHttpError('PUT', response.status, response.statusText),
			);
		}

		return { etag: readEtag(response) };
	}
}

/** Narrow surface used by WebDAVSyncManager (for tests / injection). */
export type WebDAVClientLike = Pick<
	WebDAVClient,
	'get' | 'put' | 'resolveFileUrl' | 'ensureParentCollections'
>;
