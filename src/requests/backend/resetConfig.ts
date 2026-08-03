import { getDefaultConfig } from '../../config';

import { buildBackendRequest } from '../utils/requestBuilder';

export const [resetConfigFactory, resetConfig] = buildBackendRequest('resetConfig', {
	factoryHandler:
		({ config }) =>
		async () => {
			// Re-resolve browser language at reset time (not module load).
			await config.set(getDefaultConfig());
		},
});
