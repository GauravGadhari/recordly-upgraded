import { useEffect, useState } from "react";
import { resolveMediaResourceUrl } from "@/lib/exporter/localMediaSource";

/**
 * Resolve a local file path (e.g. on the user's asset drive) to a playable
 * media-server URL for <audio>/<video> preview elements.
 */
export function useResolvedMediaUrl(resourcePath: string | null | undefined): string | null {
	const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		if (!resourcePath) {
			setResolvedUrl(null);
			return;
		}
		void resolveMediaResourceUrl(resourcePath).then((url) => {
			if (!cancelled) setResolvedUrl(url);
		});
		return () => {
			cancelled = true;
		};
	}, [resourcePath]);

	return resolvedUrl;
}
