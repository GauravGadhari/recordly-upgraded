import { formatClipSpeedLabel } from "../../clipSpeedChange";
import type {
	AnnotationRegion,
	AudioRegion,
	CaptionCue,
	ClipRegion,
	KeystrokeEvent,
	MemeRegion,
	TransitionRegion,
	ZoomOutRegion,
	ZoomRegion,
} from "../../types";
import { getClipSourceEndMs, getClipSourceStartMs } from "../../types";
import { CAPTION_ROW_ID, CLIP_ROW_ID, KEYSTROKE_ROW_ID, ZOOM_ROW_ID, ZOOM_OUT_ROW_ID } from "../core/constants";
import {
	getAnnotationTrackIndex,
	getAnnotationTrackRowId,
	getAudioTrackIndex,
	getAudioTrackRowId,
	getKeystrokeTrackRowId,
	getMemeTrackIndex,
	getMemeTrackRowId,
	getTransitionTrackIndex,
	getTransitionTrackRowId,
	isAnnotationTrackRowId,
	isAudioTrackRowId,
	isMemeTrackRowId,
	isTransitionTrackRowId,
} from "../core/rows";
import type { TimelineRegionSpan, TimelineRenderItem } from "../core/timelineTypes";

export function getAnnotationLabel(region: AnnotationRegion): string {
	if (region.type === "text") {
		const preview = region.content.trim() || "Empty text";
		return preview.length > 20 ? `${preview.substring(0, 20)}...` : preview;
	}
	if (region.type === "image") {
		return "Image";
	}
	if (region.type === "highlight") {
		const anim = region.highlightData?.animation;
		if (anim && anim !== "none") {
			return `Highlight (${anim})`;
		}
		return "Highlight";
	}
	return "Annotation";
}

export function getAudioLabel(region: AudioRegion): string {
	if (region.label && region.label.trim()) {
		return region.label.trim();
	}
	if (!region.audioPath || region.audioPath.startsWith("data:")) {
		return "Audio";
	}
	return (
		region.audioPath
			.split(/[\\/]/)
			.pop()
			?.replace(/\.[^.]+$/, "") || "Audio"
	);
}

function getCaptionLabel(cue: CaptionCue): string {
	const preview = cue.text.trim() || "Caption";
	return preview.length > 24 ? `${preview.substring(0, 24)}...` : preview;
}

export function buildTimelineItems(params: {
	zoomRegions: ZoomRegion[];
	zoomOutRegions?: ZoomOutRegion[];
	clipRegions: ClipRegion[];
	annotationRegions: AnnotationRegion[];
	audioRegions: AudioRegion[];
	captionCues?: CaptionCue[];
	keystrokes?: KeystrokeEvent[];
	transitionRegions?: TransitionRegion[];
	memeRegions?: MemeRegion[];
}): TimelineRenderItem[] {
	const {
		zoomRegions,
		zoomOutRegions = [],
		clipRegions,
		annotationRegions,
		audioRegions,
		captionCues = [],
		keystrokes = [],
		transitionRegions: _transitionRegions = [],
		memeRegions = [],
	} = params;
	const zooms: TimelineRenderItem[] = zoomRegions.map((region, index) => ({
		id: region.id,
		rowId: ZOOM_ROW_ID,
		span: { start: region.startMs, end: region.endMs },
		label: `Zoom ${index + 1}`,
		zoomDepth: region.depth,
		zoomMode: region.mode ?? "auto",
		variant: "zoom",
	}));

	const zoomOuts: TimelineRenderItem[] = zoomOutRegions.map((region, index) => ({
		id: region.id,
		rowId: ZOOM_OUT_ROW_ID,
		span: { start: region.startMs, end: region.endMs },
		label: region.label || `Fit Screen ${index + 1}`,
		variant: "zoom-out",
	}));

	const clips: TimelineRenderItem[] = clipRegions.map((region, index) => {
		const speed = Number.isFinite(region.speed) && region.speed > 0 ? region.speed : 1;
		const sourceEndMs = getClipSourceEndMs(region);
		const speedLabel = formatClipSpeedLabel(speed);

		return {
			id: region.id,
			rowId: CLIP_ROW_ID,
			span: { start: region.startMs, end: region.endMs },
			sourceSpan: { start: getClipSourceStartMs(region), end: sourceEndMs },
			label: speedLabel ? `Clip ${index + 1} ${speedLabel}` : `Clip ${index + 1}`,
			speedValue: speedLabel ? speed : undefined,
			showSourceAudio: region.showSourceAudio,
			muted: Boolean(region.muted),
			variant: "clip",
		};
	});

	const annotations: TimelineRenderItem[] = annotationRegions.map((region) => ({
		id: region.id,
		rowId: getAnnotationTrackRowId(region.trackIndex ?? 0),
		span: { start: region.startMs, end: region.endMs },
		label: getAnnotationLabel(region),
		variant: "annotation",
	}));

	const audios: TimelineRenderItem[] = audioRegions.map((region) => ({
		id: region.id,
		rowId: getAudioTrackRowId(region.trackIndex ?? 0),
		span: { start: region.startMs, end: region.endMs },
		label: getAudioLabel(region),
		audioPath: region.audioPath,
		audioGain: region.volume,
		audioNormalize: Boolean(region.normalize),
		variant: "audio",
	}));

	const captions: TimelineRenderItem[] = captionCues.map((cue) => ({
		id: cue.id,
		rowId: CAPTION_ROW_ID,
		span: { start: cue.startMs, end: cue.endMs },
		label: getCaptionLabel(cue),
		variant: "caption",
	}));
	// Distribute overlapping keystrokes across up to 2 layers on the timeline
	const layerEndTimes = [0, 0];
	const keypresses: TimelineRenderItem[] = keystrokes.map((event) => {
		const start = event.timeMs;
		const end = event.timeMs + Math.max(1, event.durationMs || 1500);

		let assignedLayer = 0;
		if (start >= layerEndTimes[0]) {
			assignedLayer = 0;
			layerEndTimes[0] = end;
		} else if (start >= layerEndTimes[1]) {
			assignedLayer = 1;
			layerEndTimes[1] = end;
		} else {
			assignedLayer = layerEndTimes[0] <= layerEndTimes[1] ? 0 : 1;
			layerEndTimes[assignedLayer] = end;
		}

		return {
			id: event.id,
			rowId: assignedLayer === 0 ? KEYSTROKE_ROW_ID : getKeystrokeTrackRowId(1),
			span: { start, end },
			label: event.displayText || event.keys.join(" + ") || "Key",
			variant: "keystroke",
		};
	});

	const memes: TimelineRenderItem[] = memeRegions.map((region) => ({
		id: region.id,
		rowId: getMemeTrackRowId(region.trackIndex ?? 0),
		span: { start: region.startMs, end: region.endMs },
		label: region.name || "Meme",
		variant: "meme",
	}));

	return [
		...zooms,
		...zoomOuts,
		...clips,
		...annotations,
		...audios,
		...captions,
		...keypresses,
		...memes,
	];
}

