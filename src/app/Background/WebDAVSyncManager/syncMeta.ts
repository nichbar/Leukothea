import browser from 'webextension-polyfill';

import { decodeStruct, type } from '../../../lib/types';

export const CONFIG_SYNC_META_KEY = 'configSyncMeta';

export type ConfigSyncDirection = 'push' | 'pull' | 'none';

export type ConfigSyncMeta = {
	lastLocalWriteAt: number;
	lastRemoteUpdatedAt: number;
	lastSyncAt: number | null;
	lastError: string | null;
	lastDirection: ConfigSyncDirection | null;
};

const ConfigSyncMetaCodec = type.type({
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
});

export const defaultConfigSyncMeta = (): ConfigSyncMeta => ({
	lastLocalWriteAt: 0,
	lastRemoteUpdatedAt: 0,
	lastSyncAt: null,
	lastError: null,
	lastDirection: null,
});

export const getConfigSyncMeta = async (): Promise<ConfigSyncMeta> => {
	const { [CONFIG_SYNC_META_KEY]: raw } =
		await browser.storage.local.get(CONFIG_SYNC_META_KEY);

	if (raw === undefined) {
		return defaultConfigSyncMeta();
	}

	const decoded = decodeStruct(ConfigSyncMetaCodec, raw);
	if (decoded.errors !== null) {
		return defaultConfigSyncMeta();
	}

	return decoded.data;
};

export const setConfigSyncMeta = async (
	meta: ConfigSyncMeta | Partial<ConfigSyncMeta>,
): Promise<ConfigSyncMeta> => {
	const current = await getConfigSyncMeta();
	const next: ConfigSyncMeta = {
		...current,
		...meta,
	};
	await browser.storage.local.set({ [CONFIG_SYNC_META_KEY]: next });
	return next;
};

export const bumpLocalWriteAt = async (
	at: number = Date.now(),
): Promise<ConfigSyncMeta> => {
	return setConfigSyncMeta({ lastLocalWriteAt: at });
};
