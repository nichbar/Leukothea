import { Scheduler } from 'anylang/scheduling';
import { ICache } from 'anylang/utils/cache';

import { SchedulerWithCache } from './SchedulerWithCache';

const createMemoryCache = (): ICache => {
	const store = new Map<string, string>();
	const key = (text: string, from: string, to: string) => `${from}:${to}:${text}`;
	return {
		get: async (text, from, to) => store.get(key(text, from, to)) ?? null,
		set: async (text, translate, from, to) => {
			store.set(key(text, from, to), translate);
		},
		clear: async () => {
			store.clear();
		},
	};
};

const createTranslator = (translateImpl: (text: string) => string) => {
	return {
		translate: vi.fn((text: string) => Promise.resolve(translateImpl(text))),
		translateBatch: vi.fn((texts: string[]) =>
			Promise.all(texts.map((text) => Promise.resolve(translateImpl(text)))),
		),
		getLengthLimit: () => 4000,
		getRequestsTimeout: () => 0,
		checkLimitExceeding: () => -10000,
	};
};

const createScheduler = (translator: ReturnType<typeof createTranslator>) =>
	new Scheduler(translator as any, {
		translateRetryAttemptLimit: 0,
		isAllowDirectTranslateBadChunks: true,
		directTranslateLength: null,
		translatePoolDelay: 0,
		chunkSizeForInstantTranslate: null,
	});

describe('SchedulerWithCache', () => {
	test('re-appends trailing punctuation when translation lacks it', async () => {
		const translator = createTranslator((text) => `ZH(${text})`);
		const cacheScheduler = new SchedulerWithCache(
			createScheduler(translator),
			createMemoryCache(),
		);

		const result = await cacheScheduler.translate('Hello world.', 'en', 'zh');
		expect(result).toBe('ZH(Hello world).');
		// Scheduler may call translate or translateBatch depending on pooling
		const calledText =
			translator.translate.mock.calls[0]?.[0] ??
			translator.translateBatch.mock.calls[0]?.[0]?.[0];
		expect(calledText).toBe('Hello world');
	});

	test('skips re-append when translation already ends with the source suffix', async () => {
		const translator = createTranslator((text) => `ZH(${text}).`);
		const cacheScheduler = new SchedulerWithCache(
			createScheduler(translator),
			createMemoryCache(),
		);

		const result = await cacheScheduler.translate('Hello world.', 'en', 'zh');
		expect(result).toBe('ZH(Hello world).');
	});

	test('skips re-prepend when translation already starts with the source prefix', async () => {
		const translator = createTranslator((text) => `"ZH(${text})"`);
		const cacheScheduler = new SchedulerWithCache(
			createScheduler(translator),
			createMemoryCache(),
		);

		const result = await cacheScheduler.translate('"Hello"', 'en', 'zh');
		expect(result).toBe('"ZH(Hello)"');
	});

	test('restores both prefix and suffix when translation has neither', async () => {
		const translator = createTranslator((text) => `ZH(${text})`);
		const cacheScheduler = new SchedulerWithCache(
			createScheduler(translator),
			createMemoryCache(),
		);

		const result = await cacheScheduler.translate('"Hello"', 'en', 'zh');
		expect(result).toBe('"ZH(Hello)"');
	});

	test('applies the same restore rules when serving from cache', async () => {
		const translator = createTranslator((text) => `ZH(${text})`);
		const cache = createMemoryCache();
		const cacheScheduler = new SchedulerWithCache(createScheduler(translator), cache);

		// Seed cache with a bare translation (as stored after trim)
		await cache.set('Hello world', '你好世界', 'en', 'zh');

		const withoutPeriod = await cacheScheduler.translate('Hello world', 'en', 'zh');
		expect(withoutPeriod).toBe('你好世界');

		const withPeriod = await cacheScheduler.translate('Hello world.', 'en', 'zh');
		expect(withPeriod).toBe('你好世界.');

		// Translator must not be called when cache hits
		expect(translator.translate).not.toHaveBeenCalled();
	});

	test('drops prefix/suffix when restoreAffixes is false', async () => {
		const translator = createTranslator((text) => `ZH(${text})`);
		const cacheScheduler = new SchedulerWithCache(
			createScheduler(translator),
			createMemoryCache(),
			{ restoreAffixes: false },
		);

		const result = await cacheScheduler.translate('Hello world.', 'en', 'zh');
		expect(result).toBe('ZH(Hello world)');

		const quoted = await cacheScheduler.translate('"Hello"', 'en', 'zh');
		expect(quoted).toBe('ZH(Hello)');
	});

	test('does not restore affixes from cache when restoreAffixes is false', async () => {
		const translator = createTranslator((text) => `ZH(${text})`);
		const cache = createMemoryCache();
		const cacheScheduler = new SchedulerWithCache(
			createScheduler(translator),
			cache,
			{
				restoreAffixes: false,
			},
		);

		await cache.set('Hello world', '你好世界', 'en', 'zh');

		const withPeriod = await cacheScheduler.translate('Hello world.', 'en', 'zh');
		expect(withPeriod).toBe('你好世界');
		expect(translator.translate).not.toHaveBeenCalled();
	});
});
