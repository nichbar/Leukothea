import {
	deriveModelsUrl,
	parseOpenAIModelsResponse,
} from '../../../lib/translators/llm/llmModels';
import { type } from '../../../lib/types';
import { buildBackendRequest } from '../../utils/requestBuilder';

export const [listLLMModelsFactory, listLLMModels] = buildBackendRequest(
	'listLLMModels',
	{
		requestValidator: type.intersection([
			type.type({
				apiUrl: type.string,
			}),
			type.partial({
				apiKey: type.string,
			}),
		]),
		responseValidator: type.intersection([
			type.type({
				models: type.array(type.string),
			}),
			type.partial({
				error: type.string,
			}),
		]),

		factoryHandler:
			() =>
			async ({ apiUrl, apiKey }) => {
				const modelsUrl = deriveModelsUrl(apiUrl);
				if (modelsUrl === null) {
					return {
						models: [],
						error: 'Invalid API URL',
					};
				}

				try {
					const headers: Record<string, string> = {};
					if (apiKey) {
						headers.Authorization = `Bearer ${apiKey}`;
					}

					const response = await fetch(modelsUrl, { headers });
					if (!response.ok) {
						const statusText = response.statusText || 'Request failed';
						return {
							models: [],
							error: `${response.status} ${statusText}`.trim(),
						};
					}

					const body: unknown = await response.json();
					const models = parseOpenAIModelsResponse(body);

					return { models };
				} catch (error) {
					const message =
						error instanceof Error ? error.message : 'Failed to load models';
					return {
						models: [],
						error: message,
					};
				}
			},
	},
);
