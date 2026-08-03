import * as t from 'io-ts';

import { tryDecode } from '../../../lib/types';
import {
	ClientRequestHandlerFactory,
	ClientRequestHandlerFactoryProps,
} from '../../types';

import { addRequestHandler, sendTabRequest } from '..';

type TabOptions<O = any, R = any> = {
	factoryHandler: (
		props: ClientRequestHandlerFactoryProps,
	) => (options: O) => Promise<R>;
	requestValidator?: t.Type<O, O>;
	responseValidator?: t.Type<R, R>;
};

/**
 * Factory for building requests which ensure its types
 */
export const buildTabRequest = <O = void, R = void>(
	endpoint: string,
	{ factoryHandler, requestValidator, responseValidator }: TabOptions<O, R>,
) => {
	const hook = (tabId: number, options: O) =>
		sendTabRequest(tabId, endpoint, options).then((response): R => {
			// Validate response payload from the tab content script
			if (responseValidator !== undefined) {
				tryDecode(responseValidator, response, {
					context: `tab:${endpoint}:response`,
				});
			}

			return response;
		});

	const factory: ClientRequestHandlerFactory = (factoryProps) => {
		const handler = factoryHandler(factoryProps);

		return addRequestHandler(endpoint, async (reqProps) => {
			// Validate request payload before running the handler
			if (requestValidator !== undefined) {
				tryDecode(requestValidator, reqProps, {
					context: `tab:${endpoint}:request`,
				});
			}

			return handler(reqProps);
		});
	};

	return [
		factory,
		hook as O extends undefined
			? (tabId: number) => Promise<R>
			: (tabId: number, options: O) => Promise<R>,
	] as const;
};
