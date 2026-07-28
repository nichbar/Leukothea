import { DEFAULT_TRANSLATOR } from '../../../config';
import { buildBackendRequest } from '../../utils/requestBuilder';

import { getTranslatorsClasses } from '.';

// TODO: move logic to `TranslateSchedulerConfig`
export const [applyTranslatorsFactory, applyTranslators] = buildBackendRequest(
	'applyTranslators',
	{
		factoryHandler: ({ backgroundContext, config }) => {
			const update = async () => {
				const translatorsClasses = await getTranslatorsClasses();

				const latestConfig = await config.get();
				const { translatorModule: translatorName } = latestConfig;

				// Reset to default when selected module is missing (removed built-in
				// or deleted custom). Covers stale Google/Microsoft/Yandex/Bergamot ids.
				if (!(translatorName in translatorsClasses)) {
					await config.set({
						...latestConfig,
						translatorModule: DEFAULT_TRANSLATOR,
					});
				}

				const translateManager = await backgroundContext.getTranslateManager();
				translateManager.setTranslators(translatorsClasses);
			};

			update();

			return update;
		},
	},
);
