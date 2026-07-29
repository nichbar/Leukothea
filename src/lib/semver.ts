/**
 * Compare two semver-ish version strings (major.minor.patch, optional pre-release ignored for order).
 * Missing / unparsable segments are treated as 0.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
export const compareSemver = (
	a: string | null | undefined,
	b: string | null | undefined,
): number => {
	const parse = (v: string | null | undefined): number[] => {
		if (v == null || typeof v !== 'string' || v.trim() === '') {
			return [0, 0, 0];
		}
		// Strip leading "v" and pre-release / build metadata
		const core = v.trim().replace(/^v/i, '').split(/[-+]/)[0] ?? '0';
		const parts = core.split('.').map((p) => {
			const n = parseInt(p, 10);
			return Number.isFinite(n) ? n : 0;
		});
		while (parts.length < 3) parts.push(0);
		return parts.slice(0, 3);
	};

	const pa = parse(a);
	const pb = parse(b);
	for (let i = 0; i < 3; i++) {
		const diff = pa[i] - pb[i];
		if (diff !== 0) return diff;
	}
	return 0;
};
