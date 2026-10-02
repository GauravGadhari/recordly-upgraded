import { Plus } from "@phosphor-icons/react";
import { useTimelineContext } from "dnd-timeline";
import {
	type MouseEvent,
	type MouseEventHandler,
	memo,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type {
	SourceAudioTrackSettings,
	SourceAudioTrackWithPeaks,
} from "@/components/video-editor/audio/audioTypes";
import { cn } from "@/lib/utils";
import {
	CAPTION_ROW_ID,
	CLIP_ROW_ID,
	SOURCE_AUDIO_ROW_ID,
	ZOOM_OUT_ROW_ID,
	ZOOM_ROW_ID,
} from "../../core/constants";
import type { TransitionRegion, TransitionType } from "../../../types";
import {
	getAnnotationTrackIndex,
	getAnnotationTrackRowId,
	getAudioTrackIndex,
	getAudioTrackRowId,
	getKeystrokeTrackIndex,
	getKeystrokeTrackRowId,
	getMemeTrackIndex,
	getMemeTrackRowId,
	isAnnotationTrackRowId,
	isAudioTrackRowId,
	isKeystrokeTrackRowId,
	isMemeTrackRowId,
} from "../../core/rows";
import type { TimelineRenderItem } from "../../core/timelineTypes";
import { DEFAULT_CAPTION_DURATION_MS } from "../../hooks/actions/useTimelineCaptionActions";
import { useTimelineAudioPeaks } from "../../hooks/useTimelineAudioPeaks";
import Item from "../../Item";
import glassStyles from "../../ItemGlass.module.css";
import Row from "../../Row";
import {
	getTimelineContentMinHeightPx,
	getTimelineRowsMinHeightPx,
	getTimelineViewportStretchFactor,
	TIMELINE_AXIS_HEIGHT_PX,
} from "../../timelineLayout";
import TimelineAxis from "../axis/TimelineAxis";
import ClipCutTransitionsOverlay from "../overlays/ClipCutTransitionsOverlay";
import ClipMarkerOverlay from "../overlays/ClipMarkerOverlay";
import PlaybackCursor from "../playhead/PlaybackCursor";

const HINT_CLIP = "Press C to split clip";
const HINT_ANNOTATION = "Press A to add annotation";
const HINT_MEME = "Add meme from Memes panel";

interface TimelineCanvasProps {
	items: TimelineRenderItem[];
	videoDurationMs: number;
	currentTimeMs: number;
	onSeek?: (time: number) => void;
	canPlaceZoomAtMs?: (startMs: number) => boolean;
	canPlaceZoomOutAtMs?: (startMs: number) => boolean;
	onAddZoomAtMs?: (startMs: number) => void;
	onAddZoomOutAtMs?: (startMs: number) => void;
	onAddCaptionAtMs?: (startMs: number) => void;
	canPlaceCaptionAtMs?: (startMs: number) => boolean;
	resolveCaptionSpanAtMs?: (startMs: number) => { start: number; end: number } | null;
	captionsEnabled?: boolean;
	captionQuickAddEnabled?: boolean;
	selectedZoomId: string | null;
	selectedZoomOutId?: string | null;
	selectedClipId?: string | null;
	selectedAnnotationId?: string | null;
	selectedAudioId?: string | null;
	selectedCaptionId?: string | null;
	selectedTransitionId?: string | null;
	selectedMemeId?: string | null;
	selectAllBlocksActive?: boolean;
	onClearBlockSelection?: () => void;
	keyframes?: { id: string; time: number }[];
	sourceAudioTracks?: SourceAudioTrackWithPeaks[];
	getSourceAudioTrackSettingsForClip?: (clipId: string | null) => SourceAudioTrackSettings;
	showSourceAudioTrack?: boolean;
	liveSpanPreviewById?: Record<string, { start: number; end: number }>;
	liveHiddenItemIds?: string[];
	isDragging?: boolean;
	isLoading?: boolean;
	isVertical?: boolean;
	onSelectZoom?: (id: string | null) => void;
	onSelectZoomOut?: (id: string | null) => void;
	onSelectClip?: (id: string | null) => void;
	onSelectAnnotation?: (id: string | null) => void;
	onSelectAudio?: (id: string | null) => void;
	onSelectCaption?: (id: string | null) => void;
	onSelectTransition?: (id: string | null) => void;
	onSelectMeme?: (id: string | null) => void;
	transitionRegions?: TransitionRegion[];
	onApplyCutTransition?: (params: {
		type: TransitionType;
		durationMs: number;
		cutTimeMs: number;
		existingId?: string;
	}) => void;
	onRemoveTransition?: (id: string) => void;
}

interface LaneHoverParams {
	direction: string;
	rangeStart: number;
	visibleDurationMs: number;
	videoDurationMs: number;
	valueToPixels: (value: number) => number;
	// Ghost block length to preview under the cursor.
	ghostDurationMs: number;
	// Whether the lane currently accepts adds (e.g. captions only when shown).
	enabled: boolean;
	// Suppress the ghost while a drag/resize is in progress.
	isDragging: boolean;
	onAddAtMs?: (startMs: number) => void;
	canPlaceAtMs?: (startMs: number) => boolean;
	// When set, the ghost previews the exact span an add would produce (clamped to
	// neighbors/end) instead of a fixed ghostDurationMs. Returns null when no add fits.
	resolveGhostSpanMs?: (startMs: number) => { start: number; end: number } | null;
}

/**
 * Hover + click-to-add behaviour for a single timeline lane (zoom, captions, …).
 * Tracks the pointer position over the row and derives the translucent "add"
 * ghost geometry. Lanes differ only by their ghost duration, enabled flag and
 * add/can-place callbacks.
 */
function useTimelineLaneHover({
	direction,
	rangeStart,
	visibleDurationMs,
	videoDurationMs,
	valueToPixels,
	ghostDurationMs,
	enabled,
	isDragging,
	onAddAtMs,
	canPlaceAtMs,
	resolveGhostSpanMs,
}: LaneHoverParams) {
	const [isHovered, setIsHovered] = useState(false);
	const [hoverMs, setHoverMs] = useState<number | null>(null);

	const updateHoverTime = useCallback(
		(clientX: number, rect: DOMRect) => {
			if (rect.width <= 0) return;
			const position =
				direction === "rtl"
					? Math.max(0, Math.min(rect.right - clientX, rect.width))
					: Math.max(0, Math.min(clientX - rect.left, rect.width));
			const ratio = position / rect.width;
			const nextMs = rangeStart + ratio * visibleDurationMs;
			setHoverMs(Math.max(0, Math.min(nextMs, videoDurationMs)));
		},
		[direction, rangeStart, videoDurationMs, visibleDurationMs],
	);

	const onMouseEnter = useCallback(
		(event: MouseEvent<HTMLDivElement>) => {
			setIsHovered(true);
			updateHoverTime(event.clientX, event.currentTarget.getBoundingClientRect());
		},
		[updateHoverTime],
	);

	const onMouseMove = useCallback(
		(event: MouseEvent<HTMLDivElement>) => {
			setIsHovered(true);
			updateHoverTime(event.clientX, event.currentTarget.getBoundingClientRect());
		},
		[updateHoverTime],
	);

	const onMouseLeave = useCallback(() => {
		setIsHovered(false);
		setHoverMs(null);
	}, []);

	const onMouseDown = useCallback((event: MouseEvent<HTMLDivElement>) => {
		event.stopPropagation();
	}, []);

	const onClick = useCallback(
		(event: MouseEvent<HTMLDivElement>) => {
			event.stopPropagation();
			// Respect the lane's enabled flag so a hidden ghost can't still add on click.
			if (!enabled || !onAddAtMs || hoverMs === null) return;
			const startMs = Math.max(0, Math.min(hoverMs, videoDurationMs));
			if (canPlaceAtMs && !canPlaceAtMs(startMs)) return;
			onAddAtMs(startMs);
		},
		[enabled, canPlaceAtMs, onAddAtMs, videoDurationMs, hoverMs],
	);

	const reset = useCallback(() => {
		setIsHovered(false);
		setHoverMs(null);
	}, []);

	const clampedHoverMs =
		hoverMs === null ? null : Math.max(0, Math.min(hoverMs, videoDurationMs));
	// When a resolver is supplied, preview the exact span the add would create (clamped to
	// the next item / end of timeline); otherwise fall back to a fixed-length ghost.
	const resolvedSpan =
		resolveGhostSpanMs && clampedHoverMs !== null ? resolveGhostSpanMs(clampedHoverMs) : null;
	const ghostStartMs =
		clampedHoverMs === null ? null : resolvedSpan ? resolvedSpan.start : clampedHoverMs;
	const ghostEndMs =
		ghostStartMs === null
			? null
			: resolvedSpan
				? resolvedSpan.end
				: Math.max(ghostStartMs, Math.min(videoDurationMs, ghostStartMs + ghostDurationMs));
	const ghostStartOffsetPx =
		ghostStartMs === null ? 0 : valueToPixels(Math.max(0, ghostStartMs - rangeStart));
	const ghostEndOffsetPx =
		ghostEndMs === null ? 0 : valueToPixels(Math.max(0, ghostEndMs - rangeStart));
	const ghostWidthPx = Math.max(18, ghostEndOffsetPx - ghostStartOffsetPx);
	const canShowGhost =
		!isDragging &&
		enabled &&
		isHovered &&
		ghostStartMs !== null &&
		(resolveGhostSpanMs
			? resolvedSpan !== null
			: onAddAtMs
				? (canPlaceAtMs?.(ghostStartMs) ?? true)
				: false);

	return {
		reset,
		ghostStartMs,
		ghostStartOffsetPx,
		ghostWidthPx,
		canShowGhost,
		onMouseEnter,
		onMouseMove,
		onMouseLeave,
		onMouseDown,
		onClick,
	};
}

interface TimelineHoverParams {
	direction: string;
	sidebarWidth: number;
	rangeStart: number;
	rangeEnd: number;
	videoDurationMs: number;
	onAddZoomAtMs?: (startMs: number) => void;
	canPlaceZoomAtMs?: (startMs: number) => boolean;
	onAddZoomOutAtMs?: (startMs: number) => void;
	canPlaceZoomOutAtMs?: (startMs: number) => boolean;
	onAddCaptionAtMs?: (startMs: number) => void;
	canPlaceCaptionAtMs?: (startMs: number) => boolean;
	resolveCaptionSpanAtMs?: (startMs: number) => { start: number; end: number } | null;
	captionsEnabled?: boolean;
	captionQuickAddEnabled?: boolean;
	isDragging: boolean;
	valueToPixels: (value: number) => number;
}

function useTimelineHover({
	direction,
	sidebarWidth,
	rangeStart,
	rangeEnd,
	videoDurationMs,
	onAddZoomAtMs,
	canPlaceZoomAtMs,
	onAddZoomOutAtMs,
	canPlaceZoomOutAtMs,
	onAddCaptionAtMs,
	canPlaceCaptionAtMs,
	resolveCaptionSpanAtMs,
	captionsEnabled,
	captionQuickAddEnabled = true,
	isDragging,
	valueToPixels,
}: TimelineHoverParams) {
	const [isTimelineHovered, setIsTimelineHovered] = useState(false);
	const [timelineHoverMs, setTimelineHoverMs] = useState<number | null>(null);

	const visibleDurationMs = Math.max(1, rangeEnd - rangeStart);

	const updateTimelineHoverTime = useCallback(
		(clientX: number, rect: DOMRect) => {
			const contentWidth = Math.max(1, rect.width - sidebarWidth);
			const contentX =
				direction === "rtl"
					? rect.right - sidebarWidth - clientX
					: clientX - rect.left - sidebarWidth;
			const clampedX = Math.max(0, Math.min(contentX, contentWidth));
			const ratio = clampedX / contentWidth;
			const nextMs = rangeStart + ratio * visibleDurationMs;
			setTimelineHoverMs(Math.max(0, Math.min(nextMs, videoDurationMs)));
		},
		[direction, rangeStart, sidebarWidth, videoDurationMs, visibleDurationMs],
	);

	const handleTimelineMouseEnter = useCallback(
		(event: MouseEvent<HTMLDivElement>) => {
			setIsTimelineHovered(true);
			updateTimelineHoverTime(event.clientX, event.currentTarget.getBoundingClientRect());
		},
		[updateTimelineHoverTime],
	);

	const handleTimelineMouseMove = useCallback(
		(event: MouseEvent<HTMLDivElement>) => {
			if (!isTimelineHovered) setIsTimelineHovered(true);
			updateTimelineHoverTime(event.clientX, event.currentTarget.getBoundingClientRect());
		},
		[isTimelineHovered, updateTimelineHoverTime],
	);

	const zoom = useTimelineLaneHover({
		direction,
		rangeStart,
		visibleDurationMs,
		videoDurationMs,
		valueToPixels,
		ghostDurationMs: Math.min(1000, videoDurationMs),
		enabled: true,
		isDragging,
		onAddAtMs: onAddZoomAtMs,
		canPlaceAtMs: canPlaceZoomAtMs,
	});

	const zoomOut = useTimelineLaneHover({
		direction,
		rangeStart,
		visibleDurationMs,
		videoDurationMs,
		valueToPixels,
		ghostDurationMs: Math.min(1000, videoDurationMs),
		enabled: true,
		isDragging,
		onAddAtMs: onAddZoomOutAtMs,
		canPlaceAtMs: canPlaceZoomOutAtMs,
	});

	const caption = useTimelineLaneHover({
		direction,
		rangeStart,
		visibleDurationMs,
		videoDurationMs,
		valueToPixels,
		ghostDurationMs: Math.min(DEFAULT_CAPTION_DURATION_MS, videoDurationMs),
		enabled: Boolean(captionsEnabled) && captionQuickAddEnabled,
		isDragging,
		onAddAtMs: onAddCaptionAtMs,
		canPlaceAtMs: canPlaceCaptionAtMs,
		resolveGhostSpanMs: resolveCaptionSpanAtMs,
	});

	const handleTimelineMouseLeave = useCallback(() => {
		setIsTimelineHovered(false);
		setTimelineHoverMs(null);
		zoom.reset();
		zoomOut.reset();
		caption.reset();
	}, [zoom.reset, zoomOut.reset, caption.reset]);

	const timelineGhostOffsetPx =
		timelineHoverMs === null ? 0 : valueToPixels(Math.max(0, timelineHoverMs - rangeStart));
	const canShowGhostPlayhead = isTimelineHovered && timelineHoverMs !== null;

	return {
		canShowGhostPlayhead,
		timelineGhostOffsetPx,
		handleTimelineMouseEnter,
		handleTimelineMouseMove,
		handleTimelineMouseLeave,
		canShowGhostZoom: zoom.canShowGhost,
		ghostStartMs: zoom.ghostStartMs,
		ghostStartOffsetPx: zoom.ghostStartOffsetPx,
		ghostWidthPx: zoom.ghostWidthPx,
		handleZoomRowMouseEnter: zoom.onMouseEnter,
		handleZoomRowMouseMove: zoom.onMouseMove,
		handleZoomRowMouseLeave: zoom.onMouseLeave,
		handleZoomRowMouseDown: zoom.onMouseDown,
		handleZoomRowClick: zoom.onClick,
		canShowGhostZoomOut: zoomOut.canShowGhost,
		ghostZoomOutStartMs: zoomOut.ghostStartMs,
		ghostZoomOutStartOffsetPx: zoomOut.ghostStartOffsetPx,
		ghostZoomOutWidthPx: zoomOut.ghostWidthPx,
		handleZoomOutRowMouseEnter: zoomOut.onMouseEnter,
		handleZoomOutRowMouseMove: zoomOut.onMouseMove,
		handleZoomOutRowMouseLeave: zoomOut.onMouseLeave,
		handleZoomOutRowMouseDown: zoomOut.onMouseDown,
		handleZoomOutRowClick: zoomOut.onClick,
		canShowGhostCaption: caption.canShowGhost,
		captionGhostStartMs: caption.ghostStartMs,
		captionGhostStartOffsetPx: caption.ghostStartOffsetPx,
		captionGhostWidthPx: caption.ghostWidthPx,
		handleCaptionRowMouseEnter: caption.onMouseEnter,
		handleCaptionRowMouseMove: caption.onMouseMove,
		handleCaptionRowMouseLeave: caption.onMouseLeave,
		handleCaptionRowMouseDown: caption.onMouseDown,
		handleCaptionRowClick: caption.onClick,
	};
}

interface TimelineCanvasRowsProps {
	items: TimelineRenderItem[];
	videoDurationMs: number;
	selectAllBlocksActive: boolean;
	selectedZoomId: string | null;
	selectedZoomOutId?: string | null;
	selectedClipId?: string | null;
	selectedAnnotationId?: string | null;
	selectedAudioId?: string | null;
	selectedCaptionId?: string | null;
	selectedTransitionId?: string | null;
	selectedMemeId?: string | null;
	onSelectZoom?: (id: string | null) => void;
	onSelectZoomOut?: (id: string | null) => void;
	onSelectClip?: (id: string | null) => void;
	onSelectAnnotation?: (id: string | null) => void;
	onSelectAudio?: (id: string | null) => void;
	onSelectCaption?: (id: string | null) => void;
	onSelectTransition?: (id: string | null) => void;
	onSelectMeme?: (id: string | null) => void;
	onSeek?: (time: number) => void;
	sourceAudioTracks?: SourceAudioTrackWithPeaks[];
	getSourceAudioTrackSettingsForClip?: (clipId: string | null) => SourceAudioTrackSettings;
	showSourceAudioTrack?: boolean;
	liveSpanPreviewById?: Record<string, { start: number; end: number }>;
	liveHiddenItemIds?: string[];
	direction: string;
	isVertical?: boolean;
	canShowGhostZoom: boolean;
	ghostStartMs: number | null;
	ghostStartOffsetPx: number;
	ghostWidthPx: number;
	onZoomRowMouseEnter: MouseEventHandler<HTMLDivElement>;
	onZoomRowMouseMove: MouseEventHandler<HTMLDivElement>;
	onZoomRowMouseLeave: MouseEventHandler<HTMLDivElement>;
	onZoomRowMouseDown: MouseEventHandler<HTMLDivElement>;
	onZoomRowClick: MouseEventHandler<HTMLDivElement>;
	canShowGhostZoomOut: boolean;
	ghostZoomOutStartMs: number | null;
	ghostZoomOutStartOffsetPx: number;
	ghostZoomOutWidthPx: number;
	onZoomOutRowMouseEnter: MouseEventHandler<HTMLDivElement>;
	onZoomOutRowMouseMove: MouseEventHandler<HTMLDivElement>;
	onZoomOutRowMouseLeave: MouseEventHandler<HTMLDivElement>;
	onZoomOutRowMouseDown: MouseEventHandler<HTMLDivElement>;
	onZoomOutRowClick: MouseEventHandler<HTMLDivElement>;
	captionsEnabled?: boolean;
	canShowGhostCaption: boolean;
	captionGhostStartMs: number | null;
	captionGhostStartOffsetPx: number;
	captionGhostWidthPx: number;
	onCaptionRowMouseEnter: MouseEventHandler<HTMLDivElement>;
	onCaptionRowMouseMove: MouseEventHandler<HTMLDivElement>;
	onCaptionRowMouseLeave: MouseEventHandler<HTMLDivElement>;
	onCaptionRowMouseDown: MouseEventHandler<HTMLDivElement>;
	onCaptionRowClick: MouseEventHandler<HTMLDivElement>;
	transitionRegions?: TransitionRegion[];
	onApplyCutTransition?: (params: {
		type: TransitionType;
		durationMs: number;
		cutTimeMs: number;
		existingId?: string;
	}) => void;
	onRemoveTransition?: (id: string) => void;
}

interface AudioItemWithWaveformProps {
	item: TimelineRenderItem;
	span: { start: number; end: number };
	waveformSpan: { start: number; end: number };
	isSelected: boolean;
	onSelectAudio?: (id: string | null) => void;
}

function AudioItemWithWaveform({
	item,
	span,
	waveformSpan,
	isSelected,
	onSelectAudio,
}: AudioItemWithWaveformProps) {
	const { peaks } = useTimelineAudioPeaks(item.audioPath ?? null);
	const normalizedWaveformSpan = useMemo(() => {
		const duration = Math.max(0, waveformSpan.end - waveformSpan.start);
		return { start: 0, end: duration };
	}, [waveformSpan.end, waveformSpan.start]);
	return (
		<Item
			id={item.id}
			rowId={item.rowId}
			span={span}
			isSelected={isSelected}
			onSelectId={onSelectAudio}
			variant="audio"
			waveformPeaks={peaks}
			waveformSegmentSpan={normalizedWaveformSpan}
			waveformGain={Math.max(0, Math.min(1, item.audioGain ?? 1))}
			waveformNormalize={Boolean(item.audioNormalize)}
		>
			{item.label}
		</Item>
	);
}

const TimelineCanvasRows = memo(function TimelineCanvasRows({
	items,
	videoDurationMs,
	selectAllBlocksActive,
	selectedZoomId,
	selectedZoomOutId,
	selectedClipId,
	selectedAnnotationId,
	selectedAudioId,
	selectedCaptionId,
	selectedTransitionId: _selectedTransitionId,
	selectedMemeId,
	onSelectZoom,
	onSelectZoomOut,
	onSelectClip,
	onSelectAnnotation,
	onSelectAudio,
	onSelectCaption,
	onSelectTransition: _onSelectTransition,
	onSelectMeme,
	onSeek,
	sourceAudioTracks = [],
	getSourceAudioTrackSettingsForClip,
	showSourceAudioTrack = false,
	liveSpanPreviewById,
	liveHiddenItemIds,
	direction,
	isVertical = false,
	canShowGhostZoom,
	ghostStartMs,
	ghostStartOffsetPx,
	ghostWidthPx,
	onZoomRowMouseEnter,
	onZoomRowMouseMove,
	onZoomRowMouseLeave,
	onZoomRowMouseDown,
	onZoomRowClick,
	canShowGhostZoomOut,
	ghostZoomOutStartMs,
	ghostZoomOutStartOffsetPx,
	ghostZoomOutWidthPx,
	onZoomOutRowMouseEnter,
	onZoomOutRowMouseMove,
	onZoomOutRowMouseLeave,
	onZoomOutRowMouseDown,
	onZoomOutRowClick,
	captionsEnabled = false,
	canShowGhostCaption,
	captionGhostStartMs,
	captionGhostStartOffsetPx,
	captionGhostWidthPx,
	onCaptionRowMouseEnter,
	onCaptionRowMouseMove,
	onCaptionRowMouseLeave,
	onCaptionRowMouseDown,
	onCaptionRowClick,
	transitionRegions,
	onApplyCutTransition,
	onRemoveTransition,
}: TimelineCanvasRowsProps) {
	const hiddenIds = useMemo(() => new Set(liveHiddenItemIds ?? []), [liveHiddenItemIds]);
	const {
		clipItems,
		zoomItems,
		zoomOutItems,
		captionItems,
		keystrokeRows,
		memeRows,
		annotationRows,
		audioRows,
	} = useMemo(() => {
		const nextClipItems: TimelineRenderItem[] = [];
		const nextZoomItems: TimelineRenderItem[] = [];
		const nextZoomOutItems: TimelineRenderItem[] = [];
		const nextCaptionItems: TimelineRenderItem[] = [];
		const keystrokeBuckets = new Map<number, TimelineRenderItem[]>();
		const memeBuckets = new Map<number, TimelineRenderItem[]>();
		const annotationBuckets = new Map<number, TimelineRenderItem[]>();
		const audioBuckets = new Map<number, TimelineRenderItem[]>();

		for (const item of items) {
			if (item.rowId === CLIP_ROW_ID) {
				nextClipItems.push(item);
				continue;
			}
			if (item.rowId === ZOOM_ROW_ID) {
				nextZoomItems.push(item);
				continue;
			}
			if (item.rowId === ZOOM_OUT_ROW_ID) {
				nextZoomOutItems.push(item);
				continue;
			}
			if (item.rowId === CAPTION_ROW_ID) {
				nextCaptionItems.push(item);
				continue;
			}
			if (isKeystrokeTrackRowId(item.rowId)) {
				const trackIndex = getKeystrokeTrackIndex(item.rowId);
				const bucket = keystrokeBuckets.get(trackIndex);
				if (bucket) bucket.push(item);
				else keystrokeBuckets.set(trackIndex, [item]);
				continue;
			}
			if (isMemeTrackRowId(item.rowId)) {
				const trackIndex = getMemeTrackIndex(item.rowId);
				const bucket = memeBuckets.get(trackIndex);
				if (bucket) bucket.push(item);
				else memeBuckets.set(trackIndex, [item]);
				continue;
			}
			if (isAnnotationTrackRowId(item.rowId)) {
				const trackIndex = getAnnotationTrackIndex(item.rowId);
				const bucket = annotationBuckets.get(trackIndex);
				if (bucket) bucket.push(item);
				else annotationBuckets.set(trackIndex, [item]);
				continue;
			}
			if (isAudioTrackRowId(item.rowId)) {
				const trackIndex = getAudioTrackIndex(item.rowId);
				const bucket = audioBuckets.get(trackIndex);
				if (bucket) bucket.push(item);
				else audioBuckets.set(trackIndex, [item]);
			}
		}

		if (memeBuckets.size === 0) {
			memeBuckets.set(0, []);
		}
		if (annotationBuckets.size === 0) {
			annotationBuckets.set(0, []);
		}
		if (audioBuckets.size === 0) {
			audioBuckets.set(0, []);
			audioBuckets.set(1, []);
			audioBuckets.set(2, []);
		} else {
			if (!audioBuckets.has(0)) audioBuckets.set(0, []);
			if (!audioBuckets.has(1)) audioBuckets.set(1, []);
			if (!audioBuckets.has(2)) audioBuckets.set(2, []);
		}

		const keystrokeRowsSorted = Array.from(keystrokeBuckets.entries())
			.sort(([left], [right]) => left - right)
			.map(([trackIndex, rowItems]) => ({
				rowId: getKeystrokeTrackRowId(trackIndex),
				items: rowItems,
			}));
		const memeRowsSorted = Array.from(memeBuckets.entries())
			.sort(([left], [right]) => left - right)
			.map(([trackIndex, rowItems]) => ({
				rowId: getMemeTrackRowId(trackIndex),
				items: rowItems,
			}));
		const annotationRowsSorted = Array.from(annotationBuckets.entries())
			.sort(([left], [right]) => left - right)
			.map(([trackIndex, rowItems]) => ({
				rowId: getAnnotationTrackRowId(trackIndex),
				items: rowItems,
			}));
		const audioRowsSorted = Array.from(audioBuckets.entries())
			.sort(([left], [right]) => left - right)
			.map(([trackIndex, rowItems]) => ({
				rowId: getAudioTrackRowId(trackIndex),
				items: rowItems,
			}));

		return {
			clipItems: nextClipItems,
			zoomItems: nextZoomItems,
			zoomOutItems: nextZoomOutItems,
			captionItems: nextCaptionItems,
			keystrokeRows: keystrokeRowsSorted,
			memeRows: memeRowsSorted,
			annotationRows: annotationRowsSorted,
			audioRows: audioRowsSorted,
		};
	}, [items]);

	const [trackHeights, setTrackHeights] = useState<Record<string, number>>({});
	const [mutedTrackIds, setMutedTrackIds] = useState<Set<string>>(new Set());
	const [soloTrackIds, setSoloTrackIds] = useState<Set<string>>(new Set());
	const [hiddenTrackIds, setHiddenTrackIds] = useState<Set<string>>(new Set());

	const toggleMute = useCallback((rowId: string) => {
		setMutedTrackIds((prev) => {
			const next = new Set(prev);
			if (next.has(rowId)) next.delete(rowId);
			else next.add(rowId);
			return next;
		});
	}, []);

	const toggleSolo = useCallback((rowId: string) => {
		setSoloTrackIds((prev) => {
			const next = new Set(prev);
			if (next.has(rowId)) next.delete(rowId);
			else next.add(rowId);
			return next;
		});
	}, []);

	const toggleHide = useCallback((rowId: string) => {
		setHiddenTrackIds((prev) => {
			const next = new Set(prev);
			if (next.has(rowId)) next.delete(rowId);
			else next.add(rowId);
			return next;
		});
	}, []);

	const setRowHeight = useCallback((rowId: string, height: number) => {
		setTrackHeights((prev) => ({ ...prev, [rowId]: height }));
	}, []);

	const isRowMuted = useCallback(
		(rowId: string) => {
			if (mutedTrackIds.has(rowId)) return true;
			if (soloTrackIds.size > 0 && !soloTrackIds.has(rowId)) return true;
			return false;
		},
		[mutedTrackIds, soloTrackIds],
	);

	return (
		<>
			{/* 1. VIDEO / CLIPS */}
			<Row
				id={CLIP_ROW_ID}
				label="Video"
				isEmpty={clipItems.length === 0}
				hint={HINT_CLIP}
				height={trackHeights[CLIP_ROW_ID] ?? 48}
				onHeightChange={(h) => setRowHeight(CLIP_ROW_ID, h)}
				isHidden={hiddenTrackIds.has(CLIP_ROW_ID)}
				onToggleHide={() => toggleHide(CLIP_ROW_ID)}
				isMuted={isRowMuted(CLIP_ROW_ID)}
				onToggleMute={() => toggleMute(CLIP_ROW_ID)}
				showVisibility
				showMute
			>
				<ClipMarkerOverlay videoDurationMs={videoDurationMs} />
				<ClipCutTransitionsOverlay
					clipItems={clipItems}
					transitionRegions={transitionRegions ?? []}
					onApplyTransition={onApplyCutTransition ?? (() => {})}
					onRemoveTransition={onRemoveTransition ?? (() => {})}
				/>
				{clipItems.map((item) => (
					<Item
						id={item.id}
						key={item.id}
						rowId={item.rowId}
						span={item.span}
						isSelected={item.id === selectedClipId}
						onSelectId={onSelectClip}
						variant="clip"
						speedValue={item.speedValue}
					>
						{item.label}
					</Item>
				))}
			</Row>

			{/* 3. SOURCE AUDIO */}
			{showSourceAudioTrack &&
				sourceAudioTracks.map((track) => {
					const trackRowId = `${SOURCE_AUDIO_ROW_ID}-${track.id}`;
					return (
						<Row
							key={track.id}
							id={trackRowId}
							label={track.label || "Source Audio"}
							height={trackHeights[trackRowId] ?? 40}
							onHeightChange={(h) => setRowHeight(trackRowId, h)}
							isMuted={isRowMuted(trackRowId)}
							onToggleMute={() => toggleMute(trackRowId)}
							isSolo={soloTrackIds.has(trackRowId)}
							onToggleSolo={() => toggleSolo(trackRowId)}
							showMute
							showSolo
						>
							{clipItems
								.filter((item) => item.showSourceAudio)
								.map((item) => {
									const settings = getSourceAudioTrackSettingsForClip?.(item.id)?.[
										track.id
									] ?? { volume: 1, normalize: false };
									return (
										<Item
											key={`source-audio-${track.id}-${item.id}`}
											id={`source-audio-${track.id}-${item.id}`}
											rowId={trackRowId}
											span={liveSpanPreviewById?.[item.id] ?? item.span}
											disabled
											isSelected={item.id === selectedClipId}
											onSelect={() => onSelectClip?.(item.id)}
											variant="audio"
											waveformPeaks={track.peaks}
											waveformSegmentSpan={item.sourceSpan ?? item.span}
											waveformGain={Math.max(0, Math.min(1, settings.volume))}
											waveformNormalize={Boolean(settings.normalize)}
											muted={item.muted || isRowMuted(trackRowId)}
										>
											{track.label}
										</Item>
									);
								})}
						</Row>
					);
				})}

			{/* 3. ZOOMS */}
			<Row
				id={ZOOM_ROW_ID}
				label="Zooms"
				isEmpty={zoomItems.length === 0}
				height={trackHeights[ZOOM_ROW_ID] ?? 36}
				onHeightChange={(h) => setRowHeight(ZOOM_ROW_ID, h)}
				isHidden={hiddenTrackIds.has(ZOOM_ROW_ID)}
				onToggleHide={() => toggleHide(ZOOM_ROW_ID)}
				showVisibility
				onMouseEnter={onZoomRowMouseEnter}
				onMouseMove={onZoomRowMouseMove}
				onMouseLeave={onZoomRowMouseLeave}
				onMouseDown={onZoomRowMouseDown}
				onClick={onZoomRowClick}
			>
				{canShowGhostZoom && ghostStartMs !== null && (
					<div className="absolute inset-0 z-[3] pointer-events-none">
						<div
							className="absolute top-1/2 -translate-y-1/2 h-[85%] min-h-[22px]"
							style={
								direction === "rtl"
									? {
											right: `${ghostStartOffsetPx}px`,
											width: `${ghostWidthPx}px`,
										}
									: {
											left: `${ghostStartOffsetPx}px`,
											width: `${ghostWidthPx}px`,
										}
							}
						>
							<div
								className={cn(
									glassStyles.glassPurple,
									"w-full h-full overflow-hidden flex items-center justify-center cursor-default relative opacity-80",
								)}
							>
								<div className={cn(glassStyles.zoomEndCap, glassStyles.left)} />
								<div className={cn(glassStyles.zoomEndCap, glassStyles.right)} />
								<div className="relative z-10 inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/45 bg-white/15 text-white">
									<Plus className="h-2.5 w-2.5" />
								</div>
							</div>
						</div>
					</div>
				)}
				{zoomItems
					.filter((item) => !hiddenIds.has(item.id))
					.map((item) => (
						<Item
							id={item.id}
							key={item.id}
							rowId={item.rowId}
							span={item.span}
							isSelected={selectAllBlocksActive || item.id === selectedZoomId}
							onSelectId={onSelectZoom}
							zoomDepth={item.zoomDepth}
							zoomMode={item.zoomMode}
							variant="zoom"
						>
							{item.label}
						</Item>
					))}
			</Row>

			{/* 3.5 ZOOM OUT (FIT SCREEN) */}
			{(isVertical || zoomOutItems.length > 0) && (
				<Row
					id={ZOOM_OUT_ROW_ID}
					label="Zoom Out"
					isEmpty={zoomOutItems.length === 0}
					height={trackHeights[ZOOM_OUT_ROW_ID] ?? 36}
					onHeightChange={(h) => setRowHeight(ZOOM_OUT_ROW_ID, h)}
					isHidden={hiddenTrackIds.has(ZOOM_OUT_ROW_ID)}
					onToggleHide={() => toggleHide(ZOOM_OUT_ROW_ID)}
					showVisibility
					onMouseEnter={onZoomOutRowMouseEnter}
					onMouseMove={onZoomOutRowMouseMove}
					onMouseLeave={onZoomOutRowMouseLeave}
					onMouseDown={onZoomOutRowMouseDown}
					onClick={onZoomOutRowClick}
				>
					{canShowGhostZoomOut && ghostZoomOutStartMs !== null && (
						<div className="absolute inset-0 z-[3] pointer-events-none">
							<div
								className="absolute top-1/2 -translate-y-1/2 h-[85%] min-h-[22px]"
								style={
									direction === "rtl"
										? {
												right: `${ghostZoomOutStartOffsetPx}px`,
												width: `${ghostZoomOutWidthPx}px`,
											}
										: {
												left: `${ghostZoomOutStartOffsetPx}px`,
												width: `${ghostZoomOutWidthPx}px`,
											}
								}
							>
								<div
									className={cn(
										glassStyles.glassCyan,
										"w-full h-full overflow-hidden flex items-center justify-center cursor-default relative opacity-80",
									)}
								>
									<div className={cn(glassStyles.zoomEndCap, glassStyles.left)} />
									<div className={cn(glassStyles.zoomEndCap, glassStyles.right)} />
									<div className="relative z-10 inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/45 bg-white/15 text-white">
										<Plus className="h-2.5 w-2.5" />
									</div>
								</div>
							</div>
						</div>
					)}
					{zoomOutItems
						.filter((item) => !hiddenIds.has(item.id))
						.map((item) => (
							<Item
								id={item.id}
								key={item.id}
								rowId={item.rowId}
								span={item.span}
								isSelected={item.id === selectedZoomOutId}
								onSelectId={onSelectZoomOut}
								variant="zoom-out"
							>
								{item.label}
							</Item>
						))}
				</Row>
			)}

			{/* 4. CAPTIONS */}
			{(captionsEnabled || captionItems.length > 0) && (
				<Row
					id={CAPTION_ROW_ID}
					label="Captions"
					isEmpty={captionItems.length === 0}
					height={trackHeights[CAPTION_ROW_ID] ?? 36}
					onHeightChange={(h) => setRowHeight(CAPTION_ROW_ID, h)}
					isHidden={hiddenTrackIds.has(CAPTION_ROW_ID)}
					onToggleHide={() => toggleHide(CAPTION_ROW_ID)}
					showVisibility
					onMouseEnter={onCaptionRowMouseEnter}
					onMouseMove={onCaptionRowMouseMove}
					onMouseLeave={onCaptionRowMouseLeave}
					onMouseDown={onCaptionRowMouseDown}
					onClick={onCaptionRowClick}
				>
					{canShowGhostCaption && captionGhostStartMs !== null && (
						<div className="absolute inset-0 z-[3] pointer-events-none">
							<div
								className="absolute top-1/2 -translate-y-1/2 h-[85%] min-h-[22px]"
								style={
									direction === "rtl"
										? {
												right: `${captionGhostStartOffsetPx}px`,
												width: `${captionGhostWidthPx}px`,
											}
										: {
												left: `${captionGhostStartOffsetPx}px`,
												width: `${captionGhostWidthPx}px`,
											}
								}
							>
								<div
									className={cn(
										glassStyles.glassCaption,
										"w-full h-full overflow-hidden flex items-center justify-center cursor-default relative opacity-80",
									)}
								>
									<div className="relative z-10 inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/45 bg-white/15 text-white">
										<Plus className="h-2.5 w-2.5" />
									</div>
								</div>
							</div>
						</div>
					)}
					{captionItems.map((item) => (
						<Item
							id={item.id}
							key={item.id}
							rowId={item.rowId}
							span={item.span}
							isSelected={item.id === selectedCaptionId}
							onSelectId={onSelectCaption}
							variant="caption"
						>
							{item.label}
						</Item>
					))}
				</Row>
			)}

			{/* 5. KEYSTROKES */}
			{keystrokeRows.map(({ rowId, items: rowItems }, index) => (
				<Row
					key={rowId}
					id={rowId}
					label={index === 0 ? "Keystrokes" : `Keys ${index + 1}`}
					height={trackHeights[rowId] ?? 36}
					onHeightChange={(h) => setRowHeight(rowId, h)}
					isHidden={hiddenTrackIds.has(rowId)}
					onToggleHide={() => toggleHide(rowId)}
					showVisibility
				>
					{rowItems.map((item) => (
						<Item
							id={item.id}
							key={item.id}
							rowId={item.rowId}
							span={item.span}
							disabled
							onSelect={() => onSeek?.(item.span.start / 1000)}
							variant="keystroke"
						>
							{item.label}
						</Item>
					))}
				</Row>
			))}

			{/* 6. MEMES */}
			{memeRows.map(({ rowId, items: rowItems }, index) => (
				<Row
					key={rowId}
					id={rowId}
					label={index === 0 ? "Memes" : `Memes ${index + 1}`}
					isEmpty={rowItems.length === 0}
					hint={index === 0 ? HINT_MEME : undefined}
					height={trackHeights[rowId] ?? 36}
					onHeightChange={(h) => setRowHeight(rowId, h)}
					isHidden={hiddenTrackIds.has(rowId)}
					onToggleHide={() => toggleHide(rowId)}
					isMuted={isRowMuted(rowId)}
					onToggleMute={() => toggleMute(rowId)}
					showVisibility
					showMute
				>
					{rowItems.map((item) => (
						<Item
							id={item.id}
							key={item.id}
							rowId={item.rowId}
							span={item.span}
							isSelected={item.id === selectedMemeId}
							onSelectId={onSelectMeme}
							variant="meme"
						>
							{item.label}
						</Item>
					))}
				</Row>
			))}

			{/* 7. ANNOTATIONS */}
			{annotationRows.map(({ rowId, items: rowItems }, index) => (
				<Row
					key={rowId}
					id={rowId}
					label={index === 0 ? "Annotations" : `Annotations ${index + 1}`}
					isEmpty={rowItems.length === 0}
					hint={index === 0 ? HINT_ANNOTATION : undefined}
					height={trackHeights[rowId] ?? 36}
					onHeightChange={(h) => setRowHeight(rowId, h)}
					isHidden={hiddenTrackIds.has(rowId)}
					onToggleHide={() => toggleHide(rowId)}
					showVisibility
				>
					{rowItems.map((item) => (
						<Item
							id={item.id}
							key={item.id}
							rowId={item.rowId}
							span={item.span}
							isSelected={item.id === selectedAnnotationId}
							onSelectId={onSelectAnnotation}
							variant="annotation"
						>
							{item.label}
						</Item>
					))}
				</Row>
			))}

			{/* 8. AUDIO / SFX */}
			{audioRows.map(({ rowId, items: rowItems }) => {
				const trackIndex = getAudioTrackIndex(rowId);
				const hasClicks = rowItems.some((item) => item.label === "Click" || item.label === "Drag");
				const hasWhooshes = rowItems.some((item) => item.label.startsWith("Whoosh") && !item.label.includes("Zoom"));
				const hasZooms = rowItems.some((item) => item.label.includes("Zoom") || item.label === "Zoom In" || item.label === "Zoom Out");
				const hasKeys = rowItems.some((item) => item.label?.toLowerCase().includes("key") || item.label?.toLowerCase().includes("type"));
				let rowLabel: string;
				let rowHint: string | undefined;

				if (trackIndex === 0) {
					rowLabel = "Clicks";
					rowHint = "Click & Drag SFX layer";
				} else if (trackIndex === 1) {
					rowLabel = "Whooshes";
					rowHint = "Cursor movement whoosh layer";
				} else if (trackIndex === 2) {
					rowLabel = "Zooms";
					rowHint = "Zoom in & out SFX layer";
				} else if (trackIndex === 3 || (hasKeys && !hasClicks && !hasWhooshes && !hasZooms)) {
					rowLabel = "Keys SFX";
					rowHint = "Keystroke & typing SFX layer";
				} else if (hasClicks && !hasWhooshes && !hasZooms) {
					rowLabel = "Clicks";
					rowHint = "Click SFX layer";
				} else if (hasWhooshes && !hasClicks && !hasZooms) {
					rowLabel = "Whooshes";
					rowHint = "Whoosh SFX layer";
				} else if (hasZooms && !hasClicks && !hasWhooshes) {
					rowLabel = "Zooms";
					rowHint = "Zoom SFX layer";
				} else if (hasClicks && hasWhooshes) {
					rowLabel = "Clicks & Whooshes";
				} else {
					rowLabel = `Audio ${trackIndex + 1}`;
				}

				return (
					<Row
						key={rowId}
						id={rowId}
						label={rowLabel}
						isEmpty={rowItems.length === 0}
						hint={rowHint}
						height={trackHeights[rowId] ?? 40}
						onHeightChange={(h) => setRowHeight(rowId, h)}
						isMuted={isRowMuted(rowId)}
						onToggleMute={() => toggleMute(rowId)}
						isSolo={soloTrackIds.has(rowId)}
						onToggleSolo={() => toggleSolo(rowId)}
						showMute
						showSolo
					>
						{rowItems.map((item) => (
							<AudioItemWithWaveform
								key={item.id}
								item={item}
								span={item.span}
								waveformSpan={liveSpanPreviewById?.[item.id] ?? item.span}
								isSelected={item.id === selectedAudioId}
								onSelectAudio={onSelectAudio}
							/>
						))}
					</Row>
				);
			})}
		</>
	);
});

export default function TimelineCanvas({
	items,
	videoDurationMs,
	currentTimeMs,
	onSeek,
	onAddZoomAtMs,
	canPlaceZoomAtMs,
	onAddZoomOutAtMs,
	canPlaceZoomOutAtMs,
	onAddCaptionAtMs,
	canPlaceCaptionAtMs,
	resolveCaptionSpanAtMs,
	captionsEnabled,
	captionQuickAddEnabled,
	onSelectZoom,
	onSelectZoomOut,
	onSelectClip,
	onSelectAnnotation,
	onSelectAudio,
	onSelectCaption,
	onSelectTransition,
	onSelectMeme,
	selectedZoomId,
	selectedZoomOutId,
	selectedClipId,
	selectedAnnotationId,
	selectedAudioId,
	selectedCaptionId,
	selectedTransitionId,
	selectedMemeId,
	selectAllBlocksActive = false,
	onClearBlockSelection,
	keyframes = [],
	sourceAudioTracks = [],
	getSourceAudioTrackSettingsForClip,
	showSourceAudioTrack = false,
	liveSpanPreviewById,
	liveHiddenItemIds,
	isDragging = false,
	isLoading = false,
	isVertical = false,
	transitionRegions,
	onApplyCutTransition,
	onRemoveTransition,
}: TimelineCanvasProps) {
	const { setTimelineRef, style, sidebarWidth, direction, range, valueToPixels, pixelsToValue } =
		useTimelineContext();
	const localTimelineRef = useRef<HTMLDivElement | null>(null);
	const [isSeeking, setIsSeeking] = useState(false);
	const seekRafRef = useRef<number | null>(null);
	const pendingSeekClientXRef = useRef<number | null>(null);

	const setRefs = useCallback(
		(node: HTMLDivElement | null) => {
			setTimelineRef(node);
			localTimelineRef.current = node;
		},
		[setTimelineRef],
	);

	const handleTimelineClick = useCallback(
		(e: MouseEvent<HTMLDivElement>) => {
			if (isSeeking) return;
			if (!onSeek || videoDurationMs <= 0) return;

			if (onClearBlockSelection) {
				onClearBlockSelection();
			} else {
				onSelectZoom?.(null);
				onSelectZoomOut?.(null);
				onSelectClip?.(null);
				onSelectAnnotation?.(null);
				onSelectAudio?.(null);
				onSelectCaption?.(null);
				onSelectTransition?.(null);
				onSelectMeme?.(null);
			}

			const rect = e.currentTarget.getBoundingClientRect();
			const clickX =
				direction === "rtl"
					? rect.right - sidebarWidth - e.clientX
					: e.clientX - rect.left - sidebarWidth;
			if (clickX < 0) return;
			const relativeMs = pixelsToValue(clickX);
			const absoluteMs = Math.max(0, Math.min(range.start + relativeMs, videoDurationMs));
			onSeek(absoluteMs / 1000);
		},
		[
			isSeeking,
			onSeek,
			onSelectZoom,
			onSelectZoomOut,
			onSelectClip,
			onSelectAnnotation,
			onSelectAudio,
			onSelectCaption,
			onSelectTransition,
			onSelectMeme,
			onClearBlockSelection,
			videoDurationMs,
			sidebarWidth,
			direction,
			range.start,
			pixelsToValue,
		],
	);

	const getAbsoluteMsFromClientX = useCallback(
		(clientX: number, rect: DOMRect) => {
			const clickX =
				direction === "rtl"
					? rect.right - sidebarWidth - clientX
					: clientX - rect.left - sidebarWidth;
			const relativeMs = pixelsToValue(clickX);
			return Math.max(0, Math.min(range.start + relativeMs, videoDurationMs));
		},
		[direction, pixelsToValue, range.start, sidebarWidth, videoDurationMs],
	);

	const handleTimelineMouseDown = useCallback(
		(e: MouseEvent<HTMLDivElement>) => {
			if (e.button !== 0 || !onSeek || videoDurationMs <= 0 || !localTimelineRef.current)
				return;
			if ((e.target as HTMLElement).closest("[data-timeline-item]")) {
				return;
			}

			if (onClearBlockSelection) {
				onClearBlockSelection();
			} else {
				onSelectZoom?.(null);
				onSelectZoomOut?.(null);
				onSelectClip?.(null);
				onSelectAnnotation?.(null);
				onSelectAudio?.(null);
				onSelectCaption?.(null);
				onSelectTransition?.(null);
				onSelectMeme?.(null);
			}

			const rect = localTimelineRef.current.getBoundingClientRect();
			onSeek(getAbsoluteMsFromClientX(e.clientX, rect) / 1000);
			setIsSeeking(true);
			e.preventDefault();
		},
		[
			getAbsoluteMsFromClientX,
			onClearBlockSelection,
			onSeek,
			onSelectAnnotation,
			onSelectAudio,
			onSelectCaption,
			onSelectTransition,
			onSelectMeme,
			onSelectClip,
			onSelectZoom,
			onSelectZoomOut,
			videoDurationMs,
		],
	);

	useEffect(() => {
		if (!isSeeking) return;

		const flushSeek = () => {
			seekRafRef.current = null;
			if (!onSeek || !localTimelineRef.current || pendingSeekClientXRef.current === null)
				return;
			const rect = localTimelineRef.current.getBoundingClientRect();
			onSeek(getAbsoluteMsFromClientX(pendingSeekClientXRef.current, rect) / 1000);
		};

		const handleMouseMove = (event: globalThis.MouseEvent) => {
			pendingSeekClientXRef.current = event.clientX;
			if (seekRafRef.current === null) {
				seekRafRef.current = requestAnimationFrame(flushSeek);
			}
		};

		const handleMouseUp = () => {
			if (seekRafRef.current !== null) {
				cancelAnimationFrame(seekRafRef.current);
				seekRafRef.current = null;
			}
			if (pendingSeekClientXRef.current !== null) {
				flushSeek();
			}
			pendingSeekClientXRef.current = null;
			setIsSeeking(false);
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);

		return () => {
			if (seekRafRef.current !== null) {
				cancelAnimationFrame(seekRafRef.current);
				seekRafRef.current = null;
			}
			pendingSeekClientXRef.current = null;
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};
	}, [getAbsoluteMsFromClientX, isSeeking, onSeek]);

	const timelineRowCount = useMemo(() => {
		const annotationRowIds = new Set<string>();
		const audioRowIds = new Set<string>();
		const keystrokeRowIds = new Set<string>();
		const memeRowIds = new Set<string>();
		let hasCaptionRow = false;
		let hasZoomOutRow = false;
		for (const item of items) {
			if (isAnnotationTrackRowId(item.rowId)) annotationRowIds.add(item.rowId);
			if (isAudioTrackRowId(item.rowId)) audioRowIds.add(item.rowId);
			if (isKeystrokeTrackRowId(item.rowId)) keystrokeRowIds.add(item.rowId);
			if (isMemeTrackRowId(item.rowId)) memeRowIds.add(item.rowId);
			if (item.rowId === CAPTION_ROW_ID) hasCaptionRow = true;
			if (item.rowId === ZOOM_OUT_ROW_ID) hasZoomOutRow = true;
		}
		const sourceAudioRows = showSourceAudioTrack ? sourceAudioTracks.length : 0;
		// The caption lane is always shown when captions are enabled (even before any cue
		// exists), so count it whenever captionsEnabled — not only when a caption item is
		// present — or the min-height/stretch math undersizes the empty lane.
		const captionRows = hasCaptionRow || captionsEnabled ? 1 : 0;
		const zoomOutRows = hasZoomOutRow || isVertical ? 1 : 0;
		return (
			2 +
			sourceAudioRows +
			annotationRowIds.size +
			audioRowIds.size +
			captionRows +
			zoomOutRows +
			keystrokeRowIds.size +
			memeRowIds.size
		);
	}, [items, showSourceAudioTrack, sourceAudioTracks.length, captionsEnabled, isVertical]);
	const timelineRowsMinHeightPx = getTimelineRowsMinHeightPx(timelineRowCount);
	const timelineContentMinHeightPx = getTimelineContentMinHeightPx(timelineRowCount);
	const timelineViewportStretchFactor = getTimelineViewportStretchFactor(timelineRowCount);
	const sideProperty = direction === "rtl" ? "right" : "left";
	const {
		canShowGhostPlayhead,
		timelineGhostOffsetPx,
		handleTimelineMouseEnter,
		handleTimelineMouseMove,
		handleTimelineMouseLeave,
		canShowGhostZoom,
		ghostStartMs,
		ghostStartOffsetPx,
		ghostWidthPx,
		handleZoomRowMouseEnter,
		handleZoomRowMouseMove,
		handleZoomRowMouseLeave,
		handleZoomRowMouseDown,
		handleZoomRowClick,
		canShowGhostZoomOut,
		ghostZoomOutStartMs,
		ghostZoomOutStartOffsetPx,
		ghostZoomOutWidthPx,
		handleZoomOutRowMouseEnter,
		handleZoomOutRowMouseMove,
		handleZoomOutRowMouseLeave,
		handleZoomOutRowMouseDown,
		handleZoomOutRowClick,
		canShowGhostCaption,
		captionGhostStartMs,
		captionGhostStartOffsetPx,
		captionGhostWidthPx,
		handleCaptionRowMouseEnter,
		handleCaptionRowMouseMove,
		handleCaptionRowMouseLeave,
		handleCaptionRowMouseDown,
		handleCaptionRowClick,
	} = useTimelineHover({
		direction,
		sidebarWidth,
		rangeStart: range.start,
		rangeEnd: range.end,
		videoDurationMs,
		onAddZoomAtMs,
		canPlaceZoomAtMs,
		onAddZoomOutAtMs,
		canPlaceZoomOutAtMs,
		onAddCaptionAtMs,
		canPlaceCaptionAtMs,
		resolveCaptionSpanAtMs,
		captionsEnabled,
		captionQuickAddEnabled,
		isDragging,
		valueToPixels,
	});

	return (
		<div
			ref={setRefs}
			style={{
				...style,
				height: `max(100%, ${timelineContentMinHeightPx}px, calc(${TIMELINE_AXIS_HEIGHT_PX}px + (100% - ${TIMELINE_AXIS_HEIGHT_PX}px) * ${timelineViewportStretchFactor}))`,
			}}
			className="select-none bg-editor-bg relative cursor-pointer group flex flex-col"
			onMouseDown={handleTimelineMouseDown}
			onClick={handleTimelineClick}
			onMouseEnter={handleTimelineMouseEnter}
			onMouseMove={handleTimelineMouseMove}
			onMouseLeave={handleTimelineMouseLeave}
		>
			<TimelineAxis videoDurationMs={videoDurationMs} currentTimeMs={currentTimeMs} />
			<PlaybackCursor
				currentTimeMs={currentTimeMs}
				videoDurationMs={videoDurationMs}
				onSeek={onSeek}
				timelineRef={localTimelineRef}
				keyframes={keyframes}
				isLoading={isLoading}
			/>
			{canShowGhostPlayhead && (
				<div
					className="absolute top-0 bottom-0 z-[45] pointer-events-none"
					style={{
						[sideProperty === "right" ? "marginRight" : "marginLeft"]:
							`${sidebarWidth - 1}px`,
					}}
				>
					<div
						className="absolute top-0 bottom-0 w-px bg-foreground/35"
						style={{ [sideProperty]: `${timelineGhostOffsetPx}px` }}
					/>
				</div>
			)}

			<div
				className="relative z-10 flex flex-1 min-h-0 flex-col"
				style={{ minHeight: timelineRowsMinHeightPx }}
			>
				<TimelineCanvasRows
					items={items}
					videoDurationMs={videoDurationMs}
					selectAllBlocksActive={selectAllBlocksActive}
					selectedZoomId={selectedZoomId}
					selectedZoomOutId={selectedZoomOutId}
					selectedClipId={selectedClipId}
					selectedAnnotationId={selectedAnnotationId}
					selectedAudioId={selectedAudioId}
					selectedCaptionId={selectedCaptionId}
					selectedTransitionId={selectedTransitionId}
					selectedMemeId={selectedMemeId}
					onSelectZoom={onSelectZoom}
					onSelectZoomOut={onSelectZoomOut}
					onSelectClip={onSelectClip}
					onSelectAnnotation={onSelectAnnotation}
					onSelectAudio={onSelectAudio}
					onSelectCaption={onSelectCaption}
					onSelectTransition={onSelectTransition}
					onSelectMeme={onSelectMeme}
					onSeek={onSeek}
					sourceAudioTracks={sourceAudioTracks}
					getSourceAudioTrackSettingsForClip={getSourceAudioTrackSettingsForClip}
					showSourceAudioTrack={showSourceAudioTrack}
					liveSpanPreviewById={liveSpanPreviewById}
					liveHiddenItemIds={liveHiddenItemIds}
					direction={direction}
					isVertical={isVertical}
					canShowGhostZoom={canShowGhostZoom}
					ghostStartMs={ghostStartMs}
					ghostStartOffsetPx={ghostStartOffsetPx}
					ghostWidthPx={ghostWidthPx}
					onZoomRowMouseEnter={handleZoomRowMouseEnter}
					onZoomRowMouseMove={handleZoomRowMouseMove}
					onZoomRowMouseLeave={handleZoomRowMouseLeave}
					onZoomRowMouseDown={handleZoomRowMouseDown}
					onZoomRowClick={handleZoomRowClick}
					canShowGhostZoomOut={canShowGhostZoomOut}
					ghostZoomOutStartMs={ghostZoomOutStartMs}
					ghostZoomOutStartOffsetPx={ghostZoomOutStartOffsetPx}
					ghostZoomOutWidthPx={ghostZoomOutWidthPx}
					onZoomOutRowMouseEnter={handleZoomOutRowMouseEnter}
					onZoomOutRowMouseMove={handleZoomOutRowMouseMove}
					onZoomOutRowMouseLeave={handleZoomOutRowMouseLeave}
					onZoomOutRowMouseDown={handleZoomOutRowMouseDown}
					onZoomOutRowClick={handleZoomOutRowClick}
					captionsEnabled={captionsEnabled}
					canShowGhostCaption={canShowGhostCaption}
					captionGhostStartMs={captionGhostStartMs}
					captionGhostStartOffsetPx={captionGhostStartOffsetPx}
					captionGhostWidthPx={captionGhostWidthPx}
					onCaptionRowMouseEnter={handleCaptionRowMouseEnter}
					onCaptionRowMouseMove={handleCaptionRowMouseMove}
					onCaptionRowMouseLeave={handleCaptionRowMouseLeave}
					onCaptionRowMouseDown={handleCaptionRowMouseDown}
					onCaptionRowClick={handleCaptionRowClick}
					transitionRegions={transitionRegions}
					onApplyCutTransition={onApplyCutTransition}
					onRemoveTransition={onRemoveTransition}
				/>
			</div>
		</div>
	);
}
