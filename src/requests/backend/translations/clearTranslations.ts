import { buildBackendRequest } from '../../utils/requestBuilder';

import { flush } from './data';
import { notifyDictionaryClear } from '.';

export const [clearTranslationsFactory, clearTranslations] = buildBackendRequest(
	'clearTranslations',
	{
		factoryHandler:
			({ backgroundContext }) =>
			async () => {
				await flush();
				notifyDictionaryClear();
				void backgroundContext
					.getWebDAVSyncManager()
					.onLocalDictionaryWrite()
					.catch((error) => {
						console.error(
							'[dictionary] failed to schedule WebDAV sync after clear',
							error,
						);
					});
			},
	},
);