export function buildAllRegionSpans(params: {
	zoomRegions: ZoomRegion[];
	zoomOutRegions?: ZoomOutRegion[];
	clipRegions: ClipRegion[];
	audioRegions: AudioRegion[];
	transitionRegions?: TransitionRegion[];
	memeRegions?: MemeRegion[];
}): TimelineRegionSpan[] {
	const {
		zoomRegions,
		zoomOutRegions = [],
		clipRegions,
		audioRegions,
		transitionRegions = [],
		memeRegions = [],
	} = params;
	const zooms = zoomRegions.map((r) => ({
		id: r.id,
		start: r.startMs,
		end: r.endMs,
		rowId: ZOOM_ROW_ID,
	}));
	const zoomOuts = zoomOutRegions.map((r) => ({
		id: r.id,
		start: r.startMs,
		end: r.endMs,
		rowId: ZOOM_OUT_ROW_ID,
	}));
	const clips = clipRegions.map((r) => ({
		id: r.id,
		start: r.startMs,
		end: r.endMs,
		rowId: CLIP_ROW_ID,
	}));
	const audios = audioRegions.map((r) => ({
		id: r.id,
		start: r.startMs,
		end: r.endMs,
		rowId: getAudioTrackRowId(r.trackIndex ?? 0),
	}));
	const transitions = transitionRegions.map((r) => ({
		id: r.id,
		start: r.startMs,
		end: r.endMs,
		rowId: getTransitionTrackRowId(r.trackIndex ?? 0),
	}));
	const memes = memeRegions.map((r) => ({
		id: r.id,
		start: r.startMs,
		end: r.endMs,
		rowId: getMemeTrackRowId(r.trackIndex ?? 0),
	}));
	return [...zooms, ...zoomOuts, ...clips, ...audios, ...transitions, ...memes];
}

export function resolveDropRowId(
	id: string,
	proposedRowId: string,
	timelineItems: TimelineRenderItem[],
) {
	const currentRowId = timelineItems.find((item) => item.id === id)?.rowId;
	if (!currentRowId) {
		return proposedRowId;
	}

	if (isAnnotationTrackRowId(currentRowId)) {
		return isAnnotationTrackRowId(proposedRowId)
			? getAnnotationTrackRowId(getAnnotationTrackIndex(proposedRowId))
			: currentRowId;
	}

	if (isAudioTrackRowId(currentRowId)) {
		return isAudioTrackRowId(proposedRowId)
			? getAudioTrackRowId(getAudioTrackIndex(proposedRowId))
			: currentRowId;
	}

	if (isTransitionTrackRowId(currentRowId)) {
		return isTransitionTrackRowId(proposedRowId)
			? getTransitionTrackRowId(getTransitionTrackIndex(proposedRowId))
			: currentRowId;
	}

	if (isMemeTrackRowId(currentRowId)) {
		return isMemeTrackRowId(proposedRowId)
			? getMemeTrackRowId(getMemeTrackIndex(proposedRowId))
			: currentRowId;
	}

	return currentRowId;
}
