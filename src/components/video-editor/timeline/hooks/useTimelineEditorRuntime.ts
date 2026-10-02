import type { Span } from "dnd-timeline";
import type { ForwardedRef, RefObject } from "react";
import { useCallback, useImperativeHandle } from "react";
import type {
	AnnotationRegion,
	AnnotationType,
	AudioRegion,
	CaptionCue,
	ClipRegion,
	CursorTelemetryPoint,
	KeystrokeEvent,
	MemeRegion,
	SpeedRegion,
	TransitionRegion,
	TrimRegion,
	ZoomFocus,
	ZoomOutRegion,
	ZoomRegion,
} from "../../types";
import type { TimelineShortcutBindings } from "../core/timelineTypes";
import type { TimelineEditorHandle } from "../TimelineEditor";
import { useTimelineAudioActions } from "./actions/useTimelineAudioActions";
import { useTimelineCaptionActions } from "./actions/useTimelineCaptionActions";
import { useTimelineZoomActions } from "./actions/useTimelineZoomActions";
import { useTimelineDndBindings } from "./useTimelineDndBindings";
import { useTimelineKeyboardShortcuts } from "./useTimelineKeyboardShortcuts";
import { useTimelineNormalization } from "./useTimelineNormalization";
import { useTimelineSelection } from "./useTimelineSelection";
import { timelineNotifications } from "./utils/timelineNotifications";

interface UseTimelineEditorRuntimeParams {
	ref: ForwardedRef<TimelineEditorHandle>;
	videoDuration: number;
	totalMs: number;
	currentTimeMs: number;
	safeMinDurationMs: number;
	cursorTelemetry: CursorTelemetryPoint[];
	autoSuggestZoomsTrigger: number;
	onAutoSuggestZoomsConsumed?: () => void;
	disableSuggestedZooms: boolean;
	zoomRegions: ZoomRegion[];
	zoomOutRegions?: ZoomOutRegion[];
	onZoomAdded: (span: Span) => void;
	onZoomOutAdded?: (span: Span) => void;
	onZoomSuggested?: (span: Span, focus: ZoomFocus) => void;
	onZoomSpanChange: (id: string, span: Span) => void;
	onZoomOutSpanChange?: (id: string, span: Span) => void;
	onZoomDelete: (id: string) => void;
	onZoomOutDelete?: (id: string) => void;
	selectedZoomId: string | null;
	selectedZoomOutId?: string | null;
	onSelectZoom: (id: string | null) => void;
	onSelectZoomOut?: (id: string | null) => void;
	trimRegions: TrimRegion[];
	onTrimSpanChange?: (id: string, span: Span) => void;
	clipRegions: ClipRegion[];
	onClipSplit?: (splitMs: number) => void;
	onClipSpanChange?: (id: string, span: Span) => void;
	onClipDelete?: (id: string) => void;
	selectedClipId?: string | null;
	onSelectClip?: (id: string | null) => void;
	annotationRegions: AnnotationRegion[];
	onAnnotationAdded?: (span: Span, trackIndex?: number, initialType?: AnnotationType) => void;
	onAnnotationSpanChange?: (id: string, span: Span, trackIndex?: number) => void;
	onAnnotationDelete?: (id: string) => void;
	selectedAnnotationId?: string | null;
	onSelectAnnotation?: (id: string | null) => void;
	speedRegions: SpeedRegion[];
	onSpeedSpanChange?: (id: string, span: Span) => void;
	audioRegions: AudioRegion[];
	onAudioAdded?: (span: Span, audioPath: string, trackIndex?: number) => void;
	onAudioSpanChange?: (id: string, span: Span, trackIndex?: number) => void;
	onAudioDelete?: (id: string) => void;
	onSuggestSfx?: () => void;
	selectedAudioId?: string | null;
	onSelectAudio?: (id: string | null) => void;
	transitionRegions: TransitionRegion[];
	onTransitionSpanChange?: (id: string, span: Span, trackIndex?: number) => void;
	onTransitionDelete?: (id: string) => void;
	selectedTransitionId?: string | null;
	onSelectTransition?: (id: string | null) => void;
	memeRegions: MemeRegion[];
	onMemeSpanChange?: (id: string, span: Span, trackIndex?: number) => void;
	onMemeDelete?: (id: string) => void;
	selectedMemeId?: string | null;
	onSelectMeme?: (id: string | null) => void;
	captionCues: CaptionCue[];
	keystrokes: KeystrokeEvent[];
	onCaptionSpanChange?: (id: string, span: Span) => void;
	onCaptionDelete?: (id: string) => void;
	onCaptionAdded?: (span: Span) => void;
	selectedCaptionId?: string | null;
	onSelectCaption?: (id: string | null) => void;
	isMac: boolean;
	keyShortcuts: TimelineShortcutBindings;
	isTimelineFocusedRef: RefObject<boolean>;
}

