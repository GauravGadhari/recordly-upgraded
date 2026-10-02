import { describe, expect, it } from "vitest";
import type { ZoomRegion } from "../types";
import { createCursorFollowCameraState } from "./cursorFollowCamera";
import {
	resolvePreviewMotionMode,
	resolveSceneZoomTarget,
	shouldComposePreviewFrame,
} from "./sceneMotion";

const region: ZoomRegion = {
	id: "zoom",
	startMs: 0,
	endMs: 4000,
	depth: 2,
	focus: { cx: 0.7, cy: 0.3 },
	mode: "manual",
};

describe("resolveSceneZoomTarget", () => {
	it("returns the neutral camera when no zoom is active", () => {
		expect(
			resolveSceneZoomTarget({
				zoomRegions: [],
				timeMs: 1000,
				cursorFollowCamera: createCursorFollowCameraState(),
			}),
		).toEqual({ scale: 1, focus: { cx: 0.5, cy: 0.5 }, progress: 0 });
	});

	it("resolves the same manual target for every rendering backend", () => {
		const target = resolveSceneZoomTarget({
			zoomRegions: [region],
			timeMs: 2000,
			cursorFollowCamera: createCursorFollowCameraState(),
		});

		expect(target.scale).toBeGreaterThan(1);
		// The scene evaluator clamps focus so the zoom never exposes the stage edge.
		expect(target.focus.cx).toBeCloseTo(2 / 3);
		expect(target.focus.cy).toBeCloseTo(1 / 3);
		expect(target.progress).toBe(1);
	});

	it("returns vertical fill scale and auto tracks cursor in 9:16 vertical mode", () => {
		const state = createCursorFollowCameraState();
		const telemetry = [
			{ timeMs: 0, cx: 0.2, cy: 0.4 },
			{ timeMs: 2000, cx: 0.8, cy: 0.6 },
		];
		const target = resolveSceneZoomTarget({
			zoomRegions: [],
			timeMs: 0,
			cursorFollowCamera: state,
			aspectRatio: "9:16",
			verticalTrackingMode: "auto-follow",
			cursorTelemetry: telemetry,
			sourceAspectRatio: 16 / 9,
		});

		// 16/9 / (9/16) = 256/81 ≈ 3.16049
		expect(target.scale).toBeCloseTo(256 / 81, 3);
		expect(target.progress).toBe(1);
		// Min X bound is 1 / (2 * 3.16049) ≈ 0.1582. At cx=0.2, 0.2 is within bounds.
		expect(target.focus.cx).toBeCloseTo(0.2, 2);
		// Y is clamped to 0.5 because full video height fills the 9:16 stage
		expect(target.focus.cy).toBeCloseTo(0.5, 3);
	});

	it("clamps cursor X to safe bounds so video edges never show blank background", () => {
		const state = createCursorFollowCameraState();
		const telemetry = [
			{ timeMs: 0, cx: 0.05, cy: 0.1 }, // Far left edge
		];
		const target = resolveSceneZoomTarget({
			zoomRegions: [],
			timeMs: 0,
			cursorFollowCamera: state,
			aspectRatio: "9:16",
			verticalTrackingMode: "auto-follow",
			cursorTelemetry: telemetry,
			sourceAspectRatio: 16 / 9,
		});

		const minExpectedX = 1 / (2 * (256 / 81)); // ≈ 0.1582
		expect(target.focus.cx).toBeCloseTo(minExpectedX, 3);
		expect(target.focus.cy).toBe(0.5);
	});

	it("returns neutral letterbox camera when verticalTrackingMode is fit", () => {
		const state = createCursorFollowCameraState();
		const target = resolveSceneZoomTarget({
			zoomRegions: [],
			timeMs: 1000,
			cursorFollowCamera: state,
			aspectRatio: "9:16",
			verticalTrackingMode: "fit",
		});

		expect(target).toEqual({ scale: 1, focus: { cx: 0.5, cy: 0.5 }, progress: 0 });
	});

	it("multiplies zoom depth when timeline zoom region is active in vertical mode", () => {
		const state = createCursorFollowCameraState();
		const target = resolveSceneZoomTarget({
			zoomRegions: [region], // depth 2 (scale 1.5)
			timeMs: 2000,
			cursorFollowCamera: state,
			aspectRatio: "9:16",
			verticalTrackingMode: "auto-follow",
			sourceAspectRatio: 16 / 9,
		});

		// Base vertical scale (256/81 ≈ 3.16) * region depth scale (1.5) = 4.7407
		expect(target.scale).toBeCloseTo((256 / 81) * 1.5, 3);
		expect(target.progress).toBe(1);
	});

	it("smoothly zooms out to scale 1.0 (full window) during zoomOutRegions in vertical mode", () => {
		const state = createCursorFollowCameraState();
		const zoomOutRegion = {
			id: "zoom-out-1",
			startMs: 1000,
			endMs: 4000,
		};

		// At mid-region (2500ms), zoom-out should be fully active (strength = 1)
		const targetMid = resolveSceneZoomTarget({
			zoomRegions: [],
			zoomOutRegions: [zoomOutRegion],
			timeMs: 2500,
			cursorFollowCamera: state,
			aspectRatio: "9:16",
			verticalTrackingMode: "auto-follow",
			sourceAspectRatio: 16 / 9,
		});

		expect(targetMid.scale).toBeCloseTo(1.0, 3);
		expect(targetMid.focus.cx).toBeCloseTo(0.5, 3);
		expect(targetMid.focus.cy).toBeCloseTo(0.5, 3);
		expect(targetMid.progress).toBe(0);

		// Before region starts (500ms), should still be auto-tracking at vertical fill scale (~3.16)
		const targetBefore = resolveSceneZoomTarget({
			zoomRegions: [],
			zoomOutRegions: [zoomOutRegion],
			timeMs: 500,
			cursorFollowCamera: state,
			aspectRatio: "9:16",
			verticalTrackingMode: "auto-follow",
			sourceAspectRatio: 16 / 9,
		});

		expect(targetBefore.scale).toBeCloseTo(256 / 81, 3);
	});
});

describe("resolvePreviewMotionMode", () => {
	it("preserves the composed frame on a plain pause", () => {
		expect(
			resolvePreviewMotionMode({
				isPlaying: false,
				isSeeking: false,
				shouldSnapPausedFrame: false,
				zoomClassicMode: false,
			}),
		).toBe("preserve");
	});

	it("snaps paused frames only for an intentional timeline seek", () => {
		expect(
			resolvePreviewMotionMode({
				isPlaying: false,
				isSeeking: false,
				shouldSnapPausedFrame: true,
				zoomClassicMode: false,
			}),
		).toBe("snap");
	});
});

describe("shouldComposePreviewFrame", () => {
	it("holds every visual sample, including blur and cursor state, while paused", () => {
		expect(
			shouldComposePreviewFrame({
				motionMode: "preserve",
				contentTimeChanged: true,
				shouldSnapPausedFrame: false,
			}),
		).toBe(false);
	});

	it("does not interpolate again at an unchanged playback timestamp", () => {
		expect(
			shouldComposePreviewFrame({
				motionMode: "spring",
				contentTimeChanged: false,
				shouldSnapPausedFrame: false,
			}),
		).toBe(false);
	});

	it("composes one exact frame when a seek requests it", () => {
		expect(
			shouldComposePreviewFrame({
				motionMode: "snap",
				contentTimeChanged: false,
				shouldSnapPausedFrame: true,
			}),
		).toBe(true);
	});
});
