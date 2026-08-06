import { clearAllMocks } from '../../../../lib/tests';

import * as translationsStore from '../data';

beforeEach(() => {
	translationsStore.closeDB();
	clearAllMocks();
});

afterEach(() => {
	translationsStore.closeDB();
});

test('replaceAllEntries clears previous rows and inserts the new set', async () => {
	await translationsStore.addEntry({
		timestamp: 1,
		translation: {
			from: 'en',
			to: 'de',
			originalText: 'old',
			translatedText: 'alt',
		},
	});

	const next = [
		{
			timestamp: 2,
			translation: {
				from: 'en',
				to: 'zh',
				originalText: 'hello',
				translatedText: '你好',
			},
		},
		{
			timestamp: 3,
			translation: {
				from: 'en',
				to: 'zh',
				originalText: 'world',
				translatedText: '世界',
			},
		},
	];

	await translationsStore.replaceAllEntries(next);

	const entries = await translationsStore.getEntries(undefined, undefined, {
		order: 'asc',
	});
	// IDB keyPath injects `id` onto stored values; compare the logical payload.
	expect(
		entries.map(({ data }) => ({
			timestamp: data.timestamp,
			translation: data.translation,
		})),
	).toEqual(next);
});
