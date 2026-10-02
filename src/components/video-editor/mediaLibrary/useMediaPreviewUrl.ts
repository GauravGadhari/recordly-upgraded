import { useEffect, useState } from "react";
import { resolveMediaResourceUrl } from "@/lib/exporter/localMediaSource";

/**
 * Hook to retrieve a lightweight, low-resolution thumbnail video URL
 * for high-performance, lag-free autoplay looping in the media library grid.
 * Falls back to the resolved source media URL if thumbnail generation is pending or unsupported.
 */
export function useMediaPreviewUrl(resourcePath: string | null | undefined): string | null {
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		if (!resourcePath) {
			setPreviewUrl(null);
			return;
		}

		const api = typeof window !== "undefined" ? window.electronAPI : undefined;
		if (api?.getMediaPreviewVideo) {
			void api
				.getMediaPreviewVideo(resourcePath)
				.then((res) => {
					if (cancelled) return;
					if (res.success && res.url) {
						setPreviewUrl(res.url);
						return;
					}
					return resolveMediaResourceUrl(resourcePath).then((url) => {
						if (!cancelled) setPreviewUrl(url);
					});
				})
				.catch(() => {
					if (!cancelled) {
						void resolveMediaResourceUrl(resourcePath).then((url) => {
							if (!cancelled) setPreviewUrl(url);
						});
					}
				});
		} else {
			void resolveMediaResourceUrl(resourcePath).then((url) => {
				if (!cancelled) setPreviewUrl(url);
			});
		}

		return () => {
			cancelled = true;
		};
	}, [resourcePath]);

	return previewUrl;
}
