import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";
import { useCallback } from "react";
import { toast } from "sonner";
import type { useI18n } from "@/contexts/I18nContext";
import type { useShortcuts } from "@/contexts/ShortcutsContext";
import { useVideoEditorAudio } from "../audio/useVideoEditorAudio";
import type { useAppearanceState } from "../state/useAppearanceState";
import type { useTimelineState } from "../state/useTimelineState";
import type { TimelineEditorHandle } from "../timeline/TimelineEditor";
import type { EditorEffectSection } from "../types";
import type { VideoPlaybackRef } from "../VideoPlayback";
import { getErrorMessage, summarizeErrorMessage } from "../videoEditorUtils";
import { useAnnotationRegionCommands } from "./useAnnotationRegionCommands";
import { useAudioRegionCommands } from "./useAudioRegionCommands";
import { useCaptionCommands } from "./useCaptionCommands";
import { useClipRegionCommands } from "./useClipRegionCommands";
import { useCursorTelemetry } from "./useCursorTelemetry";
import { useEditorGlobalInteractions } from "./useEditorGlobalInteractions";
import { useEditorPlaybackControls } from "./useEditorPlaybackControls";
import { useFreshRecordingAutoZoom } from "./useFreshRecordingAutoZoom";
import { useKeystrokeTelemetry } from "./useKeystrokeTelemetry";
import { type AddMemeParams, useMemeRegionCommands } from "./useMemeRegionCommands";
import { useTimelineProjection } from "./useTimelineProjection";
import {
	type AddTransitionParams,
	useTransitionRegionCommands,
} from "./useTransitionRegionCommands";
import { useZoomOutRegionCommands } from "./useZoomOutRegionCommands";
import { useZoomRegionCommands } from "./useZoomRegionCommands";

const DEFAULT_SOUND_DURATION_MS = 3000;

type Input = {
	t: ReturnType<typeof useI18n>["t"];
	shortcuts: ReturnType<typeof useShortcuts>["shortcuts"];
	isMac: boolean;
	appPlatform: string;
	timeline: ReturnType<typeof useTimelineState>;
	appearance: ReturnType<typeof useAppearanceState>;
	videoPath: string | null;
	videoSourcePath: string | null;
	currentSourcePath: string | null;
	duration: number;
	currentTime: number;
	isPlaying: boolean;
	previewVolume: number;
	loading: boolean;
	isPreviewReady: boolean;
	setActiveEffectSection: Dispatch<SetStateAction<EditorEffectSection>>;
	setAutoSuggestZoomsTrigger: Dispatch<SetStateAction<number>>;
	videoPlaybackRef: RefObject<VideoPlaybackRef>;
	timelineRef: RefObject<TimelineEditorHandle>;
	nextZoomIdRef: MutableRefObject<number>;
	nextZoomOutIdRef: MutableRefObject<number>;
	nextClipIdRef: MutableRefObject<number>;
	nextAudioIdRef: MutableRefObject<number>;
	nextAnnotationIdRef: MutableRefObject<number>;
	nextAnnotationZIndexRef: MutableRefObject<number>;
	clipInitializedRef: MutableRefObject<boolean>;
	autoFullTrackClipIdRef: MutableRefObject<string | null>;
	autoFullTrackClipEndMsRef: MutableRefObject<number | null>;
	autoSuggestedVideoPathRef: MutableRefObject<string | null>;
	pendingFreshRecordingAutoZoomPathRef: MutableRefObject<string | null>;
	pendingFreshRecordingAutoSuggestTimeoutRef: MutableRefObject<number | null>;
	pendingFreshRecordingAutoSuggestTelemetryCountRef: MutableRefObject<number>;
	handleUndo: () => void;
	handleRedo: () => void;
};

