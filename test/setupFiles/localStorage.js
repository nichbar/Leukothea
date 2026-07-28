/**
 * Node 25+ may inject a host `localStorage` without the Storage API (`clear`, etc.).
 * `jest-localstorage-mock` then fails to replace it (accessor / non-writable binding),
 * and `clearAllMocks` throws. Force a full in-memory Storage when the host is incomplete.
 * CI on Node 20 keeps the normal mock path.
 */
const installMemoryStorage = (name) => {
	const data = Object.create(null);
	const storage = {
		getItem(key) {
			return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
		},
		setItem(key, value) {
			data[String(key)] = String(value);
		},
		removeItem(key) {
			delete data[key];
		},
		clear() {
			for (const key of Object.keys(data)) {
				delete data[key];
			}
		},
		key(index) {
			return Object.keys(data)[index] ?? null;
		},
		get length() {
			return Object.keys(data).length;
		},
	};

	Object.defineProperty(globalThis, name, {
		value: storage,
		configurable: true,
		enumerable: true,
		writable: true,
	});
};

const needsRepair = (storage) =>
	storage == null || typeof storage.clear !== 'function' || typeof storage.getItem !== 'function';

if (needsRepair(globalThis.localStorage)) {
	installMemoryStorage('localStorage');
}
if (needsRepair(globalThis.sessionStorage)) {
	installMemoryStorage('sessionStorage');
}
