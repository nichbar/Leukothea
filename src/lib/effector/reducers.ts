import { isEqual } from 'lodash';

/**
 * Update only not equal object properties.
 * Returns the original `state` reference when nothing changed so
 * effector watchers / derived stores do not re-emit for no-ops.
 */
export const updateNotEqualProps = <T extends Record<string, unknown>>(
	state: T,
	data: T,
) => {
	let hasChanges = false;
	const newState = { ...state };

	// Update props
	for (const key in data) {
		const isEqualValue = isEqual(state[key as keyof T], data[key as keyof T]);
		if (!isEqualValue) {
			newState[key as keyof T] = data[key as keyof T];
			hasChanges = true;
		}
	}

	return hasChanges ? newState : state;
};