export function useTimelineEditorRuntime({
	ref,
	videoDuration,
	totalMs,
	currentTimeMs,
	safeMinDurationMs,
	cursorTelemetry,
	autoSuggestZoomsTrigger,
	onAutoSuggestZoomsConsumed,
	disableSuggestedZooms,
	zoomRegions,
	zoomOutRegions = [],
	onZoomAdded,
	onZoomOutAdded,
	onZoomSuggested,
	onZoomSpanChange,
	onZoomOutSpanChange,
	onZoomDelete,
	onZoomOutDelete,
	selectedZoomId,
	selectedZoomOutId,
	onSelectZoom,
	onSelectZoomOut,
	trimRegions,
	onTrimSpanChange,
	clipRegions,
	onClipSplit,
	onClipSpanChange,
	onClipDelete,
	selectedClipId,
	onSelectClip,
	annotationRegions,
	onAnnotationAdded,
	onAnnotationSpanChange,
	onAnnotationDelete,
	selectedAnnotationId,
	onSelectAnnotation,
	speedRegions,
	onSpeedSpanChange,
	audioRegions,
	onAudioAdded,
	onAudioSpanChange,
	onAudioDelete,
	onSuggestSfx,
	selectedAudioId,
	onSelectAudio,
	transitionRegions,
	onTransitionSpanChange,
	onTransitionDelete,
	selectedTransitionId,
	onSelectTransition,
	memeRegions,
	onMemeSpanChange,
	onMemeDelete,
	selectedMemeId,
	onSelectMeme,
	captionCues,
	keystrokes,
	onCaptionSpanChange,
	onCaptionDelete,
	onCaptionAdded,
	selectedCaptionId,
	onSelectCaption,
	isMac,
	keyShortcuts,
	isTimelineFocusedRef,
}: UseTimelineEditorRuntimeParams) {
	const {
		keyframes,
		selectedKeyframeId,
		setSelectedKeyframeId,
		selectAllBlocksActive,
		setSelectAllBlocksActive,
		hasAnyZoomBlocks,
		activateSelectAllZooms,
		addKeyframe,
		deleteSelectedKeyframe,
		handleKeyframeMove,
		deleteSelectedZoom,
		deleteSelectedZoomOut,
		deleteSelectedClip,
		deleteSelectedAnnotation,
		deleteSelectedAudio,
		deleteSelectedCaption,
		deleteSelectedTransition,
		deleteSelectedMeme,
		clearSelectedBlocks,
		handleSelectZoom,
		handleSelectZoomOut,
		handleSelectClip,
		handleSelectAnnotation,
		handleSelectAudio,
		handleSelectCaption,
		handleSelectTransition,
		handleSelectMeme,
		cycleAnnotationsAtCurrentTime,
	} = useTimelineSelection({
		totalMs,
		currentTimeMs,
		zoomRegions,
		zoomOutRegions,
		clipRegions,
		annotationRegions,
		audioRegions,
		selectedZoomId,
		selectedZoomOutId,
		selectedClipId,
		selectedAnnotationId,
		selectedAudioId,
		selectedCaptionId,
		selectedTransitionId,
		selectedMemeId,
		onZoomDelete,
		onZoomOutDelete,
		onClipDelete,
		onAnnotationDelete,
		onAudioDelete,
		onCaptionDelete,
		onTransitionDelete,
		onMemeDelete,
		onSelectZoom,
		onSelectZoomOut,
		onSelectClip,
		onSelectAnnotation,
		onSelectAudio,
		onSelectCaption,
		onSelectTransition,
		onSelectMeme,
	});

	useTimelineNormalization({
		totalMs,
		safeMinDurationMs,
		zoomRegions,
		zoomOutRegions,
		trimRegions,
		speedRegions,
		audioRegions,
		transitionRegions,
		memeRegions,
		onZoomSpanChange,
		onZoomOutSpanChange,
		onTrimSpanChange,
		onSpeedSpanChange,
		onAudioSpanChange,
		onTransitionSpanChange,
		onMemeSpanChange,
	});

	const {
		hasOverlap,
		timelineItems,
		allRegionSpans,
		getResolvedDropRowId,
		handleItemSpanChange,
	} = useTimelineDndBindings({
		zoomRegions,
		zoomOutRegions,
		trimRegions,
		clipRegions,
		annotationRegions,
		speedRegions,
		audioRegions,
		captionCues,
		keystrokes,
		transitionRegions,
		memeRegions,
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
	});

	const {
		defaultRegionDurationMs,
		canPlaceZoomAtMs,
		addZoomAtMs,
		handleAddZoom,
		handleSuggestZooms,
	} = useTimelineZoomActions({
		timeline: { videoDuration, totalMs, currentTimeMs },
		regions: { zoom: zoomRegions, clip: clipRegions },
		cursorTelemetry,
		options: { disableSuggestedZooms },
		autoSuggestZoomsTrigger,
		onAutoSuggestZoomsConsumed,
		onZoomAdded,
		onZoomSuggested,
	});

	const { canPlaceCaptionAtMs, addCaptionAtMs, resolveCaptionSpanAtMs } =
		useTimelineCaptionActions({
			totalMs,
			captionRegions: captionCues,
			onCaptionAdded,
		});

	const handleSplitClip = useCallback(() => {
		if (!videoDuration || videoDuration === 0 || totalMs === 0 || !onClipSplit) {
			return;
		}
		onClipSplit(currentTimeMs);
	}, [videoDuration, totalMs, currentTimeMs, onClipSplit]);

	const { handleAddAudio } = useTimelineAudioActions({
		timeline: { videoDuration, totalMs, currentTimeMs },
		regions: { audio: audioRegions },
		onAudioAdded,
	});

	const handleAddAnnotation = useCallback(
		(trackIndex = 0) => {
			if (!videoDuration || videoDuration === 0 || totalMs === 0 || !onAnnotationAdded) {
				return;
			}

			const defaultDuration = Math.min(defaultRegionDurationMs, totalMs);
			if (defaultDuration <= 0) {
				return;
			}

			const latestStartPos = Math.max(0, totalMs - defaultDuration);
			const startPos = Math.max(0, Math.min(currentTimeMs, latestStartPos));
			const endPos = Math.min(startPos + defaultDuration, totalMs);
			onAnnotationAdded({ start: startPos, end: endPos }, trackIndex);
		},
		[videoDuration, totalMs, currentTimeMs, defaultRegionDurationMs, onAnnotationAdded],
	);

	const handleAddHighlight = useCallback(
		(trackIndex = 0) => {
			if (!videoDuration || videoDuration === 0 || totalMs === 0 || !onAnnotationAdded) {
				return;
			}

			const defaultDuration = Math.min(defaultRegionDurationMs, totalMs);
			if (defaultDuration <= 0) {
				return;
			}

			const latestStartPos = Math.max(0, totalMs - defaultDuration);
			const startPos = Math.max(0, Math.min(currentTimeMs, latestStartPos));
			const endPos = Math.min(startPos + defaultDuration, totalMs);
			onAnnotationAdded({ start: startPos, end: endPos }, trackIndex, "highlight");
		},
		[videoDuration, totalMs, currentTimeMs, defaultRegionDurationMs, onAnnotationAdded],
	);

	const canPlaceZoomOutAtMs = useCallback(
		(startMs: number) => {
			if (!videoDuration || videoDuration === 0 || totalMs === 0) {
				return false;
			}

			const defaultDuration = Math.min(defaultRegionDurationMs, totalMs);
			if (defaultDuration <= 0) {
				return false;
			}

			const startPos = Math.max(0, Math.min(startMs, totalMs));
			const activeClip =
				clipRegions.length === 0
					? { startMs: 0, endMs: totalMs }
					: clipRegions.find((clip) => startPos >= clip.startMs && startPos < clip.endMs);
			if (!activeClip) {
				return false;
			}

			const sorted = [...zoomOutRegions].sort((a, b) => a.startMs - b.startMs);
			const nextRegion = sorted.find((region) => region.startMs > startPos);
			const gapToNextClipEdge = activeClip.endMs - startPos;
			const gapToNextRegion = nextRegion ? nextRegion.startMs - startPos : gapToNextClipEdge;
			const availableDuration = Math.min(gapToNextClipEdge, gapToNextRegion);

			const isOverlapping = sorted.some(
				(region) => startPos >= region.startMs && startPos < region.endMs,
			);

			return !isOverlapping && availableDuration >= defaultDuration;
		},
		[videoDuration, totalMs, defaultRegionDurationMs, clipRegions, zoomOutRegions],
	);

	const addZoomOutAtMs = useCallback(
		(startMs: number) => {
			if (!videoDuration || videoDuration === 0 || totalMs === 0 || !onZoomOutAdded) {
				return;
			}

			const defaultDuration = Math.min(defaultRegionDurationMs, totalMs);
			if (defaultDuration <= 0) {
				return;
			}

			const startPos = Math.max(0, Math.min(startMs, totalMs));
			if (!canPlaceZoomOutAtMs(startPos)) {
				timelineNotifications.error(
					"Cannot place zoom out here",
					"Zoom out block already exists here or there is not enough room before the next block.",
				);
				return;
			}

			onZoomOutAdded({ start: startPos, end: startPos + defaultDuration });
		},
		[videoDuration, totalMs, defaultRegionDurationMs, canPlaceZoomOutAtMs, onZoomOutAdded],
	);

	const handleAddZoomOut = useCallback(() => {
		if (!videoDuration || videoDuration === 0 || totalMs === 0) {
			return;
		}

		addZoomOutAtMs(currentTimeMs);
	}, [videoDuration, totalMs, currentTimeMs, addZoomOutAtMs]);

	useTimelineKeyboardShortcuts({
		isMac,
		keyShortcuts,
		isTimelineFocusedRef,
		hasAnyZoomBlocks,
		activateSelectAllZooms,
		annotationCount: annotationRegions.length,
		selectedKeyframeId,
		selectedZoomId,
		selectedZoomOutId,
		selectedClipId,
		selectedAnnotationId,
		selectedAudioId,
		selectedCaptionId,
		selectedTransitionId,
		selectedMemeId,
		selectAllBlocksActive,
		addKeyframe,
		handleAddZoom,
		handleSplitClip,
		handleAddAnnotation: () => handleAddAnnotation(),
		deleteSelectedKeyframe,
		deleteSelectedZoom,
		deleteSelectedZoomOut,
		deleteSelectedClip,
		deleteSelectedAnnotation,
		deleteSelectedAudio,
		deleteSelectedCaption,
		deleteSelectedTransition,
		deleteSelectedMeme,
		cycleAnnotationsAtCurrentTime,
	});

	useImperativeHandle(
		ref,
		() => ({
			addZoom: handleAddZoom,
			addZoomOut: handleAddZoomOut,
			suggestZooms: handleSuggestZooms,
			suggestSfx: onSuggestSfx,
			splitClip: handleSplitClip,
			addAnnotation: handleAddAnnotation,
			addHighlight: handleAddHighlight,
			addAudio: handleAddAudio,
			keyframes,
		}),
		[
			handleAddAnnotation,
			handleAddHighlight,
			handleAddAudio,
			handleAddZoom,
			handleAddZoomOut,
			handleSuggestZooms,
			onSuggestSfx,
			handleSplitClip,
			keyframes,
		],
	);

	return {
		keyframes,
		selectedKeyframeId,
		setSelectedKeyframeId,
		selectAllBlocksActive,
		setSelectAllBlocksActive,
		handleKeyframeMove,
		clearSelectedBlocks,
		handleSelectZoom,
		handleSelectZoomOut,
		handleSelectClip,
		handleSelectAnnotation,
		handleSelectAudio,
		handleSelectCaption,
		handleSelectTransition,
		handleSelectMeme,
		hasOverlap,
		timelineItems,
		allRegionSpans,
		getResolvedDropRowId,
		handleItemSpanChange,
		canPlaceZoomAtMs,
		addZoomAtMs,
		canPlaceZoomOutAtMs,
		addZoomOutAtMs,
		handleAddZoomOut,
		canPlaceCaptionAtMs,
		addCaptionAtMs,
		resolveCaptionSpanAtMs,
		handleAddZoom,
		handleSuggestZooms,
		handleSplitClip,
		handleAddAudio,
		handleAddAnnotation,
	};
}
