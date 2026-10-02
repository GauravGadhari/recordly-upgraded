import { type MutableRefObject, useCallback, useEffect, useRef, useState } from "react";
import {
	createEditorHistoryStack,
	type EditorHistorySnapshot,
	recordEditorHistorySnapshot,
	redoEditorHistoryStack,
	resetEditorHistoryStack,
	undoEditorHistoryStack,
} from "../editorHistory";
import { deriveNextId } from "../projectPersistence";
import type { useTimelineState } from "../state/useTimelineState";
import { cloneStructured } from "../videoEditorUtils";

type Input = {
	timeline: ReturnType<typeof useTimelineState>;
	nextZoomIdRef: MutableRefObject<number>;
	nextZoomOutIdRef: MutableRefObject<number>;
	nextClipIdRef: MutableRefObject<number>;
	nextAnnotationIdRef: MutableRefObject<number>;
	nextAudioIdRef: MutableRefObject<number>;
	nextAnnotationZIndexRef: MutableRefObject<number>;
};

export function useEditorHistory({
	timeline,
	nextZoomIdRef,
	nextZoomOutIdRef,
	nextClipIdRef,
	nextAnnotationIdRef,
	nextAudioIdRef,
	nextAnnotationZIndexRef,
}: Input) {
	const {
		zoomRegions,
		zoomOutRegions,
		clipRegions,
		speedRegions,
		annotationRegions,
		audioRegions,
		autoCaptions,
		selectedZoomId,
		selectedZoomOutId,
		selectedClipId,
		selectedAnnotationId,
		selectedAudioId,
		setZoomRegions,
		setZoomOutRegions,
		setClipRegions,
		setSpeedRegions,
		setAnnotationRegions,
		setAudioRegions,
		setAutoCaptions,
		setSelectedZoomId,
		setSelectedZoomOutId,
		setSelectedClipId,
		setSelectedAnnotationId,
		setSelectedAudioId,
	} = timeline;
	const historyRef = useRef(createEditorHistoryStack());
	const applyingRef = useRef(false);
	const [historyFlags, setHistoryFlags] = useState({ canUndo: false, canRedo: false });
	const syncButtons = useCallback(() => {
		const next = {
			canUndo: historyRef.current.past.length > 0,
			canRedo: historyRef.current.future.length > 0,
		};
		setHistoryFlags((current) =>
			current.canUndo === next.canUndo && current.canRedo === next.canRedo ? current : next,
		);
	}, []);
	const buildSnapshot = useCallback(
		(): EditorHistorySnapshot => ({
			zoomRegions,
			zoomOutRegions,
			clipRegions,
			speedRegions,
			annotationRegions,
			audioRegions,
			autoCaptions,
			selectedZoomId,
			selectedZoomOutId,
			selectedClipId,
			selectedAnnotationId,
			selectedAudioId,
		}),
		[
			zoomRegions,
			zoomOutRegions,
			clipRegions,
			speedRegions,
			annotationRegions,
			audioRegions,
			autoCaptions,
			selectedZoomId,
			selectedZoomOutId,
			selectedClipId,
			selectedAnnotationId,
			selectedAudioId,
		],
	);
	const applySnapshot = useCallback(
		(snapshot: EditorHistorySnapshot) => {
			applyingRef.current = true;
			const cloned = cloneStructured(snapshot);
			setZoomRegions(cloned.zoomRegions);
			setZoomOutRegions(cloned.zoomOutRegions ?? []);
			setClipRegions(cloned.clipRegions);
			setSpeedRegions(cloned.speedRegions);
			setAnnotationRegions(cloned.annotationRegions);
			setAudioRegions(cloned.audioRegions);
			setAutoCaptions(cloned.autoCaptions);
			setSelectedZoomId(cloned.selectedZoomId);
			setSelectedZoomOutId(cloned.selectedZoomOutId ?? null);
			setSelectedClipId(cloned.selectedClipId);
			setSelectedAnnotationId(cloned.selectedAnnotationId);
			setSelectedAudioId(cloned.selectedAudioId);
			nextZoomIdRef.current = deriveNextId(
				"zoom",
				cloned.zoomRegions.map(({ id }) => id),
			);
			nextZoomOutIdRef.current = deriveNextId(
				"zoom-out",
				(cloned.zoomOutRegions ?? []).map(({ id }) => id),
			);
			nextClipIdRef.current = deriveNextId(
				"clip",
				cloned.clipRegions.map(({ id }) => id),
			);
			nextAnnotationIdRef.current = deriveNextId(
				"annotation",
				cloned.annotationRegions.map(({ id }) => id),
			);
			nextAudioIdRef.current = deriveNextId(
				"audio",
				cloned.audioRegions.map(({ id }) => id),
			);
			nextAnnotationZIndexRef.current =
				cloned.annotationRegions.reduce((max, region) => Math.max(max, region.zIndex), 0) +
				1;
		},
		[
			setZoomRegions,
			setZoomOutRegions,
			setClipRegions,
			setSpeedRegions,
			setAnnotationRegions,
			setAudioRegions,
			setAutoCaptions,
			setSelectedZoomId,
			setSelectedZoomOutId,
			setSelectedClipId,
			setSelectedAnnotationId,
			setSelectedAudioId,
			nextZoomIdRef,
			nextZoomOutIdRef,
			nextClipIdRef,
			nextAnnotationIdRef,
			nextAudioIdRef,
			nextAnnotationZIndexRef,
		],
	);
	const handleUndo = useCallback(() => {
		const previous = undoEditorHistoryStack(historyRef.current, buildSnapshot());
		if (previous) {
			applySnapshot(previous);
			syncButtons();
		}
	}, [applySnapshot, buildSnapshot, syncButtons]);
	const handleRedo = useCallback(() => {
		const next = redoEditorHistoryStack(historyRef.current, buildSnapshot());
		if (next) {
			applySnapshot(next);
			syncButtons();
		}
	}, [applySnapshot, buildSnapshot, syncButtons]);
	const resetHistory = useCallback(() => {
		resetEditorHistoryStack(historyRef.current);
		applyingRef.current = false;
		syncButtons();
	}, [syncButtons]);

	useEffect(() => {
		const result = recordEditorHistorySnapshot(historyRef.current, buildSnapshot(), {
			applyingHistory: applyingRef.current,
		});
		if (result === "applied") applyingRef.current = false;
		if (result !== "unchanged") syncButtons();
	}, [buildSnapshot, syncButtons]);

	return {
		...historyFlags,
		handleUndo,
		handleRedo,
		resetHistory,
	};
}
