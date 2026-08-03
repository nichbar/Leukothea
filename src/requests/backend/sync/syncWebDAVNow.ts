import { type } from '../../../lib/types';
import { buildBackendRequest } from '../../utils/requestBuilder';

const SyncStatusCodec = type.type({
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
	enabled: type.boolean,
	url: type.string,
	path: type.string,
});

export const [syncWebDAVNowFactory, syncWebDAVNow] = buildBackendRequest(
	'syncWebDAVNow',
	{
		requestValidator: type.partial({
			url: type.string,
			username: type.string,
			password: type.string,
		}),
		responseValidator: SyncStatusCodec,
		factoryHandler:
			({ backgroundContext }) =>
			async (credentials) => {
				const manager = backgroundContext.getWebDAVSyncManager();
				return manager.syncNow(credentials);
			},
	},
);
