const audioDurationCache = new Map<string, number>();

/**
 * Probe an audio file's duration from its metadata so the timeline block can
 * be created with the real length. Resolves to null when metadata cannot load.
 */
export function probeAudioDurationMs(url: string): Promise<number | null> {
	const cached = audioDurationCache.get(url);
	if (typeof cached === "number" && Number.isFinite(cached)) {
		return Promise.resolve(cached);
	}

	return new Promise((resolve) => {
		const element = document.createElement("audio");
		element.preload = "metadata";
		const cleanup = () => {
			element.onloadedmetadata = null;
			element.onerror = null;
			element.src = "";
		};
		element.onloadedmetadata = () => {
			const durationMs = Number.isFinite(element.duration) ? element.duration * 1000 : null;
			if (durationMs !== null) audioDurationCache.set(url, durationMs);
			cleanup();
			resolve(durationMs);
		};
		element.onerror = () => {
			cleanup();
			resolve(null);
		};
		window.setTimeout(() => {
			cleanup();
			resolve(audioDurationCache.get(url) ?? null);
		}, 4000);
		element.src = url;
	});
}
