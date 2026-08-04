import { buildBackendRequest } from '../../utils/requestBuilder';

import { WebDAVSyncStatusCodec } from './webdavSyncStatusCodec';

export const [getWebDAVSyncStatusFactory, getWebDAVSyncStatus] = buildBackendRequest(
	'getWebDAVSyncStatus',
	{
		responseValidator: WebDAVSyncStatusCodec,
		factoryHandler:
			({ backgroundContext }) =>
			async () => {
				const manager = backgroundContext.getWebDAVSyncManager();
				return manager.getStatus();
			},
	},
);
