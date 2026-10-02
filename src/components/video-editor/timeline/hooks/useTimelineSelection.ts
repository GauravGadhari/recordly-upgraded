import { useCallback, useMemo, useState } from "react";
import type { TimelineRegion } from "../core/timelineTypes";

interface UseTimelineSelectionParams {
	totalMs: number;
	currentTimeMs: number;
	zoomRegions: TimelineRegion[];
	zoomOutRegions?: TimelineRegion[];
	clipRegions: TimelineRegion[];
	annotationRegions: (TimelineRegion & { zIndex: number })[];
	audioRegions: TimelineRegion[];
	selectedZoomId: string | null;
	selectedZoomOutId?: string | null;
	selectedClipId?: string | null;
	selectedAnnotationId?: string | null;
	selectedAudioId?: string | null;
	selectedCaptionId?: string | null;
	selectedTransitionId?: string | null;
	selectedMemeId?: string | null;
	onZoomDelete: (id: string) => void;
	onZoomOutDelete?: (id: string) => void;
	onClipDelete?: (id: string) => void;
	onAnnotationDelete?: (id: string) => void;
	onAudioDelete?: (id: string) => void;
	onCaptionDelete?: (id: string) => void;
	onTransitionDelete?: (id: string) => void;
	onMemeDelete?: (id: string) => void;
	onSelectZoom: (id: string | null) => void;
	onSelectZoomOut?: (id: string | null) => void;
	onSelectClip?: (id: string | null) => void;
	onSelectAnnotation?: (id: string | null) => void;
	onSelectAudio?: (id: string | null) => void;
	onSelectCaption?: (id: string | null) => void;
	onSelectTransition?: (id: string | null) => void;
	onSelectMeme?: (id: string | null) => void;
}

