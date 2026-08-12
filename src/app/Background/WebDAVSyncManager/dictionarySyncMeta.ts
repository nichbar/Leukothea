import browser from 'webextension-polyfill';

import { decodeStruct, type } from '../../../lib/types';

export const DICTIONARY_SYNC_META_KEY = 'dictionarySyncMeta';

export type DictionarySyncDirection = 'push' | 'pull' | 'none';

/** Manual recovery action the Options UI may offer after a failed dictionary sync. */
export type DictionarySyncRecovery = 'forcePushInvalidRemote';

export type DictionarySyncMeta = {
	lastLocalWriteAt: number;
	lastRemoteUpdatedAt: number;
	lastSyncAt: number | null;
	lastError: string | null;
	lastDirection: DictionarySyncDirection | null;
	/** Last known remote ETag for conditional PUT (null if unknown / unsupported). */
	lastRemoteEtag: string | null;
	/**
	 * When set, Options may offer a recovery action (e.g. force-push over a
	 * remote envelope that failed validation). Cleared on success and on
	 * non-recovery errors.
	 */
	recovery: DictionarySyncRecovery | null;
};

const DictionarySyncMetaCodec = type.type({
	lastLocalWriteAt: type.number,
	lastRemoteUpdatedAt: type.number,
	lastSyncAt: type.union([type.number, type.null]),
	lastError: type.union([type.string, type.null]),
	lastDirection: type.union([
		type.literal('push'),
		type.literal('pull'),
		type.literal('none'),
		type.null,
	]),
	lastRemoteEtag: type.union([type.string, type.null]),
	recovery: type.union([type.literal('forcePushInvalidRemote'), type.null]),
});

export const defaultDictionarySyncMeta = (): DictionarySyncMeta => ({
	lastLocalWriteAt: 0,
	lastRemoteUpdatedAt: 0,
	lastSyncAt: null,
	lastError: null,
	lastDirection: null,
	lastRemoteEtag: null,
	recovery: null,
});

export const getDictionarySyncMeta = async (): Promise<DictionarySyncMeta> => {
	const { [DICTIONARY_SYNC_META_KEY]: raw } = await browser.storage.local.get(
		DICTIONARY_SYNC_META_KEY,
	);

	if (raw === undefined) {
		return defaultDictionarySyncMeta();
	}

	const withDefaults =
		raw != null && typeof raw === 'object' && !Array.isArray(raw)
			? { ...defaultDictionarySyncMeta(), ...(raw as Record<string, unknown>) }
			: raw;

	const decoded = decodeStruct(DictionarySyncMetaCodec, withDefaults);
	if (decoded.errors !== null) {
		return defaultDictionarySyncMeta();
	}

	return decoded.data;
};

/**
 * Serialize read-modify-write updates (same race as configSyncMeta under delayed
 * storage mocks / overlapping reconcile writers).
 */
let dictionarySyncMetaWriteChain: Promise<unknown> = Promise.resolve();

export const setDictionarySyncMeta = async (
	meta: DictionarySyncMeta | Partial<DictionarySyncMeta>,
): Promise<DictionarySyncMeta> => {
	const run = async (): Promise<DictionarySyncMeta> => {
		const current = await getDictionarySyncMeta();
		const next: DictionarySyncMeta = {
			...current,
			...meta,
		};
		await browser.storage.local.set({ [DICTIONARY_SYNC_META_KEY]: next });
		return next;
	};

	const result = dictionarySyncMetaWriteChain.then(run, run);
	dictionarySyncMetaWriteChain = result.then(
		() => undefined,
		() => undefined,
	);
	return result;
};

export const bumpDictionaryLocalWriteAt = async (
	at: number = Date.now(),
): Promise<DictionarySyncMeta> => {
	return setDictionarySyncMeta({ lastLocalWriteAt: at });
};

/** Wait for queued meta writers (tests: drain before/after storage clear). */
export const flushDictionarySyncMetaWrites = async (): Promise<void> => {
	await dictionarySyncMetaWriteChain;
};
