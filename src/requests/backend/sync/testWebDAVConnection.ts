import { type } from '../../../lib/types';
import { buildBackendRequest } from '../../utils/requestBuilder';

export const [testWebDAVConnectionFactory, testWebDAVConnection] = buildBackendRequest(
	'testWebDAVConnection',
	{
		requestValidator: type.partial({
			url: type.string,
			username: type.string,
			password: type.string,
		}),
		responseValidator: type.intersection([
			type.type({
				ok: type.boolean,
			}),
			type.partial({
				error: type.string,
				status: type.number,
			}),
		]),

		factoryHandler:
			({ backgroundContext }) =>
			async (credentials) => {
				const manager = backgroundContext.getWebDAVSyncManager();
				return manager.testConnection(credentials);
			},
	},
);