export function useTimelineSelection({
	totalMs,
	currentTimeMs,
	zoomRegions,
	annotationRegions,
	zoomOutRegions = [],
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
}: UseTimelineSelectionParams) {
	const [keyframes, setKeyframes] = useState<{ id: string; time: number }[]>([]);
	const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(null);
	const [selectAllBlocksActive, setSelectAllBlocksActive] = useState(false);
	const hasAnyZoomBlocks = useMemo(() => zoomRegions.length > 0, [zoomRegions.length]);

	const addKeyframe = useCallback(() => {
		if (totalMs === 0) return;
		const time = Math.max(0, Math.min(currentTimeMs, totalMs));
		if (keyframes.some((kf) => Math.abs(kf.time - time) < 1)) return;
		setKeyframes((prev) => [...prev, { id: globalThis.crypto.randomUUID(), time }]);
	}, [currentTimeMs, totalMs, keyframes]);

	const deleteSelectedKeyframe = useCallback(() => {
		if (!selectedKeyframeId) return;
		setKeyframes((prev) => prev.filter((kf) => kf.id !== selectedKeyframeId));
		setSelectedKeyframeId(null);
	}, [selectedKeyframeId]);

	const handleKeyframeMove = useCallback(
		(id: string, newTime: number) => {
			setKeyframes((prev) =>
				prev.map((kf) =>
					kf.id === id ? { ...kf, time: Math.max(0, Math.min(newTime, totalMs)) } : kf,
				),
			);
		},
		[totalMs],
	);

	const deleteSelectedZoom = useCallback(() => {
		if (selectAllBlocksActive) {
			zoomRegions.map((region) => region.id).forEach((id) => onZoomDelete(id));
		} else if (selectedZoomId) {
			onZoomDelete(selectedZoomId);
		} else {
			return;
		}

		onSelectZoom(null);
		onSelectClip?.(null);
		onSelectAnnotation?.(null);
		onSelectAudio?.(null);
		onSelectCaption?.(null);
		onSelectTransition?.(null);
		onSelectMeme?.(null);
		setSelectAllBlocksActive(false);
	}, [
		selectAllBlocksActive,
		zoomRegions,
		onZoomDelete,
		selectedZoomId,
		onSelectZoom,
		onSelectZoomOut,
		onSelectClip,
		onSelectAnnotation,
		onSelectAudio,
		onSelectCaption,
		onSelectTransition,
		onSelectMeme,
	]);

	const deleteSelectedZoomOut = useCallback(() => {
		if (selectAllBlocksActive) {
			zoomOutRegions.map((region) => region.id).forEach((id) => onZoomOutDelete?.(id));
		} else if (selectedZoomOutId) {
			onZoomOutDelete?.(selectedZoomOutId);
		} else {
			return;
		}

		onSelectZoomOut?.(null);
	}, [
		selectAllBlocksActive,
		zoomOutRegions,
		selectedZoomOutId,
		onZoomOutDelete,
		onSelectZoomOut,
	]);

	const deleteSelectedClip = useCallback(() => {
		if (!selectedClipId || !onClipDelete || !onSelectClip) return;
		onClipDelete(selectedClipId);
		onSelectClip(null);
	}, [selectedClipId, onClipDelete, onSelectClip]);

	const deleteSelectedAnnotation = useCallback(() => {
		if (!selectedAnnotationId || !onAnnotationDelete || !onSelectAnnotation) return;
		onAnnotationDelete(selectedAnnotationId);
		onSelectAnnotation(null);
	}, [selectedAnnotationId, onAnnotationDelete, onSelectAnnotation]);

	const deleteSelectedAudio = useCallback(() => {
		if (!selectedAudioId || !onAudioDelete || !onSelectAudio) return;
		onAudioDelete(selectedAudioId);
		onSelectAudio(null);
	}, [selectedAudioId, onAudioDelete, onSelectAudio]);

	const deleteSelectedCaption = useCallback(() => {
		if (!selectedCaptionId || !onCaptionDelete) return;
		onCaptionDelete(selectedCaptionId);
		onSelectCaption?.(null);
	}, [selectedCaptionId, onCaptionDelete, onSelectCaption]);

	const deleteSelectedTransition = useCallback(() => {
		if (!selectedTransitionId || !onTransitionDelete) return;
		onTransitionDelete(selectedTransitionId);
		onSelectTransition?.(null);
	}, [selectedTransitionId, onTransitionDelete, onSelectTransition]);

	const deleteSelectedMeme = useCallback(() => {
		if (!selectedMemeId || !onMemeDelete) return;
		onMemeDelete(selectedMemeId);
		onSelectMeme?.(null);
	}, [selectedMemeId, onMemeDelete, onSelectMeme]);

	const clearSelectedBlocks = useCallback(() => {
		onSelectZoom(null);
		onSelectZoomOut?.(null);
		onSelectClip?.(null);
		onSelectAnnotation?.(null);
		onSelectAudio?.(null);
		onSelectCaption?.(null);
		onSelectTransition?.(null);
		onSelectMeme?.(null);
		setSelectAllBlocksActive(false);
	}, [
		onSelectZoom,
		onSelectZoomOut,
		onSelectClip,
		onSelectAnnotation,
		onSelectAudio,
		onSelectCaption,
		onSelectTransition,
		onSelectMeme,
	]);

	const activateSelectAllZooms = useCallback(() => {
		onSelectZoom(null);
		onSelectZoomOut?.(null);
		onSelectClip?.(null);
		onSelectAnnotation?.(null);
		onSelectAudio?.(null);
		onSelectCaption?.(null);
		onSelectTransition?.(null);
		onSelectMeme?.(null);
		setSelectedKeyframeId(null);
		setSelectAllBlocksActive(true);
	}, [
		onSelectZoom,
		onSelectZoomOut,
		onSelectClip,
		onSelectAnnotation,
		onSelectAudio,
		onSelectCaption,
		onSelectTransition,
		onSelectMeme,
	]);

	const handleSelectZoom = useCallback(
		(id: string | null) => {
			setSelectAllBlocksActive(false);
			onSelectZoom(id);
		},
		[onSelectZoom],
	);

	const handleSelectZoomOut = useCallback(
		(id: string | null) => {
			setSelectAllBlocksActive(false);
			onSelectZoomOut?.(id);
		},
		[onSelectZoomOut],
	);

	const handleSelectClip = useCallback(
		(id: string | null) => {
			setSelectAllBlocksActive(false);
			onSelectClip?.(id);
		},
		[onSelectClip],
	);

	const handleSelectAnnotation = useCallback(
		(id: string | null) => {
			setSelectAllBlocksActive(false);
			onSelectAnnotation?.(id);
		},
		[onSelectAnnotation],
	);

	const handleSelectAudio = useCallback(
		(id: string | null) => {
			setSelectAllBlocksActive(false);
			onSelectAudio?.(id);
		},
		[onSelectAudio],
	);

	const handleSelectCaption = useCallback(
		(id: string | null) => {
			setSelectAllBlocksActive(false);
			onSelectCaption?.(id);
		},
		[onSelectCaption],
	);

	const handleSelectTransition = useCallback(
		(id: string | null) => {
			setSelectAllBlocksActive(false);
			onSelectTransition?.(id);
		},
		[onSelectTransition],
	);

	const handleSelectMeme = useCallback(
		(id: string | null) => {
			setSelectAllBlocksActive(false);
			onSelectMeme?.(id);
		},
		[onSelectMeme],
	);

	const cycleAnnotationsAtCurrentTime = useCallback(
		(backward = false) => {
			const overlapping = annotationRegions
				.filter((a) => currentTimeMs >= a.startMs && currentTimeMs <= a.endMs)
				.sort((a, b) => a.zIndex - b.zIndex);
			if (overlapping.length === 0) {
				return false;
			}

			if (!selectedAnnotationId || !overlapping.some((a) => a.id === selectedAnnotationId)) {
				onSelectAnnotation?.(overlapping[0].id);
				return true;
			}

			const currentIndex = overlapping.findIndex((a) => a.id === selectedAnnotationId);
			const nextIndex = backward
				? (currentIndex - 1 + overlapping.length) % overlapping.length
				: (currentIndex + 1) % overlapping.length;
			onSelectAnnotation?.(overlapping[nextIndex].id);
			return true;
		},
		[annotationRegions, currentTimeMs, selectedAnnotationId, onSelectAnnotation],
	);

	return {
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
	};
}
