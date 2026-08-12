import { beforeEach, describe, expect, test } from 'vitest';

import { clearAllMocks } from '../../../lib/tests';

import {
	defaultConfigSyncMeta,
	flushConfigSyncMetaWrites,
	getConfigSyncMeta,
	setConfigSyncMeta,
} from './syncMeta';
import {
	defaultDictionarySyncMeta,
	flushDictionarySyncMetaWrites,
	getDictionarySyncMeta,
	setDictionarySyncMeta,
} from './dictionarySyncMeta';

describe('config/dictionary sync meta write serialization', () => {
	beforeEach(async () => {
		await flushConfigSyncMetaWrites();
		await flushDictionarySyncMetaWrites();
		await clearAllMocks();
		await flushConfigSyncMetaWrites();
		await flushDictionarySyncMetaWrites();
		await clearAllMocks();
	});

	test('concurrent setConfigSyncMeta updates do not drop fields', async () => {
		await setConfigSyncMeta({
			...defaultConfigSyncMeta(),
			lastLocalWriteAt: 1,
		});

		// Same pattern as reconcile: etag write races with error/recovery write
		await Promise.all([
			setConfigSyncMeta({ lastRemoteEtag: '"bad"' }),
			setConfigSyncMeta({
				lastError: 'Remote config failed AppConfig validation',
				lastDirection: 'none',
				recovery: 'forcePushInvalidRemote',
			}),
		]);

		const meta = await getConfigSyncMeta();
		expect(meta.lastRemoteEtag).toBe('"bad"');
		expect(meta.lastError).toBe('Remote config failed AppConfig validation');
		expect(meta.recovery).toBe('forcePushInvalidRemote');
		expect(meta.lastLocalWriteAt).toBe(1);
	});

	test('concurrent setDictionarySyncMeta updates do not drop fields', async () => {
		await setDictionarySyncMeta({
			...defaultDictionarySyncMeta(),
			lastLocalWriteAt: 2,
		});

		await Promise.all([
			setDictionarySyncMeta({ lastRemoteEtag: '"dict"' }),
			setDictionarySyncMeta({
				lastError: 'Remote dictionary failed validation',
				lastDirection: 'none',
				recovery: 'forcePushInvalidRemote',
			}),
		]);

		const meta = await getDictionarySyncMeta();
		expect(meta.lastRemoteEtag).toBe('"dict"');
		expect(meta.lastError).toBe('Remote dictionary failed validation');
		expect(meta.recovery).toBe('forcePushInvalidRemote');
		expect(meta.lastLocalWriteAt).toBe(2);
	});
});
