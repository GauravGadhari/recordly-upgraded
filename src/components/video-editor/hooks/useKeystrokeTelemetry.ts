import { useCallback, useEffect, useRef } from "react";
import type { useTimelineState } from "../state/useTimelineState";
import type { KeystrokeEvent } from "../types";

type UseKeystrokeTelemetryInput = {
	videoPath: string | null;
	videoSourcePath: string | null;
	timeline: ReturnType<typeof useTimelineState>;
};

export function useKeystrokeTelemetry({
	videoPath,
	videoSourcePath,
	timeline,
}: UseKeystrokeTelemetryInput) {
	const pendingRetryTimeoutRef = useRef<number | null>(null);
	const { setKeystrokes, keystrokes } = timeline;

	useEffect(() => {
		let mounted = true;
		let retryAttempts = 0;

		const scheduleRetry = () => {
			if (retryAttempts >= 10) return;
			retryAttempts += 1;
			pendingRetryTimeoutRef.current = window.setTimeout(() => {
				pendingRetryTimeoutRef.current = null;
				if (mounted) void load();
			}, 400);
		};

		async function load() {
			if (!videoPath || !videoSourcePath) {
				if (mounted) setKeystrokes([]);
				return;
			}

			try {
				const result = await window.electronAPI.getKeystrokes(videoSourcePath);
				if (!mounted) return;

				if (result.success && Array.isArray(result.events) && result.events.length > 0) {
					setKeystrokes(result.events);
				} else {
					scheduleRetry();
				}
			} catch (error) {
				console.warn("Unable to load keystroke telemetry:", error);
				if (!mounted) return;
				scheduleRetry();
			}
		}

		if (pendingRetryTimeoutRef.current !== null) {
			window.clearTimeout(pendingRetryTimeoutRef.current);
			pendingRetryTimeoutRef.current = null;
		}

		void load();

		return () => {
			mounted = false;
			if (pendingRetryTimeoutRef.current !== null) {
				window.clearTimeout(pendingRetryTimeoutRef.current);
				pendingRetryTimeoutRef.current = null;
			}
		};
	}, [videoPath, videoSourcePath, setKeystrokes]);

	const updateKeystroke = useCallback(
		(id: string, updates: Partial<KeystrokeEvent>) => {
			setKeystrokes((prev) => {
				const next = prev.map((event) => (event.id === id ? { ...event, ...updates } : event));
				if (videoSourcePath) {
					void window.electronAPI.setKeystrokes(videoSourcePath, next);
				}
				return next;
			});
		},
		[videoSourcePath, setKeystrokes],
	);

	const deleteKeystroke = useCallback(
		(id: string) => {
			setKeystrokes((prev) => {
				const next = prev.filter((event) => event.id !== id);
				if (videoSourcePath) {
					void window.electronAPI.setKeystrokes(videoSourcePath, next);
				}
				return next;
			});
		},
		[videoSourcePath, setKeystrokes],
	);

	const toggleKeystrokeEnabled = useCallback(
		(id: string) => {
			setKeystrokes((prev) => {
				const next = prev.map((event) =>
					event.id === id ? { ...event, enabled: event.enabled === false ? true : false } : event,
				);
				if (videoSourcePath) {
					void window.electronAPI.setKeystrokes(videoSourcePath, next);
				}
				return next;
			});
		},
		[videoSourcePath, setKeystrokes],
	);

	return {
		keystrokes,
		updateKeystroke,
		deleteKeystroke,
		toggleKeystrokeEnabled,
	};
}
