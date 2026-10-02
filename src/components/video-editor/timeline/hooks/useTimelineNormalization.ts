import { useEffect } from "react";
import { normalizeRegionSpan } from "../core/spans";
import type {
	AudioRegion,
	MemeRegion,
	SpeedRegion,
	TransitionRegion,
	TrimRegion,
	ZoomOutRegion,
	ZoomRegion,
} from "../../types";

interface UseTimelineNormalizationParams {
	totalMs: number;
	safeMinDurationMs: number;
	zoomRegions: ZoomRegion[];
	zoomOutRegions?: ZoomOutRegion[];
	trimRegions: TrimRegion[];
	speedRegions: SpeedRegion[];
	audioRegions: AudioRegion[];
	transitionRegions?: TransitionRegion[];
	memeRegions?: MemeRegion[];
	onZoomSpanChange: (id: string, span: { start: number; end: number }) => void;
	onZoomOutSpanChange?: (id: string, span: { start: number; end: number }) => void;
	onTrimSpanChange?: (id: string, span: { start: number; end: number }) => void;
	onSpeedSpanChange?: (id: string, span: { start: number; end: number }) => void;
	onAudioSpanChange?: (id: string, span: { start: number; end: number }) => void;
	onTransitionSpanChange?: (id: string, span: { start: number; end: number }) => void;
	onMemeSpanChange?: (id: string, span: { start: number; end: number }) => void;
}

export function useTimelineNormalization({
	totalMs,
	safeMinDurationMs,
	zoomRegions,
	zoomOutRegions,
	trimRegions,
	speedRegions,
	audioRegions,
	transitionRegions,
	memeRegions,
	onZoomSpanChange,
	onZoomOutSpanChange,
	onTrimSpanChange,
	onSpeedSpanChange,
	onAudioSpanChange,
	onTransitionSpanChange,
	onMemeSpanChange,
}: UseTimelineNormalizationParams) {
	useEffect(() => {
		if (totalMs === 0 || safeMinDurationMs <= 0) {
			return;
		}

		zoomRegions.forEach((region) => {
			const normalized = normalizeRegionSpan({
				startMs: region.startMs,
				endMs: region.endMs,
				totalMs,
				minDurationMs: safeMinDurationMs,
			});

			if (normalized.start !== region.startMs || normalized.end !== region.endMs) {
				onZoomSpanChange(region.id, normalized);
			}
		});

		zoomOutRegions?.forEach((region) => {
			const normalized = normalizeRegionSpan({
				startMs: region.startMs,
				endMs: region.endMs,
				totalMs,
				minDurationMs: safeMinDurationMs,
			});

			if (normalized.start !== region.startMs || normalized.end !== region.endMs) {
				onZoomOutSpanChange?.(region.id, normalized);
			}
		});

		trimRegions.forEach((region) => {
			const normalized = normalizeRegionSpan({
				startMs: region.startMs,
				endMs: region.endMs,
				totalMs,
				minDurationMs: safeMinDurationMs,
			});

			if (normalized.start !== region.startMs || normalized.end !== region.endMs) {
				onTrimSpanChange?.(region.id, normalized);
			}
		});

		speedRegions.forEach((region) => {
			const normalized = normalizeRegionSpan({
				startMs: region.startMs,
				endMs: region.endMs,
				totalMs,
				minDurationMs: safeMinDurationMs,
			});

			if (normalized.start !== region.startMs || normalized.end !== region.endMs) {
				onSpeedSpanChange?.(region.id, normalized);
			}
		});

		audioRegions.forEach((region) => {
			const normalized = normalizeRegionSpan({
				startMs: region.startMs,
				endMs: region.endMs,
				totalMs,
				minDurationMs: safeMinDurationMs,
			});

			if (normalized.start !== region.startMs || normalized.end !== region.endMs) {
				onAudioSpanChange?.(region.id, normalized);
			}
		});

		transitionRegions?.forEach((region) => {
			const normalized = normalizeRegionSpan({
				startMs: region.startMs,
				endMs: region.endMs,
				totalMs,
				minDurationMs: safeMinDurationMs,
			});

			if (normalized.start !== region.startMs || normalized.end !== region.endMs) {
				onTransitionSpanChange?.(region.id, normalized);
			}
		});

		memeRegions?.forEach((region) => {
			const normalized = normalizeRegionSpan({
				startMs: region.startMs,
				endMs: region.endMs,
				totalMs,
				minDurationMs: safeMinDurationMs,
			});

			if (normalized.start !== region.startMs || normalized.end !== region.endMs) {
				onMemeSpanChange?.(region.id, normalized);
			}
		});
	}, [
		totalMs,
		safeMinDurationMs,
		zoomRegions,
		zoomOutRegions,
		trimRegions,
		speedRegions,
		audioRegions,
		transitionRegions,
		memeRegions,
		onZoomSpanChange,
		onZoomOutSpanChange,
		onTrimSpanChange,
		onSpeedSpanChange,
		onAudioSpanChange,
		onTransitionSpanChange,
		onMemeSpanChange,
	]);
}
