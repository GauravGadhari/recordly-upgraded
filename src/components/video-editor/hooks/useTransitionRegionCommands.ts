import type { Span } from "dnd-timeline";
import { type Dispatch, type SetStateAction, useCallback, useRef } from "react";
import type { EditorEffectSection, TransitionRegion, TransitionType } from "../types";

export interface AddTransitionParams {
	type: TransitionType;
	startMs: number;
	durationMs: number;
	totalMs: number;
	overlayVideoPath?: string;
	sfxAudioPath?: string;
	name?: string;
	trackIndex?: number;
	greenScreen?: boolean;
	chromaKeySimilarity?: number;
	blendMode?: "screen" | "chroma-key" | "normal";
}

interface UseTransitionRegionCommandsParams {
	setTransitionRegions: Dispatch<SetStateAction<TransitionRegion[]>>;
	selectedTransitionId: string | null;
	setSelectedTransitionId: Dispatch<SetStateAction<string | null>>;
	setSelectedZoomId: Dispatch<SetStateAction<string | null>>;
	setSelectedClipId: Dispatch<SetStateAction<string | null>>;
	setSelectedAnnotationId: Dispatch<SetStateAction<string | null>>;
	setSelectedAudioId: Dispatch<SetStateAction<string | null>>;
	setSelectedCaptionId: Dispatch<SetStateAction<string | null>>;
	setSelectedMemeId: Dispatch<SetStateAction<string | null>>;
	setActiveEffectSection?: Dispatch<SetStateAction<EditorEffectSection>>;
}

export function useTransitionRegionCommands({
	setTransitionRegions,
	selectedTransitionId,
	setSelectedTransitionId,
	setSelectedZoomId,
	setSelectedClipId,
	setSelectedAnnotationId,
	setSelectedAudioId,
	setSelectedCaptionId,
	setSelectedMemeId,
	setActiveEffectSection: _setActiveEffectSection,
}: UseTransitionRegionCommandsParams) {
	const nextTransitionIdRef = useRef(1);

	const clearOtherSelections = useCallback(
		() => {
			setSelectedZoomId(null);
			setSelectedClipId(null);
			setSelectedAnnotationId(null);
			setSelectedAudioId(null);
			setSelectedCaptionId(null);
			setSelectedMemeId(null);
		},
		[
			setSelectedAnnotationId,
			setSelectedAudioId,
			setSelectedCaptionId,
			setSelectedClipId,
			setSelectedMemeId,
			setSelectedZoomId,
		],
	);

	const handleSelectTransition = useCallback(
		(id: string | null) => {
			setSelectedTransitionId(id);
			if (id) {
				clearOtherSelections();
			}
		},
		[clearOtherSelections, setSelectedTransitionId],
	);

	const handleAddTransition = useCallback(
		({
			type,
			startMs,
			durationMs,
			totalMs,
			overlayVideoPath,
			sfxAudioPath,
			name,
			trackIndex,
			greenScreen,
			chromaKeySimilarity,
			blendMode,
		}: AddTransitionParams) => {
			const clampedDuration = Math.max(
				1,
				Math.min(Math.round(durationMs), Math.max(0, totalMs)),
			);
			const latestStart = Math.max(0, totalMs - clampedDuration);
			const start = Math.max(0, Math.min(Math.round(startMs), latestStart));
			const end = Math.min(start + clampedDuration, totalMs);
			if (end <= start) return;

			const id = `transition-${nextTransitionIdRef.current++}`;
			const region: TransitionRegion = {
				id,
				startMs: start,
				endMs: end,
				type,
				name,
				...(overlayVideoPath ? { overlayVideoPath } : {}),
				...(sfxAudioPath ? { sfxAudioPath } : {}),
				trackIndex: trackIndex ?? 0,
				...(greenScreen !== undefined ? { greenScreen } : {}),
				...(chromaKeySimilarity !== undefined ? { chromaKeySimilarity } : {}),
				...(blendMode ? { blendMode } : {}),
			};
			setTransitionRegions((current) => [...current, region]);
			setSelectedTransitionId(id);
			clearOtherSelections();
		},
		[
			clearOtherSelections,
			setSelectedTransitionId,
			setTransitionRegions,
		],
	);

	const handleSetCutTransition = useCallback(
		({
			type,
			durationMs,
			cutTimeMs,
			existingId,
			totalMs,
		}: {
			type: TransitionType;
			durationMs: number;
			cutTimeMs: number;
			existingId?: string;
			totalMs: number;
		}) => {
			const half = Math.round(durationMs / 2);
			const startMs = Math.max(0, cutTimeMs - half);
			const endMs = Math.min(totalMs, cutTimeMs + half);

			if (existingId) {
				setTransitionRegions((current) =>
					current.map((r) =>
						r.id === existingId
							? {
									...r,
									type,
									startMs,
									endMs,
									name: `Transition: ${type}`,
								}
							: r,
					),
				);
			} else {
				const id = `transition-${nextTransitionIdRef.current++}`;
				const newRegion: TransitionRegion = {
					id,
					startMs,
					endMs,
					type,
					name: `Transition: ${type}`,
					trackIndex: 0,
				};
				setTransitionRegions((current) => [...current, newRegion]);
			}
		},
		[setTransitionRegions],
	);

	const handleTransitionSpanChange = useCallback(
		(id: string, span: Span, trackIndex?: number) => {
			const normalizedTrackIndex =
				typeof trackIndex === "number" && Number.isFinite(trackIndex)
					? Math.max(0, Math.floor(trackIndex))
					: undefined;
			setTransitionRegions((current) =>
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
		[setTransitionRegions],
	);

	const handleTransitionUpdate = useCallback(
		(id: string, updates: Partial<Omit<TransitionRegion, "id">>) => {
			setTransitionRegions((current) =>
				current.map((region) =>
					region.id === id ? { ...region, ...updates, id: region.id } : region,
				),
			);
		},
		[setTransitionRegions],
	);

	const handleTransitionDelete = useCallback(
		(id: string) => {
			setTransitionRegions((current) => current.filter((region) => region.id !== id));
			if (selectedTransitionId === id) setSelectedTransitionId(null);
		},
		[selectedTransitionId, setSelectedTransitionId, setTransitionRegions],
	);

	return {
		handleSelectTransition,
		handleAddTransition,
		handleSetCutTransition,
		handleTransitionSpanChange,
		handleTransitionUpdate,
		handleTransitionDelete,
	};
}
