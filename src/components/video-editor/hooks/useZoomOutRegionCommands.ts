import type { Span } from "dnd-timeline";
import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback } from "react";
import type { ZoomOutRegion } from "../types";

interface UseZoomOutRegionCommandsParams {
	setZoomOutRegions: Dispatch<SetStateAction<ZoomOutRegion[]>>;
	selectedZoomOutId: string | null;
	setSelectedZoomOutId: Dispatch<SetStateAction<string | null>>;
	setSelectedZoomId?: Dispatch<SetStateAction<string | null>>;
	setSelectedAnnotationId?: Dispatch<SetStateAction<string | null>>;
	setSelectedAudioId?: Dispatch<SetStateAction<string | null>>;
	setSelectedCaptionId?: Dispatch<SetStateAction<string | null>>;
	setSelectedTransitionId?: Dispatch<SetStateAction<string | null>>;
	setSelectedMemeId?: Dispatch<SetStateAction<string | null>>;
	nextZoomOutIdRef: MutableRefObject<number>;
}

export function useZoomOutRegionCommands({
	setZoomOutRegions,
	selectedZoomOutId: _selectedZoomOutId,
	setSelectedZoomOutId,
	setSelectedZoomId,
	setSelectedAnnotationId,
	setSelectedAudioId,
	setSelectedCaptionId,
	setSelectedTransitionId,
	setSelectedMemeId,
	nextZoomOutIdRef,
}: UseZoomOutRegionCommandsParams) {
	const handleSelectZoomOut = useCallback(
		(id: string | null) => {
			setSelectedZoomOutId(id);
			if (id) {
				setSelectedZoomId?.(null);
				setSelectedAnnotationId?.(null);
				setSelectedAudioId?.(null);
				setSelectedCaptionId?.(null);
				setSelectedTransitionId?.(null);
				setSelectedMemeId?.(null);
			}
		},
		[
			setSelectedAnnotationId,
			setSelectedAudioId,
			setSelectedCaptionId,
			setSelectedMemeId,
			setSelectedTransitionId,
			setSelectedZoomId,
			setSelectedZoomOutId,
		],
	);

	const handleZoomOutAdded = useCallback(
		(span: Span) => {
			const id = `zoom-out-${nextZoomOutIdRef.current++}`;
			const newRegion: ZoomOutRegion = {
				id,
				startMs: Math.round(span.start),
				endMs: Math.round(span.end),
				label: "Full Window",
			};
			setZoomOutRegions((current) => [...current, newRegion]);
			setSelectedZoomOutId(id);
			setSelectedZoomId?.(null);
			setSelectedAnnotationId?.(null);
			setSelectedCaptionId?.(null);
		},
		[
			nextZoomOutIdRef,
			setSelectedAnnotationId,
			setSelectedCaptionId,
			setSelectedZoomId,
			setSelectedZoomOutId,
			setZoomOutRegions,
		],
	);

	const handleZoomOutSpanChange = useCallback(
		(id: string, span: Span) => {
			setZoomOutRegions((current) =>
				current.map((region) =>
					region.id === id
						? {
								...region,
								startMs: Math.round(span.start),
								endMs: Math.round(span.end),
							}
						: region,
				),
			);
		},
		[setZoomOutRegions],
	);

	const handleZoomOutDelete = useCallback(
		(id: string) => {
			setZoomOutRegions((current) => current.filter((region) => region.id !== id));
			setSelectedZoomOutId((current) => (current === id ? null : current));
		},
		[setSelectedZoomOutId, setZoomOutRegions],
	);

	return {
		handleSelectZoomOut,
		handleZoomOutAdded,
		handleZoomOutSpanChange,
		handleZoomOutDelete,
	};
}
