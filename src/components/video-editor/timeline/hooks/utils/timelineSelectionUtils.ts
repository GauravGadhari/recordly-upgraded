export type DeleteSelectionTarget =
	| "keyframe"
	| "zoom"
	| "zoom-out"
	| "clip"
	| "annotation"
	| "audio"
	| "caption"
	| "transition"
	| "meme"
	| "none";

interface ResolveDeleteSelectionTargetParams {
	selectAllBlocksActive: boolean;
	selectedKeyframeId: string | null;
	selectedZoomId: string | null;
	selectedZoomOutId?: string | null;
	selectedClipId?: string | null;
	selectedAnnotationId?: string | null;
	selectedAudioId?: string | null;
	selectedCaptionId?: string | null;
	selectedTransitionId?: string | null;
	selectedMemeId?: string | null;
}

export function resolveDeleteSelectionTarget({
	selectAllBlocksActive,
	selectedKeyframeId,
	selectedZoomId,
	selectedZoomOutId,
	selectedClipId,
	selectedAnnotationId,
	selectedAudioId,
	selectedCaptionId,
	selectedTransitionId,
	selectedMemeId,
}: ResolveDeleteSelectionTargetParams): DeleteSelectionTarget {
	if (selectAllBlocksActive) return "zoom";
	if (selectedKeyframeId) return "keyframe";
	if (selectedZoomId) return "zoom";
	if (selectedZoomOutId) return "zoom-out";
	if (selectedClipId) return "clip";
	if (selectedAnnotationId) return "annotation";
	if (selectedAudioId) return "audio";
	if (selectedCaptionId) return "caption";
	if (selectedTransitionId) return "transition";
	if (selectedMemeId) return "meme";
	return "none";
}
