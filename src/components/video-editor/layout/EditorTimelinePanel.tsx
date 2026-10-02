import type { RefObject } from "react";
import type { useVideoEditorAudio } from "../audio/useVideoEditorAudio";
import { retimeCaptionFragment } from "../captionTimeline";
import type { useAnnotationRegionCommands } from "../hooks/useAnnotationRegionCommands";
import type { useAudioRegionCommands } from "../hooks/useAudioRegionCommands";
import type { useCaptionCommands } from "../hooks/useCaptionCommands";
import type { useClipRegionCommands } from "../hooks/useClipRegionCommands";
import type { useEditorPlaybackControls } from "../hooks/useEditorPlaybackControls";
import type { useMemeRegionCommands } from "../hooks/useMemeRegionCommands";
import type { useTimelineProjection } from "../hooks/useTimelineProjection";
import type { useTransitionRegionCommands } from "../hooks/useTransitionRegionCommands";
import type { AspectRatio } from "@/utils/aspectRatioUtils";
import type { useZoomOutRegionCommands } from "../hooks/useZoomOutRegionCommands";
import type { useZoomRegionCommands } from "../hooks/useZoomRegionCommands";
import type { useTimelineState } from "../state/useTimelineState";
import TimelineEditor, { type TimelineEditorHandle } from "../timeline/TimelineEditor";

type Props = {
	timelineRef: RefObject<TimelineEditorHandle>;
	timeline: ReturnType<typeof useTimelineState>;
	projection: ReturnType<typeof useTimelineProjection>;
	playback: ReturnType<typeof useEditorPlaybackControls>;
	audio: ReturnType<typeof useVideoEditorAudio>;
	zoomCommands: ReturnType<typeof useZoomRegionCommands>;
	zoomOutCommands: ReturnType<typeof useZoomOutRegionCommands>;
	clipCommands: ReturnType<typeof useClipRegionCommands>;
	audioCommands: ReturnType<typeof useAudioRegionCommands>;
	transitionCommands: ReturnType<typeof useTransitionRegionCommands>;
	memeCommands: ReturnType<typeof useMemeRegionCommands>;
	captionCommands: ReturnType<typeof useCaptionCommands>;
	annotationCommands: ReturnType<typeof useAnnotationRegionCommands>;
	videoPath: string | null;
	videoSourcePath: string | null;
	cursorTelemetrySourcePath: string | null;
	normalizedCursorTelemetry: ReturnType<typeof useTimelineState>["cursorTelemetry"];
	autoSuggestZoomsTrigger: number;
	handleAutoSuggestZoomsConsumed: () => void;
	disableSuggestedZooms: boolean;
	currentTime: number;
	handleSelectAnnotation: (id: string | null) => void;
	aspectRatio?: AspectRatio;
};

