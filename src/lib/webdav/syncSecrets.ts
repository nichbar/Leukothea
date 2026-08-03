import { AppConfigType } from '../../types/runtime';

/**
 * Deep-clone AppConfig for sync transforms (config is JSON-safe).
 */
export const cloneAppConfig = (config: AppConfigType): AppConfigType =>
	JSON.parse(JSON.stringify(config)) as AppConfigType;

/**
 * Optional secrets that leave the device only when sync.webdav.syncSecrets is true.
 * WebDAV connection fields are never in this list — they are always local-only.
 */
export const SYNC_SECRET_FIELDS = ['llmTranslator.apiKey'] as const;

/** Connection credentials for this device's WebDAV endpoint — never synced. */
export const LOCAL_ONLY_WEBDAV_FIELDS = [
	'sync.webdav.url',
	'sync.webdav.username',
	'sync.webdav.password',
] as const;

const applyLocalOnlyWebdavConnection = (
	target: AppConfigType,
	source: AppConfigType,
): void => {
	// Connection endpoint + login are per-device / per-account.
	target.sync.webdav.url = source.sync.webdav.url;
	target.sync.webdav.username = source.sync.webdav.username;
	target.sync.webdav.password = source.sync.webdav.password;
};

const clearWebdavConnection = (config: AppConfigType): void => {
	config.sync.webdav.url = '';
	config.sync.webdav.username = '';
	config.sync.webdav.password = '';
};

/**
 * Build the config blob to PUT.
 *
 * Always:
 * - WebDAV url / username / password are cleared (local-only; never uploaded).
 *
 * When syncSecrets is false:
 * - LLM API key is taken from `remote` when present so a preferences-only push
 *   does not wipe a key already on the server; otherwise empty string.
 *
 * When syncSecrets is true:
 * - LLM API key is the local value.
 */
export const prepareConfigForPush = (
	local: AppConfigType,
	remote: AppConfigType | null,
): AppConfigType => {
	const next = cloneAppConfig(local);

	// Never upload this device's WebDAV login.
	clearWebdavConnection(next);

	if (!local.sync.webdav.syncSecrets) {
		next.llmTranslator.apiKey = remote != null ? remote.llmTranslator.apiKey : '';
	}

	return next;
};

/**
 * Merge a validated remote config into local storage.
 *
 * Always:
 * - Keep local WebDAV url / username / password (local-only).
 * - Keep local syncSecrets (per-device policy; never adopted from remote).
 *
 * When local syncSecrets is off:
 * - Keep local LLM API key.
 *
 * When local syncSecrets is on:
 * - Accept remote LLM API key.
 */
export const mergeRemoteConfig = (
	remote: AppConfigType,
	local: AppConfigType,
): AppConfigType => {
	const next = cloneAppConfig(remote);

	// Device-local policy and connection credentials.
	next.sync.webdav.syncSecrets = local.sync.webdav.syncSecrets;
	applyLocalOnlyWebdavConnection(next, local);

	if (!local.sync.webdav.syncSecrets) {
		next.llmTranslator.apiKey = local.llmTranslator.apiKey;
	}

	return next;
};
