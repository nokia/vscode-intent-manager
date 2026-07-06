/** Parsed intent-type folder name (e.g. `myintent_v3`). */
export interface IntentTypeIdentity {
	name: string;
	version: number;
	folder: string;
}

/** Split `intent_type_vN` folder into name and version. */
export function parseIntentTypeFolder(folder: string): IntentTypeIdentity {
	const versionIndex = folder.lastIndexOf('_v');
	if (versionIndex < 0) {
		return { folder, name: folder, version: 1 };
	}
	return {
		folder,
		name: folder.substring(0, versionIndex),
		version: parseInt(folder.substring(versionIndex + 2), 10) || 1,
	};
}

/** Extract intent target from an `im:` URI path segment (drops `.json` suffix). */
export function parseIntentTarget(intentSegment: string): string {
	return decodeURIComponent(intentSegment.endsWith('.json') ? intentSegment.slice(0, -5) : intentSegment);
}

/** Compare NSP release string against a minimum major.minor threshold. */
export function isAtLeastRelease(current: string | undefined, major: number, minor: number): boolean {
	if (!current) {
		return false;
	}
	const parts = current.split('.').map((v) => parseInt(v, 10));
	if (parts[0] > major) {
		return true;
	}
	return parts[0] === major && parts[1] >= minor;
}
