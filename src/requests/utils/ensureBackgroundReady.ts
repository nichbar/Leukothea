import { sendBackgroundRequest } from ".";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Wait until the background service worker answers `ping`.
 *
 * MV3 workers can accept messages while still running startup (migrations,
 * handler registration). Those early calls resolve to `undefined` with no
 * error — callers then fail io-ts response validation. Use this before
 * retrying validated backend requests.
 *
 * Uses the raw messenger (not `ping()` / `buildBackendRequest`) to avoid
 * recursive retry loops.
 */
export const ensureBackgroundReady = async (
	timeoutMs = 2000,
	delayMs = 50,
): Promise<boolean> => {
	const startedAt = Date.now();

	while (Date.now() - startedAt < timeoutMs) {
		try {
			const response = await sendBackgroundRequest('ping');
			if (response === 'pong') {
				return true;
			}
		} catch {
			// SW still waking / not listening — keep trying until timeout.
		}

		await sleep(delayMs);
	}

	return false;
};

/**
 * Whether a backend response should be treated as "no handler answered".
 * Chromium resolves `runtime.sendMessage` with `undefined` when the SW has
 * no matching listener yet (or the port closed during startup).
 */
export const isMissingBackgroundResponse = (response: unknown): boolean =>
	response === undefined;
