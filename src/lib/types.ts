import { isRight } from 'fp-ts/lib/Either';
import * as t from 'io-ts';

export const type = t;

export type DecodePathError = {
	key: string;
	value: unknown;
	typeName: string;
	message?: string;
};

export type TryDecodeOptions = {
	/**
	 * Extra label for logs/errors, e.g. `backend:getConfig:response`.
	 */
	context?: string;
};

/**
 * Compact preview of a value for error messages (avoid dumping large payloads).
 */
export const summarizeDecodeValue = (value: unknown): string => {
	if (value === undefined) return 'undefined';
	if (value === null) return 'null';
	if (typeof value === 'string') {
		return value.length > 40
			? `string(length=${value.length})`
			: JSON.stringify(value);
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	if (typeof value === 'bigint') {
		return `${value}n`;
	}
	if (typeof value === 'function') {
		return 'function';
	}
	if (typeof value === 'symbol') {
		return value.toString();
	}
	if (Array.isArray(value)) {
		return `array(length=${value.length})`;
	}
	if (typeof value === 'object') {
		const keys = Object.keys(value);
		const preview = keys.slice(0, 8).join(',');
		const suffix = keys.length > 8 ? ',…' : '';
		return `object(keys=[${preview}${suffix}])`;
	}
	return typeof value;
};

/**
 * Format io-ts path errors into a single diagnostic line.
 */
export const formatDecodeErrors = (errors: DecodePathError[], limit = 5): string => {
	if (errors.length === 0) return 'unknown decode failure';

	const parts = errors.slice(0, limit).map((error) => {
		const path = error.key.length > 0 ? error.key : '<root>';
		const expected = error.typeName || 'unknown';
		return `${path}: expected ${expected}, got ${summarizeDecodeValue(error.value)}`;
	});
	const more = errors.length > limit ? ` (+${errors.length - limit} more)` : '';
	return parts.join('; ') + more;
};

const errorsFromValidation = (validationErrors: t.Errors): DecodePathError[] =>
	validationErrors.map((error) => {
		const context = error.context;
		const targetPropertyContext = context[context.length - 1];

		return {
			key: context
				.slice(1)
				.map(({ key }) => key)
				.join('.'),
			value: error.value,
			typeName: targetPropertyContext?.type?.name ?? 'unknown',
			message: error.message,
		};
	});

/**
 * Options bag for tryDecode (third-arg form without a default value).
 * Only `{ context?: string }` is accepted so real defaultData objects are not misdetected.
 */
const isTryDecodeOptions = (value: unknown): value is TryDecodeOptions => {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}

	const keys = Object.keys(value);
	return keys.every((key) => key === 'context');
};

// TODO: remove not declared properties
/**
 * Try to decode object and return object with data or with errors
 */
export function decodeStruct<T>(
	type: t.Type<T>,
	data: any,
):
	| { data: T; errors: null }
	| {
			data: null;
			errors: {
				key: string;
				value: unknown;
				type: t.Decoder<any, any>;
				message?: string;
			}[];
	  } {
	const decodeResult = type.decode(data);

	// Return decoded value
	if (isRight(decodeResult)) {
		return {
			data: decodeResult.right,
			errors: null,
		};
	}

	// Build errors object
	return {
		data: null,
		errors: decodeResult.left.map((error) => {
			// Remove root object from context tree
			const context = error.context;
			const targetPropertyContext = context[context.length - 1];

			return {
				key: context
					.slice(1)
					.map(({ key }) => key)
					.join('.'),
				value: error.value,
				type: targetPropertyContext.type,
				message: error.message,
			};
		}),
	};
}

// TODO: decode primitive values and generate reports like in `decodeStruct`
/**
 * Helper for decode data by type.
 *
 * On failure throws `TypeError` containing the historical `Invalid type` token,
 * codec name, optional context, and path-level expected/got details.
 *
 * Call forms:
 * - `tryDecode(codec, data)` — throw on failure
 * - `tryDecode(codec, data, defaultData)` — return default on failure
 * - `tryDecode(codec, data, { context })` — throw with labeled context
 * - `tryDecode(codec, data, defaultData, { context })` — default + labeled logs
 */
