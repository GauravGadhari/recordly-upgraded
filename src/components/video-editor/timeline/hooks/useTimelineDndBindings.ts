import type { Span } from "dnd-timeline";
import { useCallback, useMemo } from "react";
import type {
	AnnotationRegion,
	AudioRegion,
	CaptionCue,
	ClipRegion,
	KeystrokeEvent,
	MemeRegion,
	SpeedRegion,
	TransitionRegion,
	TrimRegion,
	ZoomOutRegion,
	ZoomRegion,
} from "../../types";
import {
	getAnnotationTrackIndex,
	getAudioTrackIndex,
	getMemeTrackIndex,
	getTransitionTrackIndex,
	isAnnotationTrackRowId,
	isAudioTrackRowId,
	isMemeTrackRowId,
	isTransitionTrackRowId,
} from "../core/rows";
import { spansOverlap } from "../core/spans";
import type { TimelineRenderItem } from "../core/timelineTypes";
import { buildAllRegionSpans, buildTimelineItems, resolveDropRowId } from "../model/timelineModel";

interface UseTimelineDndBindingsParams {
	zoomRegions: ZoomRegion[];
	zoomOutRegions?: ZoomOutRegion[];
	trimRegions: TrimRegion[];
	clipRegions: ClipRegion[];
	annotationRegions: AnnotationRegion[];
	speedRegions: SpeedRegion[];
	audioRegions: AudioRegion[];
	captionCues: CaptionCue[];
	keystrokes: KeystrokeEvent[];
	transitionRegions?: TransitionRegion[];
	memeRegions?: MemeRegion[];
	onZoomSpanChange: (id: string, span: Span) => void;
	onZoomOutSpanChange?: (id: string, span: Span) => void;
	onTrimSpanChange?: (id: string, span: Span) => void;
	onClipSpanChange?: (id: string, span: Span) => void;
	onAnnotationSpanChange?: (id: string, span: Span, trackIndex?: number) => void;
	onSpeedSpanChange?: (id: string, span: Span) => void;
	onAudioSpanChange?: (id: string, span: Span, trackIndex?: number) => void;
	onCaptionSpanChange?: (id: string, span: Span) => void;
	onTransitionSpanChange?: (id: string, span: Span, trackIndex?: number) => void;
	onMemeSpanChange?: (id: string, span: Span, trackIndex?: number) => void;
}

type TimelineItemKind =
	| "zoom"
	| "zoom-out"
	| "trim"
	| "clip"
	| "annotation"
	| "speed"
	| "audio"
	| "caption"
	| "transition"
	| "meme"
	| null;

