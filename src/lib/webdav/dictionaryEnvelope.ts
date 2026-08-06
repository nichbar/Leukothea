import {
	ITranslationEntry,
	TranslationEntryType,
} from '../../requests/backend/translations/data';

import { decodeStruct, type } from '../types';

export const DICTIONARY_ENVELOPE_VERSION = 1;

export type DictionaryEnvelope = {
	version: number;
	updatedAt: number;
	extensionVersion: string;
	entries: ITranslationEntry[];
};

export type ParseDictionaryEnvelopeResult =
	| { ok: true; envelope: DictionaryEnvelope }
	| { ok: false; error: string; extensionVersion?: string; updatedAt?: number };

const DictionaryEnvelopeEntriesType = type.array(TranslationEntryType);

/**
 * Serialize dictionary entries into the remote envelope JSON string.
 * IndexedDB primary keys are never included — only entry payloads.
 */
export const serializeDictionaryEnvelope = (
	entries: ITranslationEntry[],
	updatedAt: number,
	extensionVersion: string,
): string => {
	const envelope: DictionaryEnvelope = {
		version: DICTIONARY_ENVELOPE_VERSION,
		updatedAt,
		extensionVersion,
		entries,
	};
	return JSON.stringify(envelope);
};

/**
 * Parse remote dictionary envelope text and validate entries with io-ts.
 */
export const parseDictionaryEnvelope = (text: string): ParseDictionaryEnvelopeResult => {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return { ok: false, error: 'Remote dictionary file is not valid JSON' };
	}

	if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
		return { ok: false, error: 'Remote dictionary envelope must be an object' };
	}

	const obj = raw as Record<string, unknown>;
	const version = obj.version;
	const updatedAt = obj.updatedAt;
	const extensionVersion =
		typeof obj.extensionVersion === 'string' ? obj.extensionVersion : undefined;

	if (typeof version !== 'number' || !Number.isFinite(version)) {
		return {
			ok: false,
			error: 'Remote dictionary envelope missing numeric version',
			extensionVersion,
		};
	}

	if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) {
		return {
			ok: false,
			error: 'Remote dictionary envelope missing numeric updatedAt',
			extensionVersion,
		};
	}

	if (!('entries' in obj)) {
		return {
			ok: false,
			error: 'Remote dictionary envelope missing entries',
			extensionVersion,
			updatedAt,
		};
	}

	const decoded = decodeStruct(DictionaryEnvelopeEntriesType, obj.entries);
	if (decoded.errors !== null) {
		return {
			ok: false,
			error: 'Remote dictionary entries failed validation',
			extensionVersion,
			updatedAt,
		};
	}

	return {
		ok: true,
		envelope: {
			version,
			updatedAt,
			extensionVersion: extensionVersion ?? '0.0.0',
			entries: decoded.data,
		},
	};
};
