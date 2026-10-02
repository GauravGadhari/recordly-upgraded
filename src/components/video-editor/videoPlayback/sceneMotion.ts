import type {
	CursorTelemetryPoint,
	VerticalTrackingMode,
	ZoomFocus,
	ZoomOutRegion,
	ZoomRegion,
} from "../types";
import { ZOOM_DEPTH_SCALES } from "../types";
import { DEFAULT_FOCUS } from "./constants";
import {
	type CursorFollowCameraState,
	clampFocusToBounds,
	computeCursorFollowFocus,
	SNAP_TO_EDGES_RATIO_AUTO,
} from "./cursorFollowCamera";
import { interpolateCursorPosition } from "./cursorRenderer";
import { findDominantRegion, findDominantZoomOutStrength } from "./zoomRegionUtils";
import { type AspectRatio, getAspectRatioValue } from "@/utils/aspectRatioUtils";

export type SceneZoomTarget = {
	scale: number;
	focus: ZoomFocus;
	progress: number;
};

export type PreviewMotionMode = "spring" | "snap" | "preserve";

/**
 * Decide how the preview camera should react to the current transport state.
 * A plain pause must preserve the last composed frame; recomputing the projected
 * target there causes the image to jump as soon as the user presses Space.
 */
export function resolvePreviewMotionMode({
	isPlaying,
	isSeeking,
	shouldSnapPausedFrame,
	zoomClassicMode,
}: {
	isPlaying: boolean;
	isSeeking: boolean;
	shouldSnapPausedFrame: boolean;
	zoomClassicMode: boolean;
}): PreviewMotionMode {
	if (isSeeking || shouldSnapPausedFrame || zoomClassicMode) {
		return "snap";
	}

	return isPlaying ? "spring" : "preserve";
}

/** Match export's one-composition-per-media-frame behavior. */
export function shouldComposePreviewFrame({
	motionMode,
	contentTimeChanged,
	shouldSnapPausedFrame,
}: {
	motionMode: PreviewMotionMode;
	contentTimeChanged: boolean;
	shouldSnapPausedFrame: boolean;
}): boolean {
	if (motionMode === "preserve") {
		return false;
	}

	return contentTimeChanged || shouldSnapPausedFrame;
}

function applyZoomOutToTarget(
	baseTarget: SceneZoomTarget,
	zoomOutRegions: ZoomOutRegion[] | undefined,
	timeMs: number,
	options: { zoomInDurationMs?: number; zoomOutDurationMs?: number },
): SceneZoomTarget {
	if (!zoomOutRegions || zoomOutRegions.length === 0) {
		return baseTarget;
	}

	const strength = findDominantZoomOutStrength(zoomOutRegions, timeMs, options);
	if (strength <= 0) {
		return baseTarget;
	}

	const k = Math.min(1, Math.max(0, strength));
	const scale = baseTarget.scale + (1.0 - baseTarget.scale) * k;
	const focus: ZoomFocus = {
		cx: baseTarget.focus.cx + (DEFAULT_FOCUS.cx - baseTarget.focus.cx) * k,
		cy: baseTarget.focus.cy + (DEFAULT_FOCUS.cy - baseTarget.focus.cy) * k,
	};
	const progress = baseTarget.progress * (1 - k);

	return { scale, focus, progress };
}