export function useTimelineDndBindings({
	zoomRegions,
	zoomOutRegions = [],
	trimRegions,
	clipRegions,
	annotationRegions,
	speedRegions,
	audioRegions,
	captionCues,
	keystrokes,
	transitionRegions = [],
	memeRegions = [],
	onZoomSpanChange,
	onZoomOutSpanChange,
	onTrimSpanChange,
	onClipSpanChange,
	onAnnotationSpanChange,
	onSpeedSpanChange,
	onAudioSpanChange,
	onCaptionSpanChange,
	onTransitionSpanChange,
	onMemeSpanChange,
}: UseTimelineDndBindingsParams) {
	const resolveItemKind = useCallback(
		(id: string): TimelineItemKind => {
			if (zoomRegions.some((r) => r.id === id)) return "zoom";
			if (zoomOutRegions.some((r) => r.id === id)) return "zoom-out";
			if (trimRegions.some((r) => r.id === id)) return "trim";
			if (clipRegions.some((r) => r.id === id)) return "clip";
			if (annotationRegions.some((r) => r.id === id)) return "annotation";
			if (speedRegions.some((r) => r.id === id)) return "speed";
			if (audioRegions.some((r) => r.id === id)) return "audio";
			if (captionCues.some((c) => c.id === id)) return "caption";
			if (transitionRegions.some((r) => r.id === id)) return "transition";
			if (memeRegions.some((r) => r.id === id)) return "meme";
			return null;
		},
		[
			zoomRegions,
			zoomOutRegions,
			trimRegions,
			clipRegions,
			annotationRegions,
			speedRegions,
			audioRegions,
			captionCues,
			transitionRegions,
			memeRegions,
		],
	);

	const resolveTrackIndex = useCallback(
		(
			kind: "annotation" | "audio" | "transition" | "meme",
			id: string,
			rowId?: string,
		): number => {
			switch (kind) {
				case "annotation":
					return rowId && isAnnotationTrackRowId(rowId)
						? getAnnotationTrackIndex(rowId)
						: (annotationRegions.find((region) => region.id === id)?.trackIndex ?? 0);
				case "transition":
					return rowId && isTransitionTrackRowId(rowId)
						? getTransitionTrackIndex(rowId)
						: (transitionRegions.find((region) => region.id === id)?.trackIndex ?? 0);
				case "meme":
					return rowId && isMemeTrackRowId(rowId)
						? getMemeTrackIndex(rowId)
						: (memeRegions.find((region) => region.id === id)?.trackIndex ?? 0);
				default:
					return rowId && isAudioTrackRowId(rowId)
						? getAudioTrackIndex(rowId)
						: (audioRegions.find((region) => region.id === id)?.trackIndex ?? 0);
			}
		},
		[annotationRegions, audioRegions, transitionRegions, memeRegions],
	);

	const hasOverlap = useCallback(
		(newSpan: Span, excludeId?: string, rowId?: string): boolean => {
			if (!excludeId) return false;
			const itemKind = resolveItemKind(excludeId);

			if (itemKind === "annotation") return false;

			const checkOverlap = (regions: { id: string; startMs: number; endMs: number }[]) =>
				regions.some((region) => {
					if (region.id === excludeId) return false;
					return spansOverlap(newSpan, { start: region.startMs, end: region.endMs });
				});

			if (itemKind === "zoom") return checkOverlap(zoomRegions);
			if (itemKind === "zoom-out") return checkOverlap(zoomOutRegions);
			if (itemKind === "trim") return checkOverlap(trimRegions);
			if (itemKind === "clip") return checkOverlap(clipRegions);
			if (itemKind === "speed") return checkOverlap(speedRegions);
			// Captions share a single lane and must never overlap, so validate a dragged or
			// resized caption against the other cues just like the other timeline items.
			if (itemKind === "caption") return checkOverlap(captionCues);

			if (itemKind === "audio") {
				const activeTrackIndex = resolveTrackIndex("audio", excludeId, rowId);
				return checkOverlap(
					audioRegions.filter((region) => (region.trackIndex ?? 0) === activeTrackIndex),
				);
			}

			if (itemKind === "transition") {
				const activeTrackIndex = resolveTrackIndex("transition", excludeId, rowId);
				return checkOverlap(
					transitionRegions.filter(
						(region) => (region.trackIndex ?? 0) === activeTrackIndex,
					),
				);
			}

			if (itemKind === "meme") {
				const activeTrackIndex = resolveTrackIndex("meme", excludeId, rowId);
				return checkOverlap(
					memeRegions.filter((region) => (region.trackIndex ?? 0) === activeTrackIndex),
				);
			}

			return false;
		},
		[
			resolveItemKind,
			resolveTrackIndex,
			zoomRegions,
			zoomOutRegions,
			trimRegions,
			clipRegions,
			audioRegions,
			speedRegions,
			captionCues,
			transitionRegions,
			memeRegions,
		],
	);

	const timelineItems = useMemo<TimelineRenderItem[]>(
		() =>
			buildTimelineItems({
				zoomRegions,
				zoomOutRegions,
				clipRegions,
				annotationRegions,
				audioRegions,
				captionCues,
				keystrokes,
				transitionRegions,
				memeRegions,
			}),
		[
			zoomRegions,
			zoomOutRegions,
			clipRegions,
			annotationRegions,
			audioRegions,
			captionCues,
			keystrokes,
			transitionRegions,
			memeRegions,
		],
	);

	const allRegionSpans = useMemo(
		() =>
			buildAllRegionSpans({
				zoomRegions,
				zoomOutRegions,
				clipRegions,
				audioRegions,
				transitionRegions,
				memeRegions,
			}),
		[zoomRegions, zoomOutRegions, clipRegions, audioRegions, transitionRegions, memeRegions],
	);

	const getResolvedDropRowId = useCallback(
		(id: string, proposedRowId: string) => resolveDropRowId(id, proposedRowId, timelineItems),
		[timelineItems],
	);

	const handleItemSpanChange = useCallback(
		(id: string, span: Span, rowId?: string) => {
			const itemKind = resolveItemKind(id);
			if (itemKind === "zoom") {
				onZoomSpanChange(id, span);
			} else if (itemKind === "zoom-out") {
				onZoomOutSpanChange?.(id, span);
			} else if (itemKind === "trim") {
				onTrimSpanChange?.(id, span);
			} else if (itemKind === "clip") {
				onClipSpanChange?.(id, span);
			} else if (itemKind === "annotation") {
				const nextTrackIndex = resolveTrackIndex("annotation", id, rowId);
				onAnnotationSpanChange?.(id, span, nextTrackIndex);
			} else if (itemKind === "speed") {
				onSpeedSpanChange?.(id, span);
			} else if (itemKind === "audio") {
				const nextTrackIndex = resolveTrackIndex("audio", id, rowId);
				onAudioSpanChange?.(id, span, nextTrackIndex);
			} else if (itemKind === "caption") {
				onCaptionSpanChange?.(id, span);
			} else if (itemKind === "transition") {
				const nextTrackIndex = resolveTrackIndex("transition", id, rowId);
				onTransitionSpanChange?.(id, span, nextTrackIndex);
			} else if (itemKind === "meme") {
				const nextTrackIndex = resolveTrackIndex("meme", id, rowId);
				onMemeSpanChange?.(id, span, nextTrackIndex);
			}
		},
		[
			resolveItemKind,
			resolveTrackIndex,
			onZoomSpanChange,
			onZoomOutSpanChange,
			onTrimSpanChange,
			onClipSpanChange,
			onAnnotationSpanChange,
			onSpeedSpanChange,
			onAudioSpanChange,
			onCaptionSpanChange,
			onTransitionSpanChange,
			onMemeSpanChange,
		],
	);

	return {
		hasOverlap,
		timelineItems,
		allRegionSpans,
		getResolvedDropRowId,
		handleItemSpanChange,
	};
}