export function useTimelineEditingController(input: Input) {
	const { timeline } = input;
	const handleSourceFallbackLoadError = useCallback((error: unknown) => {
		toast.warning(
			`Could not load companion audio source: ${summarizeErrorMessage(getErrorMessage(error))}`,
			{ duration: 10000 },
		);
	}, []);
	const cursor = useCursorTelemetry({
		videoPath: input.videoPath,
		videoSourcePath: input.videoSourcePath,
		duration: input.duration,
		loopCursor: input.appearance.loopCursor,
		timeline,
		pendingFreshRecordingAutoZoomPathRef: input.pendingFreshRecordingAutoZoomPathRef,
		autoSuggestedVideoPathRef: input.autoSuggestedVideoPathRef,
	});
	const keystrokes = useKeystrokeTelemetry({
		videoPath: input.videoPath,
		videoSourcePath: input.videoSourcePath,
		timeline,
	});
	const projection = useTimelineProjection({
		timeline,
		duration: input.duration,
		currentTime: input.currentTime,
		nextClipIdRef: input.nextClipIdRef,
		initializedRef: input.clipInitializedRef,
		autoFullTrackIdRef: input.autoFullTrackClipIdRef,
		autoFullTrackEndRef: input.autoFullTrackClipEndMsRef,
	});
	const audio = useVideoEditorAudio({
		currentSourcePath: input.currentSourcePath,
		selectedClipId: timeline.selectedClipId,
		clipRegions: timeline.clipRegions,
		audioRegions: timeline.audioRegions,
		sourceAudioTrackSettingsByClip: timeline.sourceAudioTrackSettingsByClip,
		setSourceAudioTrackSettingsByClip: timeline.setSourceAudioTrackSettingsByClip,
		defaultSourceAudioTrackSettings: timeline.defaultSourceAudioTrackSettings,
		setDefaultSourceAudioTrackSettings: timeline.setDefaultSourceAudioTrackSettings,
		timelineTime: projection.timelinePlayheadTime,
		currentTime: projection.mapTimelineTimeToSourceTime(input.currentTime * 1000) / 1000,
		duration: input.duration,
		isPlaying: input.isPlaying,
		previewVolume: input.previewVolume,
		sourceAudioFallbackRefreshKey: timeline.sourceAudioFallbackRefreshKey,
		summarizeErrorMessage,
		onSourceFallbackLoadError: handleSourceFallbackLoadError,
	});
	const playback = useEditorPlaybackControls({
		videoPlaybackRef: input.videoPlaybackRef,
		timelineRef: input.timelineRef,
		playSourceAudioPreview: audio.playSourceAudioPreview,
		timelinePlayheadTime: projection.timelinePlayheadTime,
		timelineDuration: projection.timelineDuration,
	});
	const captionCommands = useCaptionCommands({
		clipRegions: timeline.clipRegions,
		autoCaptions: timeline.autoCaptions,
		setAutoCaptions: timeline.setAutoCaptions,
		setAutoCaptionSettings: timeline.setAutoCaptionSettings,
		setSelectedCaptionId: timeline.setSelectedCaptionId,
		setSelectedZoomId: timeline.setSelectedZoomId,
		setSelectedClipId: timeline.setSelectedClipId,
		setSelectedAnnotationId: timeline.setSelectedAnnotationId,
		setSelectedAudioId: timeline.setSelectedAudioId,
		setActiveEffectSection: input.setActiveEffectSection,
		videoPlaybackRef: input.videoPlaybackRef,
		mapSourceTimeToTimelineTime: projection.mapSourceTimeToTimelineTime,
		handleSeek: playback.handleSeek,
	});
	const zoomCommands = useZoomRegionCommands({
		videoPath: input.videoPath,
		setZoomRegions: timeline.setZoomRegions,
		selectedZoomId: timeline.selectedZoomId,
		setSelectedZoomId: timeline.setSelectedZoomId,
		setSelectedZoomOutId: timeline.setSelectedZoomOutId,
		setSelectedAnnotationId: timeline.setSelectedAnnotationId,
		setSelectedAudioId: timeline.setSelectedAudioId,
		setSelectedCaptionId: timeline.setSelectedCaptionId,
		setSelectedTransitionId: timeline.setSelectedTransitionId,
		setSelectedMemeId: timeline.setSelectedMemeId,
		setActiveEffectSection: input.setActiveEffectSection,
		nextZoomIdRef: input.nextZoomIdRef,
		autoSuggestedVideoPathRef: input.autoSuggestedVideoPathRef,
		pendingFreshRecordingAutoZoomPathRef: input.pendingFreshRecordingAutoZoomPathRef,
	});
	const zoomOutCommands = useZoomOutRegionCommands({
		setZoomOutRegions: timeline.setZoomOutRegions,
		selectedZoomOutId: timeline.selectedZoomOutId,
		setSelectedZoomOutId: timeline.setSelectedZoomOutId,
		setSelectedZoomId: timeline.setSelectedZoomId,
		setSelectedAnnotationId: timeline.setSelectedAnnotationId,
		setSelectedAudioId: timeline.setSelectedAudioId,
		setSelectedCaptionId: timeline.setSelectedCaptionId,
		setSelectedTransitionId: timeline.setSelectedTransitionId,
		setSelectedMemeId: timeline.setSelectedMemeId,
		nextZoomOutIdRef: input.nextZoomOutIdRef,
	});
	const handleSelectAnnotation = useCallback(
		(id: string | null) => {
			timeline.setSelectedAnnotationId(id);
			if (id) {
				timeline.setSelectedZoomId(null);
				timeline.setSelectedZoomOutId(null);
				timeline.setSelectedAudioId(null);
				timeline.setSelectedCaptionId(null);
				timeline.setSelectedTransitionId(null);
				timeline.setSelectedMemeId(null);
			}
		},
		[
			timeline.setSelectedAnnotationId,
			timeline.setSelectedZoomId,
			timeline.setSelectedZoomOutId,
			timeline.setSelectedAudioId,
			timeline.setSelectedCaptionId,
			timeline.setSelectedTransitionId,
			timeline.setSelectedMemeId,
		],
	);
	const freshZoom = useFreshRecordingAutoZoom({
		appPlatform: input.appPlatform,
		videoPath: input.videoPath,
		loading: input.loading,
		isPreviewReady: input.isPreviewReady,
		duration: input.duration,
		cursorTelemetryCount: timeline.cursorTelemetry.length,
		normalizedCursorTelemetry: cursor.normalizedCursorTelemetry,
		zoomRegions: timeline.zoomRegions,
		setZoomRegions: timeline.setZoomRegions,
		setAutoSuggestZoomsTrigger: input.setAutoSuggestZoomsTrigger,
		videoPlaybackRef: input.videoPlaybackRef,
		autoSuggestedVideoPathRef: input.autoSuggestedVideoPathRef,
		pendingFreshRecordingAutoZoomPathRef: input.pendingFreshRecordingAutoZoomPathRef,
		pendingFreshRecordingAutoSuggestTimeoutRef:
			input.pendingFreshRecordingAutoSuggestTimeoutRef,
		pendingFreshRecordingAutoSuggestTelemetryCountRef:
			input.pendingFreshRecordingAutoSuggestTelemetryCountRef,
	});
	const clipCommands = useClipRegionCommands({
		sourceDurationMs: input.duration * 1000,
		clipRegions: timeline.clipRegions,
		setClipRegions: timeline.setClipRegions,
		zoomRegions: timeline.zoomRegions,
		setZoomRegions: timeline.setZoomRegions,
		selectedClipId: timeline.selectedClipId,
		setSelectedClipId: timeline.setSelectedClipId,
		setSelectedZoomId: timeline.setSelectedZoomId,
		setSelectedAnnotationId: timeline.setSelectedAnnotationId,
		setSelectedAudioId: timeline.setSelectedAudioId,
		setSelectedCaptionId: timeline.setSelectedCaptionId,
		setSelectedTransitionId: timeline.setSelectedTransitionId,
		setSelectedMemeId: timeline.setSelectedMemeId,
		setActiveEffectSection: input.setActiveEffectSection,
		nextClipIdRef: input.nextClipIdRef,
		t: input.t,
	});
	const audioCommands = useAudioRegionCommands({
		setAudioRegions: timeline.setAudioRegions,
		selectedAudioId: timeline.selectedAudioId,
		setSelectedAudioId: timeline.setSelectedAudioId,
		setSelectedZoomId: timeline.setSelectedZoomId,
		setSelectedAnnotationId: timeline.setSelectedAnnotationId,
		setSelectedCaptionId: timeline.setSelectedCaptionId,
		setSelectedTransitionId: timeline.setSelectedTransitionId,
		setSelectedMemeId: timeline.setSelectedMemeId,
		setActiveEffectSection: input.setActiveEffectSection,
		nextAudioIdRef: input.nextAudioIdRef,
	});
	const transitionCommands = useTransitionRegionCommands({
		setTransitionRegions: timeline.setTransitionRegions,
		selectedTransitionId: timeline.selectedTransitionId,
		setSelectedTransitionId: timeline.setSelectedTransitionId,
		setSelectedZoomId: timeline.setSelectedZoomId,
		setSelectedClipId: timeline.setSelectedClipId,
		setSelectedAnnotationId: timeline.setSelectedAnnotationId,
		setSelectedAudioId: timeline.setSelectedAudioId,
		setSelectedCaptionId: timeline.setSelectedCaptionId,
		setSelectedMemeId: timeline.setSelectedMemeId,
		setActiveEffectSection: input.setActiveEffectSection,
	});
	const memeCommands = useMemeRegionCommands({
		setMemeRegions: timeline.setMemeRegions,
		selectedMemeId: timeline.selectedMemeId,
		setSelectedMemeId: timeline.setSelectedMemeId,
		setSelectedZoomId: timeline.setSelectedZoomId,
		setSelectedClipId: timeline.setSelectedClipId,
		setSelectedAnnotationId: timeline.setSelectedAnnotationId,
		setSelectedAudioId: timeline.setSelectedAudioId,
		setSelectedCaptionId: timeline.setSelectedCaptionId,
		setSelectedTransitionId: timeline.setSelectedTransitionId,
		setActiveEffectSection: input.setActiveEffectSection,
	});
	const annotationCommands = useAnnotationRegionCommands({
		setAnnotationRegions: timeline.setAnnotationRegions,
		selectedAnnotationId: timeline.selectedAnnotationId,
		setSelectedAnnotationId: timeline.setSelectedAnnotationId,
		setSelectedZoomId: timeline.setSelectedZoomId,
		nextAnnotationIdRef: input.nextAnnotationIdRef,
		nextAnnotationZIndexRef: input.nextAnnotationZIndexRef,
	});

	const timelineTotalMs = Math.max(0, Math.round(projection.timelineDuration * 1000));
	const timelinePlayheadMs = Math.round(projection.timelinePlayheadTime * 1000);

	const handleAddTransitionAtPlayhead = useCallback(
		(params: Omit<AddTransitionParams, "startMs" | "totalMs">) => {
			if (!timelineTotalMs) return;
			let startMs = timelinePlayheadMs;
			const durationMs = params.durationMs ?? 1000;
			// If playhead is near a clip split / boundary, center the transition over the cut
			const cuts: number[] = [];
			for (const clip of timeline.clipRegions) {
				cuts.push(clip.startMs, clip.endMs);
			}
			const nearestCut = cuts.find(
				(cut) => cut > 0 && cut < timelineTotalMs && Math.abs(cut - timelinePlayheadMs) <= Math.max(1500, durationMs),
			);
			if (nearestCut !== undefined) {
				startMs = Math.max(0, Math.round(nearestCut - durationMs / 2));
			}

			transitionCommands.handleAddTransition({
				...params,
				startMs,
				totalMs: timelineTotalMs,
			});
		},
		[timelineTotalMs, timelinePlayheadMs, transitionCommands, timeline.clipRegions],
	);

	const handleAddMemeAtPlayhead = useCallback(
		(params: Omit<AddMemeParams, "startMs" | "totalMs">) => {
			if (!timelineTotalMs) return;
			memeCommands.handleAddMeme({
				...params,
				startMs: timelinePlayheadMs,
				totalMs: timelineTotalMs,
			});
		},
		[timelineTotalMs, timelinePlayheadMs, memeCommands],
	);

	const handleAddSound = useCallback(
		(sound: {
			filePath: string;
			name?: string;
			category?: string;
			durationMs?: number;
		}) => {
			if (!timelineTotalMs) return;
			const durationMs = Math.max(1, Math.round(sound.durationMs ?? DEFAULT_SOUND_DURATION_MS));
			const start = Math.max(0, Math.min(timelinePlayheadMs, timelineTotalMs - 1));
			const end = Math.min(start + durationMs, timelineTotalMs);
			if (end <= start) return;

			// Place the sound on the first audio track that is free for this span.
			let trackIndex = 0;
			while (
				timeline.audioRegions.some(
					(region) =>
						(region.trackIndex ?? 0) === trackIndex &&
						region.startMs < end &&
						region.endMs > start,
				)
			) {
				trackIndex += 1;
			}

			audioCommands.handleAudioAdded(
				{ start, end },
				sound.filePath,
				trackIndex,
				{ label: sound.name, category: sound.category },
			);
		},
		[
			audioCommands,
			timeline.audioRegions,
			timelineTotalMs,
			timelinePlayheadMs,
		],
	);

	useEditorGlobalInteractions({
		timeline,
		videoPlaybackRef: input.videoPlaybackRef,
		shortcuts: input.shortcuts,
		isMac: input.isMac,
		handleUndo: input.handleUndo,
		handleRedo: input.handleRedo,
		startPlayback: playback.startPlayback,
	});

	return {
		cursor,
		projection,
		audio,
		playback,
		captionCommands,
		zoomCommands,
		zoomOutCommands,
		clipCommands,
		audioCommands,
		transitionCommands,
		memeCommands,
		annotationCommands,
		keystrokes,
		handleSelectAnnotation,
		handleAddSound,
		handleAddTransitionAtPlayhead,
		handleAddMemeAtPlayhead,
		handleAutoSuggestZoomsConsumed: freshZoom.handleAutoSuggestZoomsConsumed,
	};
}