export function tryDecode<T>(codec: t.Type<T>, data: unknown): T;
export function tryDecode<T>(codec: t.Type<T>, data: unknown, defaultData: T): T;
export function tryDecode<T>(
	codec: t.Type<T>,
	data: unknown,
	options: TryDecodeOptions,
): T;
export function tryDecode<T>(
	codec: t.Type<T>,
	data: unknown,
	defaultData: T,
	options: TryDecodeOptions,
): T;
export function tryDecode<T>(
	codec: t.Type<T>,
	data: unknown,
	defaultDataOrOptions?: T | TryDecodeOptions,
	maybeOptions?: TryDecodeOptions,
): T {
	const decodedData = codec.decode(data);
	if (isRight(decodedData)) {
		return decodedData.right;
	}

	let defaultData: T | undefined;
	let hasDefault = false;
	let options: TryDecodeOptions | undefined;

	if (arguments.length >= 4) {
		hasDefault = true;
		defaultData = defaultDataOrOptions as T;
		options = maybeOptions;
	} else if (arguments.length === 3) {
		if (isTryDecodeOptions(defaultDataOrOptions)) {
			options = defaultDataOrOptions;
		} else {
			hasDefault = true;
			defaultData = defaultDataOrOptions as T;
		}
	}

	if (hasDefault) {
		return defaultData as T;
	}

	const pathErrors = errorsFromValidation(decodedData.left);
	const details = formatDecodeErrors(pathErrors);
	const contextPrefix = options?.context ? `${options.context}: ` : '';
	// Keep the historical "Invalid type" token so existing greps/reports still match.
	const message = `${contextPrefix}Invalid type (${codec.name}): ${details}`;

	console.error(message, {
		context: options?.context,
		codec: codec.name,
		data,
		errors: pathErrors,
	});
	throw new TypeError(message);
}

/**
 * Same as `tryDecode` but only for objects and more verbose
 *
 * @deprecated: use `decodeStruct` instead and generate exception
 */
export const tryDecodeObject = <T extends t.Props>(
	type: t.TypeC<T> | t.PartialC<T>,
	data: any,
) => {
	if (!(data instanceof Object)) {
		throw new TypeError('Data is not object');
	}

	const typeProps = type.props;

	const typeKeys = Object.keys(typeProps);
	const dataKeys = Object.keys(data);
	if (typeKeys.length !== dataKeys.length) {
		throw new RangeError('Number of elements in types and data is not equal');
	}

	for (const key in typeProps) {
		if (!(key in data)) {
			throw new RangeError(`Key "${key}" is not found`);
		}

		const decodedData = typeProps[key].decode(data[key]);
		if (!isRight(decodedData)) {
			throw new TypeError(`Invalid type of key "${key}"`);
		}
	}

	return data as t.TypeOfProps<T>;
};

/**
 * Validate type of value from TypeC object by path
 */
export const checkTypeByPath = <T extends t.Props>(
	typeObject: t.TypeC<T>,
	path: string[],
	value: any,
): boolean => {
	let type: t.TypeC<any> | t.Type<any> = typeObject;

	for (let i = 0; i < path.length; i++) {
		const segment = path[i];
		if ('props' in type) {
			type = type.props[segment];
		} else {
			return false;
		}
	}

	return isRight(type.decode(value));
};

// Type constructors

export const StringLiteralType = <T extends string>(stringOfType: T) =>
	new type.Type(
		`String["${stringOfType}"]`,
		(input: unknown): input is T =>
			typeof input === 'string' && input === stringOfType,
		(input, context) =>
			typeof input === 'string' && input === stringOfType
				? type.success(input as T)
				: type.failure(input, context),
		type.identity,
	);

export const StringPatternType = <T extends string = string>(pattern: RegExp) =>
	new type.Type(
		`StringPatternType["${pattern.source}"]`,
		(input: unknown): input is T => typeof input === 'string' && pattern.test(input),
		(input, context) =>
			typeof input === 'string' && pattern.test(input)
				? type.success(input as T)
				: type.failure(input, context),
		type.identity,
	);
