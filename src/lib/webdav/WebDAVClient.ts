export type WebDAVCredentials = {
	url: string;
	username: string;
	password: string;
	path: string;
};

export type WebDAVGetResult = {
	status: number;
	bodyText: string;
};

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

export const authHeader = (username: string, password: string): string => {
	// btoa is available in extension service workers / browsers
	const token = btoa(`${username}:${password}`);
	return `Basic ${token}`;
};

/**
 * Minimal WebDAV client (GET/PUT/MKCOL + Basic auth) via fetch — no extra dependency.
 */
export class WebDAVClient {
	private readonly credentials: WebDAVCredentials;

	constructor(credentials: WebDAVCredentials) {
		this.credentials = credentials;
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

	/**
	 * GET remote file. 404 is returned as status (not thrown).
	 */
	public async get(): Promise<WebDAVGetResult> {
		const response = await fetch(this.resolveFileUrl(), {
			method: 'GET',
			headers: this.headers(),
		});
		const bodyText = await response.text();
		return {
			status: response.status,
			bodyText,
		};
	}

	/**
	 * Create a collection (directory). Treats 201 and 405/409 (already exists) as success.
	 */
	public async mkcol(relativeCollectionPath: string): Promise<void> {
		const url = joinWebDAVUrl(this.credentials.url, relativeCollectionPath);
		// MKCOL expects the collection URL; trailing slash helps some servers
		const collectionUrl = url.endsWith('/') ? url : `${url}/`;
		const response = await fetch(collectionUrl, {
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
		const statusText = response.statusText || 'Request failed';
		throw new Error(`WebDAV MKCOL failed: ${response.status} ${statusText}`.trim());
	}

	/**
	 * Ensure parent folders for the configured file path exist (creates each segment).
	 */
	public async ensureParentCollections(): Promise<void> {
		const parent = parentCollectionPath(this.credentials.path);
		if (parent == null) return;

		const segments = parent.split('/').filter(Boolean);
		let built = '';
		for (const segment of segments) {
			built = built ? `${built}/${segment}` : segment;
			await this.mkcol(built);
		}
	}

	/**
	 * PUT remote file body. Ensures parent collections first. Throws on non-2xx.
	 */
	public async put(body: string, contentType = 'application/json'): Promise<void> {
		await this.ensureParentCollections();

		const response = await fetch(this.resolveFileUrl(), {
			method: 'PUT',
			headers: this.headers({
				'Content-Type': contentType,
			}),
			body,
		});
		if (!response.ok) {
			const statusText = response.statusText || 'Request failed';
			throw new Error(`WebDAV PUT failed: ${response.status} ${statusText}`.trim());
		}
	}
}
