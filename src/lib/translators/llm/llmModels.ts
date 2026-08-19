/**
 * Derive an OpenAI-compatible POST /chat/completions URL from a user-provided apiUrl.
 * If the URL already ends with /chat/completions, it is returned (normalized).
 * If the URL ends with /v1 (or root / other prefix), /chat/completions is appended.
 * If the URL ends with /completions or /models, it is replaced with /chat/completions.
 * Returns the original string if it cannot be parsed as a valid URL.
 */
export const deriveChatCompletionsUrl = (apiUrl: string): string => {
	const trimmed = apiUrl.trim();
	if (!trimmed) return apiUrl;

	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		return apiUrl;
	}

	const pathname = url.pathname.replace(/\/+$/, '') || '/';
	const lowerPath = pathname.toLowerCase();

	if (lowerPath.endsWith('/chat/completions')) {
		url.pathname = pathname;
	} else if (lowerPath.endsWith('/completions')) {
		url.pathname = pathname.slice(0, -'/completions'.length) + '/chat/completions';
	} else if (lowerPath.endsWith('/models')) {
		url.pathname = pathname.slice(0, -'/models'.length) + '/chat/completions';
	} else {
		url.pathname =
			pathname === '/' ? '/chat/completions' : `${pathname}/chat/completions`;
	}

	return url.toString();
};

/**
 * Derive an OpenAI-compatible GET /models URL from a chat-completions apiUrl.
 * Returns null when the input cannot be parsed as a valid URL.
 */
export const deriveModelsUrl = (apiUrl: string): string | null => {
	const trimmed = apiUrl.trim();
	if (!trimmed) return null;

	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		return null;
	}

	// Normalize trailing slash for path matching, preserve original structure when rewriting.
	const pathname = url.pathname.replace(/\/+$/, '') || '/';
	const lowerPath = pathname.toLowerCase();

	if (lowerPath.endsWith('/chat/completions')) {
		url.pathname = pathname.slice(0, -'/chat/completions'.length) + '/models';
	} else if (lowerPath.endsWith('/completions')) {
		url.pathname = pathname.slice(0, -'/completions'.length) + '/models';
	} else if (lowerPath.endsWith('/models')) {
		url.pathname = pathname;
	} else {
		url.pathname = pathname === '/' ? '/models' : `${pathname}/models`;
	}

	// Models list endpoints do not use chat-completions query params.
	url.search = '';
	url.hash = '';

	return url.toString();
};

/**
 * Parse OpenAI-style `{ data: [{ id: string }, ...] }` model list responses.
 * Returns a unique, sorted list of non-empty string ids, or [] on unexpected shape.
 */
export const parseOpenAIModelsResponse = (data: unknown): string[] => {
	if (data === null || typeof data !== 'object') return [];

	const record = data as Record<string, unknown>;
	if (!Array.isArray(record.data)) return [];

	const ids = new Set<string>();
	for (const item of record.data) {
		if (item === null || typeof item !== 'object') continue;
		const id = (item as Record<string, unknown>).id;
		if (typeof id === 'string') {
			const trimmed = id.trim();
			if (trimmed.length > 0) {
				ids.add(trimmed);
			}
		}
	}

	return Array.from(ids).sort((a, b) => a.localeCompare(b));
};
