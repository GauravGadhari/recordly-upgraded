import { type ClipRegion, getClipSourceStartMs, getSafeClipSpeed } from "./types";

export function changeClipSpan(
	clip: ClipRegion,
	startMs: number,
	endMs: number,
	sourceDurationMs: number,
): ClipRegion {
	const sourceStart = getClipSourceStartMs(clip);
	const speed = getSafeClipSpeed(clip);
	const isMove = startMs - clip.startMs === endMs - clip.endMs;
	if (isMove) return { ...clip, startMs, endMs, sourceStartMs: sourceStart, speed };

	// Resizing reveals/hides footage; it cannot manufacture source before 0 or after EOF.
	const totalSource = sourceDurationMs > 0 ? sourceDurationMs : Infinity;
	const minStart = Math.ceil(clip.startMs - sourceStart / speed);
	const start = Math.max(startMs, minStart);
	const sourceStartMs = Math.round(sourceStart + (start - clip.startMs) * speed);
	const maxEnd = Number.isFinite(totalSource)
		? Math.floor(start + (totalSource - sourceStartMs) / speed)
		: endMs;
	const end = Math.min(endMs, maxEnd);
	return { ...clip, startMs: start, endMs: end, sourceStartMs, speed };
}
