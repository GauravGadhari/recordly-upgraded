import type { Span } from "dnd-timeline";
import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback } from "react";
import { toast } from "sonner";
import {
	type AutoSfxGenerationOptions,
	generateAutoCursorSfxRegions,
	generateKeystrokeSfxRegions,
	type KeystrokeSfxStyle,
} from "../timeline/sfxSuggestionUtils";
import type { AudioRegion, CursorTelemetryPoint, EditorEffectSection, KeystrokeEvent, ZoomRegion } from "../types";

interface UseAudioRegionCommandsParams {
	setAudioRegions: Dispatch<SetStateAction<AudioRegion[]>>;
	selectedAudioId: string | null;
	setSelectedAudioId: Dispatch<SetStateAction<string | null>>;
	setSelectedZoomId: Dispatch<SetStateAction<string | null>>;
	setSelectedAnnotationId: Dispatch<SetStateAction<string | null>>;
	setSelectedCaptionId: Dispatch<SetStateAction<string | null>>;
	setSelectedTransitionId?: Dispatch<SetStateAction<string | null>>;
	setSelectedMemeId?: Dispatch<SetStateAction<string | null>>;
	setActiveEffectSection: Dispatch<SetStateAction<EditorEffectSection>>;
	nextAudioIdRef: MutableRefObject<number>;
}

export interface AddAudioMeta {
	label?: string;
	category?: string;
}