export function EditorTimelinePanel(props: Props) {
	const {
		timelineRef,
		timeline,
		projection,
		playback,
		audio,
		zoomCommands,
		zoomOutCommands,
		clipCommands,
		audioCommands,
		transitionCommands,
		memeCommands,
		captionCommands,
		annotationCommands,
		videoPath,
		videoSourcePath,
		cursorTelemetrySourcePath,
		normalizedCursorTelemetry,
		autoSuggestZoomsTrigger,
		handleAutoSuggestZoomsConsumed,
		disableSuggestedZooms,
		currentTime,
		handleSelectAnnotation,
		aspectRatio,
	} = props;

	return (
		<div className="flex h-full min-h-0 flex-col">
			<TimelineEditor
				ref={timelineRef}
				videoDuration={projection.timelineDuration}
				currentTime={currentTime}
				playheadTime={projection.timelinePlayheadTime}
				onSeek={playback.handleTimelineSeek}
				videoPath={videoPath}
				videoSourcePath={videoSourcePath}
				cursorTelemetrySourcePath={cursorTelemetrySourcePath}
				cursorTelemetry={normalizedCursorTelemetry}
				autoSuggestZoomsTrigger={autoSuggestZoomsTrigger}
				onAutoSuggestZoomsConsumed={handleAutoSuggestZoomsConsumed}
				disableSuggestedZooms={disableSuggestedZooms}
				aspectRatio={aspectRatio}
				zoomRegions={timeline.zoomRegions}
				onZoomAdded={zoomCommands.handleZoomAdded}
				onZoomSuggested={zoomCommands.handleZoomSuggested}
				onZoomSpanChange={zoomCommands.handleZoomSpanChange}
				onZoomDelete={zoomCommands.handleZoomDelete}
				selectedZoomId={timeline.selectedZoomId}
				onSelectZoom={zoomCommands.handleSelectZoom}
				zoomOutRegions={timeline.zoomOutRegions}
				onZoomOutAdded={zoomOutCommands.handleZoomOutAdded}
				onZoomOutSpanChange={zoomOutCommands.handleZoomOutSpanChange}
				onZoomOutDelete={zoomOutCommands.handleZoomOutDelete}
				selectedZoomOutId={timeline.selectedZoomOutId}
				onSelectZoomOut={zoomOutCommands.handleSelectZoomOut}
				trimRegions={timeline.trimRegions}
				clipRegions={timeline.clipRegions}
				onClipSplit={clipCommands.handleClipSplit}
				onClipSpanChange={clipCommands.handleClipSpanChange}
				selectedClipId={timeline.selectedClipId}
				onSelectClip={clipCommands.handleSelectClip}
				audioRegions={timeline.audioRegions}
				onAudioAdded={audioCommands.handleAudioAdded}
				onAudioSpanChange={audioCommands.handleAudioSpanChange}
				onAudioDelete={audioCommands.handleAudioDelete}
				onSuggestSfx={() =>
					audioCommands.handleGenerateCursorSfx({
						telemetry: normalizedCursorTelemetry,
						zoomRegions: timeline.zoomRegions,
						keystrokes: timeline.keystrokes,
						duration: projection.timelineDuration,
					})
				}
				selectedAudioId={timeline.selectedAudioId}
				onSelectAudio={audioCommands.handleSelectAudio}
				transitionRegions={timeline.transitionRegions}
				onApplyCutTransition={(params) =>
					transitionCommands.handleSetCutTransition({
						...params,
						totalMs: Math.round(projection.timelineDuration * 1000),
					})
				}
				onTransitionSpanChange={transitionCommands.handleTransitionSpanChange}
				onTransitionDelete={transitionCommands.handleTransitionDelete}
				selectedTransitionId={timeline.selectedTransitionId}
				onSelectTransition={transitionCommands.handleSelectTransition}
				memeRegions={timeline.memeRegions}
				onMemeSpanChange={memeCommands.handleMemeSpanChange}
				onMemeDelete={memeCommands.handleMemeDelete}
				selectedMemeId={timeline.selectedMemeId}
				onSelectMeme={memeCommands.handleSelectMeme}
				captionRegions={projection.effectiveCaptionRegions}
				keystrokes={timeline.keystrokes}
				onCaptionSpanChange={(id, span) => {
					const fragment = projection.effectiveCaptionRegions.find(
						(cue) => cue.id === id,
					);
					if (!fragment) return;
					captionCommands.handleCaptionRetime(
						fragment.sourceCueId,
						retimeCaptionFragment(fragment, span),
					);
				}}
				selectedCaptionId={
					projection.effectiveCaptionRegions.find(
						(cue) =>
							cue.sourceCueId === timeline.selectedCaptionId &&
							currentTime * 1000 >= cue.startMs &&
							currentTime * 1000 < cue.endMs,
					)?.id ?? null
				}
				onSelectCaption={(id) => {
					const fragment = projection.effectiveCaptionRegions.find(
						(cue) => cue.id === id,
					);
					captionCommands.handleSelectCaption(fragment?.sourceCueId ?? null);
					if (fragment) playback.handleTimelineSeek(fragment.startMs / 1000);
				}}
				onCaptionDelete={(id) => {
					const fragment = projection.effectiveCaptionRegions.find(
						(cue) => cue.id === id,
					);
					if (fragment) captionCommands.handleCaptionDelete(fragment.sourceCueId);
				}}
				onCaptionAdded={captionCommands.handleCaptionAdded}
				captionsEnabled={timeline.autoCaptionSettings.enabled}
				captionQuickAddEnabled={timeline.autoCaptionSettings.timelineQuickAdd}
				annotationRegions={timeline.annotationRegions}
				onAnnotationAdded={annotationCommands.handleAnnotationAdded}
				onAnnotationSpanChange={annotationCommands.handleAnnotationSpanChange}
				onAnnotationDelete={annotationCommands.handleAnnotationDelete}
				selectedAnnotationId={timeline.selectedAnnotationId}
				onSelectAnnotation={handleSelectAnnotation}
				showSourceAudioTrack={timeline.clipRegions.some((clip) => clip.showSourceAudio)}
				sourceAudioResourceVersion={timeline.sourceAudioFallbackRefreshKey}
				sourceAudioTrackSettings={audio.activeSourceAudioTrackSettings}
				getSourceAudioTrackSettingsForClip={audio.getSourceAudioTrackSettingsForClip}
				onSourceAudioAvailabilityChange={timeline.setHasClipSourceAudio}
				onSourceAudioTracksMetaChange={audio.onSourceAudioTracksMetaChange}
			/>
		</div>
	);
}
