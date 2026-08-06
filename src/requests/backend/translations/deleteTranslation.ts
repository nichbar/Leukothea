import { type } from '../../../lib/types';
import { buildBackendRequest } from '../../utils/requestBuilder';

import { deleteEntry } from './data';
import { notifyDictionaryEntryDelete } from '.';

export const [deleteTranslationFactory, deleteTranslationReq] = buildBackendRequest(
	'deleteTranslation',
	{
		requestValidator: type.number,
		factoryHandler:
			({ backgroundContext }) =>
			async (id) => {
				await deleteEntry(id);

				notifyDictionaryEntryDelete(id);
				void backgroundContext
					.getWebDAVSyncManager()
					.onLocalDictionaryWrite()
					.catch((error) => {
						console.error(
							'[dictionary] failed to schedule WebDAV sync after delete',
							error,
						);
					});
			},
	},
);

export const deleteTranslation = (id: number) => deleteTranslationReq(id);
