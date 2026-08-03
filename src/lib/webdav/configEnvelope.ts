import { AppConfig, AppConfigType } from '../../types/runtime';

import { compareSemver } from '../semver';
import { decodeStruct } from '../types';

export const CONFIG_ENVELOPE_VERSION = 1;

export type ConfigEnvelope = {
	version: number;
	updatedAt: number;
	extensionVersion: string;
	config: AppConfigType;
};

export type SyncAction =
	| 'push'
	| 'pull'
	| 'noop'
	| 'skipPushOlderExtension'
	| 'skipIncompatibleRemote';

export type DecideSyncActionInput = {
	localWriteAt: number;
	remoteUpdatedAt: number | null;
	localExt: string;
	remoteExt: string | null | undefined;
	/** When remote exists but AppConfig failed to decode */
	remoteConfigValid?: boolean;
	/** No remote file (404) */
	remoteMissing?: boolean;
};

/**
 * Serialize AppConfig into the remote envelope JSON string.
 */
export const serializeEnvelope = (
	config: AppConfigType,
	updatedAt: number,
	extensionVersion: string,
): string => {
	const envelope: ConfigEnvelope = {
		version: CONFIG_ENVELOPE_VERSION,
		updatedAt,
		extensionVersion,
		config,
	};
	return JSON.stringify(envelope);
};

export type ParseEnvelopeResult =
	| { ok: true; envelope: ConfigEnvelope }
	| { ok: false; error: string; extensionVersion?: string; updatedAt?: number };

/**
 * Fill fields introduced after older remotes were written so strict AppConfig
 * decode still accepts them (e.g. sync.webdav.syncSecrets).
 */
const normalizeRemoteConfigShape = (config: unknown): unknown => {
	if (config == null || typeof config !== 'object' || Array.isArray(config)) {
		return config;
	}

	const cfg = { ...(config as Record<string, unknown>) };
	const syncRaw = cfg.sync;
	if (syncRaw != null && typeof syncRaw === 'object' && !Array.isArray(syncRaw)) {
		const sync = { ...(syncRaw as Record<string, unknown>) };
		const webdavRaw = sync.webdav;
		if (
			webdavRaw != null &&
			typeof webdavRaw === 'object' &&
			!Array.isArray(webdavRaw)
		) {
			const webdav = { ...(webdavRaw as Record<string, unknown>) };
			if (typeof webdav.syncSecrets !== 'boolean') {
				webdav.syncSecrets = false;
			}
			sync.webdav = webdav;
		}
		cfg.sync = sync;
	}
	return cfg;
};

/**
 * Parse remote envelope text and validate nested AppConfig with io-ts.
 */
export const parseEnvelope = (text: string): ParseEnvelopeResult => {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return { ok: false, error: 'Remote file is not valid JSON' };
	}

	if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
		return { ok: false, error: 'Remote envelope must be an object' };
	}

	const obj = raw as Record<string, unknown>;
	const version = obj.version;
	const updatedAt = obj.updatedAt;
	const extensionVersion =
		typeof obj.extensionVersion === 'string' ? obj.extensionVersion : undefined;

	if (typeof version !== 'number' || !Number.isFinite(version)) {
		return {
			ok: false,
			error: 'Remote envelope missing numeric version',
			extensionVersion,
		};
	}

	if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) {
		return {
			ok: false,
			error: 'Remote envelope missing numeric updatedAt',
			extensionVersion,
		};
	}

	if (!('config' in obj)) {
		return {
			ok: false,
			error: 'Remote envelope missing config',
			extensionVersion,
			updatedAt,
		};
	}

	const decoded = decodeStruct(AppConfig, normalizeRemoteConfigShape(obj.config));
	if (decoded.errors !== null) {
		return {
			ok: false,
			error: 'Remote config failed AppConfig validation',
			extensionVersion,
			updatedAt,
		};
	}

	return {
		ok: true,
		envelope: {
			version,
			updatedAt,
			extensionVersion: extensionVersion ?? '0.0.0',
			config: decoded.data,
		},
	};
};

/**
 * Decide push/pull/noop given LWW timestamps and extension-version gate.
 *
 * Rules (see plan):
 * - remote missing → push (create)
 * - localExt < remoteExt → never push; may pull if remote newer and valid
 * - equal / local newer ext → LWW on updatedAt
 * - invalid remote config → skipIncompatibleRemote (no push over it)
 */
export const decideSyncAction = ({
	localWriteAt,
	remoteUpdatedAt,
	localExt,
	remoteExt,
	remoteConfigValid = true,
	remoteMissing = false,
}: DecideSyncActionInput): SyncAction => {
	if (remoteMissing || remoteUpdatedAt == null) {
		return 'push';
	}

	const remoteVersion = remoteExt ?? '0.0.0';
	const cmp = compareSemver(localExt, remoteVersion);

	// Older local extension must never stomp a newer writer's remote.
	if (cmp < 0) {
		if (remoteConfigValid && remoteUpdatedAt > localWriteAt) {
			return 'pull';
		}
		return 'skipPushOlderExtension';
	}

	if (!remoteConfigValid) {
		return 'skipIncompatibleRemote';
	}

	// LWW on updatedAt for same or newer local extension
	if (localWriteAt > remoteUpdatedAt) {
		return 'push';
	}
	if (remoteUpdatedAt > localWriteAt) {
		return 'pull';
	}
	return 'noop';
};
