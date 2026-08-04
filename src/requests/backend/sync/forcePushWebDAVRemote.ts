import { type } from '../../../lib/types';
import { buildBackendRequest } from '../../utils/requestBuilder';

import { WebDAVSyncStatusCodec } from './webdavSyncStatusCodec';

/**
 * Manually overwrite a remote config that failed AppConfig validation.
 * Does not run automatic LWW reconcile — only Options recovery "Force push".
 */
export const [forcePushWebDAVRemoteFactory, forcePushWebDAVRemote] = buildBackendRequest(
	'forcePushWebDAVRemote',
	{
		requestValidator: type.partial({
			url: type.string,
			username: type.string,
			password: type.string,
		}),
		responseValidator: WebDAVSyncStatusCodec,
		factoryHandler:
			({ backgroundContext }) =>
			async (credentials) => {
				const manager = backgroundContext.getWebDAVSyncManager();
				return manager.forcePushRemote(credentials);
			},
	},
);