/** Resolve the camera target for a media timestamp, independent of renderer. */
export function resolveSceneZoomTarget({
	zoomRegions,
	zoomOutRegions,
	timeMs,
	cursorTimeMs = timeMs,
	connectZooms,
	zoomInDurationMs,
	zoomOutDurationMs,
	zoomClassicMode,
	cursorTelemetry,
	cursorFollowCamera,
	aspectRatio,
	verticalTrackingMode = "auto-follow",
	stageSize,
	baseMask,
	sourceAspectRatio,
}: {
	zoomRegions: ZoomRegion[];
	zoomOutRegions?: ZoomOutRegion[];
	timeMs: number;
	cursorTimeMs?: number;
	connectZooms?: boolean;
	zoomInDurationMs?: number;
	zoomOutDurationMs?: number;
	zoomClassicMode?: boolean;
	cursorTelemetry?: CursorTelemetryPoint[];
	cursorFollowCamera: CursorFollowCameraState;
	aspectRatio?: AspectRatio;
	verticalTrackingMode?: VerticalTrackingMode;
	stageSize?: { width: number; height: number };
	baseMask?: { x: number; y: number; width: number; height: number };
	sourceAspectRatio?: number;
}): SceneZoomTarget {
	const nativeAR = sourceAspectRatio && sourceAspectRatio > 0 ? sourceAspectRatio : 16 / 9;
	const targetAR = aspectRatio ? getAspectRatioValue(aspectRatio, nativeAR) : nativeAR;
	const isVertical = targetAR < 0.999 || (stageSize ? stageSize.height > stageSize.width : false);
	const isVerticalTracking = isVertical && verticalTrackingMode !== "fit";

	let verticalFillScale = 1;
	if (isVerticalTracking) {
		if (stageSize && baseMask && baseMask.height > 0 && stageSize.height > 0) {
			verticalFillScale = Math.max(1, stageSize.height / baseMask.height);
		} else {
			verticalFillScale = Math.max(1, nativeAR / targetAR);
		}
	}

	const { region, strength, blendedScale } = findDominantRegion(zoomRegions, timeMs, {
		connectZooms,
		zoomInDurationMs,
		zoomOutDurationMs,
	});

	const baseTarget: SceneZoomTarget = (() => {

	if (!isVerticalTracking) {
		if (!region || strength <= 0) {
			return { scale: 1, focus: DEFAULT_FOCUS, progress: 0 };
		}

		const scale = blendedScale ?? ZOOM_DEPTH_SCALES[region.depth];
		let focus = region.focus;
		if (
			!zoomClassicMode &&
			region.mode !== "manual" &&
			cursorTelemetry &&
			cursorTelemetry.length > 0
		) {
			focus = computeCursorFollowFocus(
				cursorFollowCamera,
				cursorTelemetry,
				cursorTimeMs,
				scale,
				strength,
				region.focus,
				{ snapToEdgesRatio: SNAP_TO_EDGES_RATIO_AUTO },
			);
		}

		return { scale, focus, progress: strength };
	}

	// Vertical tracking mode active:
	if (!region || strength <= 0) {
		const scale = verticalFillScale;
		const scaleX = verticalFillScale;
		const scaleY = 1;
		let focus = DEFAULT_FOCUS;

		if (cursorTelemetry && cursorTelemetry.length > 0) {
			const hasValidTelemetry = cursorTelemetry.some((s) => s.cx > 0.001 || s.cy > 0.001);
			const cursorPos = hasValidTelemetry ? interpolateCursorPosition(cursorTelemetry, cursorTimeMs) : null;
			const initialFocus = cursorPos ? clampFocusToBounds(cursorPos, scaleX, scaleY) : DEFAULT_FOCUS;
			focus = computeCursorFollowFocus(
				cursorFollowCamera,
				cursorTelemetry,
				cursorTimeMs,
				scale,
				1,
				initialFocus,
				{ snapToEdgesRatio: SNAP_TO_EDGES_RATIO_AUTO },
				{ scaleX, scaleY },
			);
		} else {
			focus = clampFocusToBounds(DEFAULT_FOCUS, scaleX, scaleY);
		}

		return { scale, focus, progress: 1 };
	}

	const regionScale = blendedScale ?? ZOOM_DEPTH_SCALES[region.depth];
	const zoomDepthScale = 1 + (regionScale - 1) * strength;
	const compositeScale = verticalFillScale * zoomDepthScale;
	const scaleX = compositeScale;
	const scaleY = zoomDepthScale;

	let focus: ZoomFocus;
	if (
		!zoomClassicMode &&
		region.mode !== "manual" &&
		cursorTelemetry &&
		cursorTelemetry.length > 0
	) {
		focus = computeCursorFollowFocus(
			cursorFollowCamera,
			cursorTelemetry,
			cursorTimeMs,
			compositeScale,
			1,
			region.focus,
			{ snapToEdgesRatio: SNAP_TO_EDGES_RATIO_AUTO },
			{ scaleX, scaleY },
		);
	} else {
		const targetManualFocus = clampFocusToBounds(region.focus, scaleX, scaleY);
		if (strength >= 0.999) {
			focus = targetManualFocus;
		} else {
			const currentX = cursorFollowCamera.initialized
				? cursorFollowCamera.focusX
				: DEFAULT_FOCUS.cx;
			const currentY = cursorFollowCamera.initialized
				? cursorFollowCamera.focusY
				: DEFAULT_FOCUS.cy;
			focus = clampFocusToBounds(
				{
					cx: currentX + (targetManualFocus.cx - currentX) * strength,
					cy: currentY + (targetManualFocus.cy - currentY) * strength,
				},
				scaleX,
				scaleY,
			);
		}
		cursorFollowCamera.focusX = focus.cx;
		cursorFollowCamera.focusY = focus.cy;
	}

	return { scale: compositeScale, focus, progress: 1 };
	})();

	return applyZoomOutToTarget(baseTarget, zoomOutRegions, timeMs, {
		zoomInDurationMs,
		zoomOutDurationMs,
	});
}
