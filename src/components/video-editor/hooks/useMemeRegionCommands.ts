import type { Span } from "dnd-timeline";
import { type Dispatch, type SetStateAction, useCallback, useRef } from "react";
import type { EditorEffectSection, MemeRegion } from "../types";

export interface AddMemeParams {
	videoPath: string;
	name: string;
	startMs: number;
	durationMs?: number;
	totalMs: number;
	greenScreen?: boolean;
	chromaKeySimilarity?: number;
	trackIndex?: number;
}

interface UseMemeRegionCommandsParams {
	setMemeRegions: Dispatch<SetStateAction<MemeRegion[]>>;
	selectedMemeId: string | null;
	setSelectedMemeId: Dispatch<SetStateAction<string | null>>;
	setSelectedZoomId: Dispatch<SetStateAction<string | null>>;
	setSelectedClipId: Dispatch<SetStateAction<string | null>>;
	setSelectedAnnotationId: Dispatch<SetStateAction<string | null>>;
	setSelectedAudioId: Dispatch<SetStateAction<string | null>>;
	setSelectedCaptionId: Dispatch<SetStateAction<string | null>>;
	setSelectedTransitionId: Dispatch<SetStateAction<string | null>>;
	setActiveEffectSection: Dispatch<SetStateAction<EditorEffectSection>>;
}

const DEFAULT_MEME_DURATION_MS = 3000;

export function useMemeRegionCommands({
	setMemeRegions,
	selectedMemeId,
	setSelectedMemeId,
	setSelectedZoomId,
	setSelectedClipId,
	setSelectedAnnotationId,
	setSelectedAudioId,
	setSelectedCaptionId,
	setSelectedTransitionId,
	setActiveEffectSection,
}: UseMemeRegionCommandsParams) {
	const nextMemeIdRef = useRef(1);

	const clearOtherSelections = useCallback(() => {
		setSelectedZoomId(null);
		setSelectedClipId(null);
		setSelectedAnnotationId(null);
		setSelectedAudioId(null);
		setSelectedCaptionId(null);
		setSelectedTransitionId(null);
	}, [
		setSelectedAnnotationId,
		setSelectedAudioId,
		setSelectedCaptionId,
		setSelectedClipId,
		setSelectedTransitionId,
		setSelectedZoomId,
	]);

	const handleSelectMeme = useCallback(
		(id: string | null) => {
			setSelectedMemeId(id);
			if (id) {
				clearOtherSelections();
				setActiveEffectSection("memes");
			}
		},
		[clearOtherSelections, setActiveEffectSection, setSelectedMemeId],
	);

	const handleAddMeme = useCallback(
		({
			videoPath,
			name,
			startMs,
			durationMs,
			totalMs,
			greenScreen,
			chromaKeySimilarity,
			trackIndex,
		}: AddMemeParams) => {
			const duration = Math.max(
				1,
				Math.min(Math.round(durationMs ?? DEFAULT_MEME_DURATION_MS), Math.max(0, totalMs)),
			);
			const latestStart = Math.max(0, totalMs - duration);
			const start = Math.max(0, Math.min(Math.round(startMs), latestStart));
			const end = Math.min(start + duration, totalMs);
			if (end <= start) return;

			const id = `meme-${nextMemeIdRef.current++}`;
			const region: MemeRegion = {
				id,
				startMs: start,
				endMs: end,
				videoPath,
				name,
				position: { x: 30, y: 30 },
				size: { width: 30, height: 30 },
				volume: 1,
				greenScreen: Boolean(greenScreen),
				...(greenScreen
					? {
							chromaKeySimilarity: Math.min(
								0.6,
								Math.max(0.1, chromaKeySimilarity ?? 0.3),
							),
						}
					: {}),
				trackIndex: trackIndex ?? 0,
			};
			setMemeRegions((current) => [...current, region]);
			setSelectedMemeId(id);
			clearOtherSelections();
			setActiveEffectSection("memes");
		},
		[
			clearOtherSelections,
			setActiveEffectSection,
			setMemeRegions,
			setSelectedMemeId,
		],
	);

	const handleMemeSpanChange = useCallback(
		(id: string, span: Span, trackIndex?: number) => {
			const normalizedTrackIndex =
				typeof trackIndex === "number" && Number.isFinite(trackIndex)
					? Math.max(0, Math.floor(trackIndex))
					: undefined;
			setMemeRegions((current) =>
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
		[setMemeRegions],
	);

	const handleMemeUpdate = useCallback(
		(id: string, updates: Partial<Omit<MemeRegion, "id">>) => {
			setMemeRegions((current) =>
				current.map((region) => (region.id === id ? { ...region, ...updates, id: region.id } : region)),
			);
		},
		[setMemeRegions],
	);

	const handleUpdateMemePosition = useCallback(
		(id: string, position: { x: number; y: number }) => {
			handleMemeUpdate(id, { position });
		},
		[handleMemeUpdate],
	);

	const handleUpdateMemeSize = useCallback(
		(id: string, size: { width: number; height: number }) => {
			handleMemeUpdate(id, { size });
		},
		[handleMemeUpdate],
	);

	const handleUpdateMemeVolume = useCallback(
		(id: string, volume: number) => {
			if (!Number.isFinite(volume)) return;
			handleMemeUpdate(id, { volume: Math.max(0, Math.min(1, volume)) });
		},
		[handleMemeUpdate],
	);

	const handleMemeDelete = useCallback(
		(id: string) => {
			setMemeRegions((current) => current.filter((region) => region.id !== id));
			if (selectedMemeId === id) setSelectedMemeId(null);
		},
		[selectedMemeId, setSelectedMemeId, setMemeRegions],
	);

	return {
		handleSelectMeme,
		handleAddMeme,
		handleMemeSpanChange,
		handleMemeUpdate,
		handleUpdateMemePosition,
		handleUpdateMemeSize,
		handleUpdateMemeVolume,
		handleMemeDelete,
	};
}