export function useAudioRegionCommands({
	setAudioRegions,
	selectedAudioId,
	setSelectedAudioId,
	setSelectedZoomId,
	setSelectedAnnotationId,
	setSelectedCaptionId,
	setSelectedTransitionId,
	setSelectedMemeId,
	setActiveEffectSection,
	nextAudioIdRef,
}: UseAudioRegionCommandsParams) {
	const handleSelectAudio = useCallback(
		(id: string | null) => {
			setSelectedAudioId(id);
			if (id) {
				setSelectedZoomId(null);
				setSelectedAnnotationId(null);
				setSelectedCaptionId(null);
				setSelectedTransitionId?.(null);
				setSelectedMemeId?.(null);
				setActiveEffectSection("audio");
			}
		},
		[
			setActiveEffectSection,
			setSelectedAnnotationId,
			setSelectedAudioId,
			setSelectedCaptionId,
			setSelectedTransitionId,
			setSelectedMemeId,
			setSelectedZoomId,
		],
	);

	const handleAudioAdded = useCallback(
		(
			span: Span,
			audioPath: string,
			trackIndex?: number,
			meta?: AddAudioMeta,
		) => {
			const id = `audio-${nextAudioIdRef.current++}`;
			const newRegion: AudioRegion = {
				id,
				startMs: Math.round(span.start),
				endMs: Math.round(span.end),
				audioPath,
				volume: 1,
				normalize: false,
				trackIndex,
				...(meta?.label ? { label: meta.label } : {}),
				...(meta?.category ? { category: meta.category } : {}),
			};
			setAudioRegions((current) => [...current, newRegion]);
			setSelectedAudioId(id);
			setSelectedZoomId(null);
			setSelectedAnnotationId(null);
			setSelectedCaptionId(null);
			setSelectedTransitionId?.(null);
			setSelectedMemeId?.(null);
			setActiveEffectSection("audio");
		},
		[
			nextAudioIdRef,
			setActiveEffectSection,
			setAudioRegions,
			setSelectedAnnotationId,
			setSelectedAudioId,
			setSelectedCaptionId,
			setSelectedTransitionId,
			setSelectedMemeId,
			setSelectedZoomId,
		],
	);

	const handleAudioSpanChange = useCallback(
		(id: string, span: Span, trackIndex?: number) => {
			const normalizedTrackIndex =
				typeof trackIndex === "number" && Number.isFinite(trackIndex)
					? Math.max(0, Math.floor(trackIndex))
					: undefined;
			setAudioRegions((current) =>
				current.map((region) =>
					region.id === id
						? {
								...region,
								startMs: Math.round(span.start),
								endMs: Math.round(span.end),
								...(normalizedTrackIndex === undefined
									? {}
									: { trackIndex: normalizedTrackIndex }),
							}
						: region,
				),
			);
		},
		[setAudioRegions],
	);

	const handleAudioVolumeChange = useCallback(
		(volume: number) => {
			if (!selectedAudioId || !Number.isFinite(volume)) return;
			const nextVolume = Math.max(0, Math.min(1, volume));
			setAudioRegions((current) =>
				current.map((region) =>
					region.id === selectedAudioId ? { ...region, volume: nextVolume } : region,
				),
			);
		},
		[selectedAudioId, setAudioRegions],
	);

	const handleAudioDelete = useCallback(
		(id: string) => {
			setAudioRegions((current) => current.filter((region) => region.id !== id));
			if (selectedAudioId === id) setSelectedAudioId(null);
		},
		[selectedAudioId, setAudioRegions, setSelectedAudioId],
	);

	const handleAudioNormalizeChange = useCallback(
		(normalize: boolean) => {
			if (!selectedAudioId) return;
			setAudioRegions((current) =>
				current.map((region) =>
					region.id === selectedAudioId ? { ...region, normalize } : region,
				),
			);
		},
		[selectedAudioId, setAudioRegions],
	);

	const handleGenerateCursorSfx = useCallback(
		(input: {
			telemetry?: CursorTelemetryPoint[];
			zoomRegions?: ZoomRegion[];
			keystrokes?: KeystrokeEvent[];
			duration: number;
			options?: AutoSfxGenerationOptions;
		}) => {
			const { telemetry = [], zoomRegions = [], keystrokes = [], duration, options } = input;
			if (
				(!telemetry || telemetry.length === 0) &&
				(!keystrokes || keystrokes.length === 0) &&
				(!zoomRegions || zoomRegions.length === 0)
			) {
				toast.info("No telemetry available", {
					description: "This recording does not have cursor or keystroke tracking data to generate SFX.",
				});
				return 0;
			}

			const durationMs = Math.round(duration * 1000);
			const generated = generateAutoCursorSfxRegions({
				telemetry,
				zoomRegions,
				keystrokes,
				durationMs,
				options,
			});

			if (generated.length === 0) {
				toast.info("No interaction moments found", {
					description: "No clicks, keystrokes, drags, or movements were detected to add SFX.",
				});
				return 0;
			}

			// Add generated regions to timeline
			setAudioRegions((current) => [...current, ...generated]);

			const clicks = generated.filter((r) => r.label === "Click").length;
			const drags = generated.filter((r) => r.label === "Drag").length;
			const whooshes = generated.filter(
				(r) => r.label?.startsWith("Whoosh") && !r.label?.includes("Zoom"),
			).length;
			const zooms = generated.filter(
				(r) =>
					r.label === "Zoom In" ||
					r.label === "Zoom Out" ||
					r.label?.includes("Zoom"),
			).length;
			const keys = generated.filter((r) => r.category === "Keystroke SFX" || r.label?.startsWith("Key")).length;

			const parts: string[] = [];
			if (clicks > 0) parts.push(`${clicks} click${clicks === 1 ? "" : "s"}`);
			if (keys > 0) parts.push(`${keys} keystroke${keys === 1 ? "" : "s"}`);
			if (drags > 0) parts.push(`${drags} drag${drags === 1 ? "" : "s"}`);
			if (whooshes > 0) parts.push(`${whooshes} whoosh${whooshes === 1 ? "" : "es"}`);
			if (zooms > 0) parts.push(`${zooms} zoom${zooms === 1 ? "" : "s"}`);

			toast.success(`Generated ${generated.length} SFX`, {
				description: `Added ${parts.join(", ")} to the audio timeline.`,
			});

			return generated.length;
		},
		[setAudioRegions],
	);

	const handleGenerateKeystrokeSfx = useCallback(
		(input: {
			keystrokes: KeystrokeEvent[];
			duration: number;
			style?: KeystrokeSfxStyle;
			volume?: number;
			shortcutsOnly?: boolean;
		}) => {
			const { keystrokes, duration, style, volume, shortcutsOnly } = input;
			if (!keystrokes || keystrokes.length === 0) {
				toast.info("No keystrokes recorded", {
					description: "This recording does not have any keystroke events to generate typing audio.",
				});
				return 0;
			}

			const durationMs = Math.round(duration * 1000);
			const generated = generateKeystrokeSfxRegions({
				keystrokes,
				durationMs,
				style,
				volume,
				shortcutsOnly,
			});

			if (generated.length === 0) {
				toast.info("No active keystrokes found", {
					description: "No enabled keystrokes matched the current filter.",
				});
				return 0;
			}

			setAudioRegions((current) => [...current, ...generated]);
			toast.success(`Generated ${generated.length} Keystroke SFX`, {
				description: `Added ${generated.length} typing sound${generated.length === 1 ? "" : "s"} to Keys SFX track.`,
			});
			return generated.length;
		},
		[setAudioRegions],
	);

	const handleClearKeystrokeSfx = useCallback(() => {
		let removedCount = 0;
		setAudioRegions((current) => {
			const next = current.filter((r) => {
				const isKeySfx =
					r.category === "Keystroke SFX" ||
					r.trackIndex === 3 ||
					r.label?.startsWith("Key");
				if (isKeySfx) removedCount++;
				return !isKeySfx;
			});
			return next;
		});

		if (removedCount > 0) {
			toast.success(`Removed ${removedCount} keystroke SFX from timeline`);
		} else {
			toast.info("No keystroke SFX found on timeline");
		}
	}, [setAudioRegions]);

	const handleClearCursorSfx = useCallback(() => {
		let removedCount = 0;
		setAudioRegions((current) => {
			const next = current.filter((r) => {
				const isCursorSfx =
					r.category === "Cursor SFX" ||
					r.category === "Keystroke SFX" ||
					r.label === "Click" ||
					r.label === "Drag" ||
					r.label?.startsWith("Whoosh") ||
					r.label === "Zoom In" ||
					r.label === "Zoom Out" ||
					r.label?.includes("Zoom") ||
					r.label?.startsWith("Key");
				if (isCursorSfx) removedCount++;
				return !isCursorSfx;
			});
			return next;
		});

		if (removedCount > 0) {
			toast.success(`Removed ${removedCount} SFX from timeline`);
		} else {
			toast.info("No SFX found on timeline");
		}
	}, [setAudioRegions]);

	return {
		handleSelectAudio,
		handleAudioAdded,
		handleAudioSpanChange,
		handleAudioVolumeChange,
		handleAudioDelete,
		handleAudioNormalizeChange,
		handleGenerateCursorSfx,
		handleGenerateKeystrokeSfx,
		handleClearKeystrokeSfx,
		handleClearCursorSfx,
	};
}
