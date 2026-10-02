import {
	ANNOTATION_ROW_ID,
	ANNOTATION_ROW_PREFIX,
	AUDIO_ROW_ID,
	AUDIO_ROW_PREFIX,
	KEYSTROKE_ROW_ID,
	KEYSTROKE_ROW_PREFIX,
	MEME_ROW_ID,
	MEME_ROW_PREFIX,
	TRANSITION_ROW_ID,
	TRANSITION_ROW_PREFIX,
} from "./constants";

export function getAnnotationTrackRowId(trackIndex: number) {
	return `${ANNOTATION_ROW_ID}-${Math.max(0, Math.floor(trackIndex))}`;
}

export function isAnnotationTrackRowId(rowId: string) {
	return rowId === ANNOTATION_ROW_ID || rowId.startsWith(ANNOTATION_ROW_PREFIX);
}

export function getAnnotationTrackIndex(rowId: string) {
	if (rowId === ANNOTATION_ROW_ID) {
		return 0;
	}

	const parsed = Number.parseInt(rowId.slice(ANNOTATION_ROW_PREFIX.length), 10);
	return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function getAudioTrackRowId(trackIndex: number) {
	return `${AUDIO_ROW_PREFIX}${Math.max(0, Math.floor(trackIndex))}`;
}

export function isAudioTrackRowId(rowId: string) {
	return rowId === AUDIO_ROW_ID || rowId.startsWith(AUDIO_ROW_PREFIX);
}

export function getAudioTrackIndex(rowId: string) {
	if (rowId === AUDIO_ROW_ID) {
		return 0;
	}

	const parsed = Number.parseInt(rowId.slice(AUDIO_ROW_PREFIX.length), 10);
	return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function getKeystrokeTrackRowId(trackIndex: number) {
	const index = Math.max(0, Math.floor(trackIndex));
	return index === 0 ? KEYSTROKE_ROW_ID : `${KEYSTROKE_ROW_PREFIX}${index}`;
}

export function isKeystrokeTrackRowId(rowId: string) {
	return rowId === KEYSTROKE_ROW_ID || rowId.startsWith(KEYSTROKE_ROW_PREFIX);
}

export function getKeystrokeTrackIndex(rowId: string) {
	if (rowId === KEYSTROKE_ROW_ID) {
		return 0;
	}

	const parsed = Number.parseInt(rowId.slice(KEYSTROKE_ROW_PREFIX.length), 10);
	return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function getTransitionTrackRowId(trackIndex: number) {
	const index = Math.max(0, Math.floor(trackIndex));
	return index === 0 ? TRANSITION_ROW_ID : `${TRANSITION_ROW_PREFIX}${index}`;
}

export function isTransitionTrackRowId(rowId: string) {
	return rowId === TRANSITION_ROW_ID || rowId.startsWith(TRANSITION_ROW_PREFIX);
}

export function getTransitionTrackIndex(rowId: string) {
	if (rowId === TRANSITION_ROW_ID) {
		return 0;
	}

	const parsed = Number.parseInt(rowId.slice(TRANSITION_ROW_PREFIX.length), 10);
	return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function getMemeTrackRowId(trackIndex: number) {
	const index = Math.max(0, Math.floor(trackIndex));
	return index === 0 ? MEME_ROW_ID : `${MEME_ROW_PREFIX}${index}`;
}

export function isMemeTrackRowId(rowId: string) {
	return rowId === MEME_ROW_ID || rowId.startsWith(MEME_ROW_PREFIX);
}

export function getMemeTrackIndex(rowId: string) {
	if (rowId === MEME_ROW_ID) {
		return 0;
	}

	const parsed = Number.parseInt(rowId.slice(MEME_ROW_PREFIX.length), 10);
	return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}
