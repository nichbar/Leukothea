import { type } from '../../../lib/types';

/** Shared WebDAV sync status shape returned by status / sync / force-push handlers. */
export const WebDAVSyncStatusCodec = type.type({
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
	enabled: type.boolean,
	url: type.string,
	path: type.string,
});
