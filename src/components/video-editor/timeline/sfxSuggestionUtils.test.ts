import { describe, expect, it } from "vitest";
import type { CursorTelemetryPoint, KeystrokeEvent, ZoomRegion } from "../types";
import { synthesizeKeystrokeClickWav } from "./proceduralWhooshGenerator";
import {
	DEFAULT_CURSOR_SFX_SETTINGS,
	detectCursorClicks,
	detectCursorDrags,
	detectCursorWhooshes,
	generateAutoCursorSfxRegions,
	generateKeystrokeSfxRegions,
	getClickSfxAudioPath,
	getDragSfxAudioPath,
	getWhooshSfxAudioPath,
	SFX_PEAK_OFFSETS_MS,
} from "./sfxSuggestionUtils";

describe("sfxSuggestionUtils", () => {
	it("resolves correct audio paths for different styles", () => {
		expect(getClickSfxAudioPath("crisp")).toBe("/sfx/click-crisp.mp3");
		expect(getClickSfxAudioPath("soft")).toBe("/sfx/click-soft.wav");
		expect(getClickSfxAudioPath("digital")).toBe("/sfx/click-digital.mp3");

		expect(getDragSfxAudioPath("mouse")).toBe("/sfx/drag-mouse.mp3");

		expect(getWhooshSfxAudioPath("fast")).toBe("/sfx/whoosh-fast.mp3");
		expect(getWhooshSfxAudioPath("swoosh")).toBe("/sfx/whoosh-swoosh.mp3");
	});

	it("detects explicit clicks and de-duplicates near-simultaneous clicks", () => {
		const samples: CursorTelemetryPoint[] = [
			{ timeMs: 100, cx: 0.5, cy: 0.5, interactionType: "click" },
			{ timeMs: 120, cx: 0.5, cy: 0.5, interactionType: "click" }, // Duplicate within 90ms
			{ timeMs: 500, cx: 0.6, cy: 0.6, interactionType: "right-click" },
			{ timeMs: 1000, cx: 0.2, cy: 0.2, interactionType: "double-click" },
		];

		const clicks = detectCursorClicks(samples);
		// 100 (explicit), 500 (right-click), 1000 (double-click 1), 1130 (double-click 2)
		expect(clicks).toEqual([100, 500, 1000, 1130]);
	});

	it("recovers missed clicks from standalone mouseup and kinematic pauses even when explicit clicks exist", () => {
		const samples: CursorTelemetryPoint[] = [
			// 1. One explicit click
			{ timeMs: 200, cx: 0.2, cy: 0.2, interactionType: "click" },

			// 2. A missed click where only mouseup was captured
			{ timeMs: 800, cx: 0.5, cy: 0.5, interactionType: "mouseup" },

			// 3. A missed click where the cursor moved rapidly to a link, paused briefly (pointer), and moved away
			{ timeMs: 1400, cx: 0.1, cy: 0.1 },
			{ timeMs: 1450, cx: 0.4, cy: 0.4 },
			{ timeMs: 1500, cx: 0.6, cy: 0.6, cursorType: "pointer" },
			{ timeMs: 1550, cx: 0.601, cy: 0.601, cursorType: "pointer" },
			{ timeMs: 1620, cx: 0.602, cy: 0.602, cursorType: "pointer" },
			{ timeMs: 1700, cx: 0.8, cy: 0.8 },
		];

		const clicks = detectCursorClicks(samples);
		expect(clicks).toContain(200);
		expect(clicks).toContain(800);
		// The kinematic pointer click around 1500-1550ms should be recovered
		expect(clicks.some((t) => t >= 1500 && t <= 1650)).toBe(true);
	});

	it("detects drag gestures from click + movement + mouseup", () => {
		const samples: CursorTelemetryPoint[] = [
			{ timeMs: 200, cx: 0.1, cy: 0.1, interactionType: "click" },
			{ timeMs: 300, cx: 0.2, cy: 0.2 },
			{ timeMs: 500, cx: 0.4, cy: 0.4, interactionType: "mouseup" },
		];

		const drags = detectCursorDrags(samples);
		expect(drags).toHaveLength(1);
		expect(drags[0].startMs).toBe(200);
		expect(drags[0].endMs).toBe(500);
	});

	it("detects drag gestures from closed-hand cursor", () => {
		const samples: CursorTelemetryPoint[] = [
			{ timeMs: 1000, cx: 0.1, cy: 0.1, cursorType: "closed-hand" },
			{ timeMs: 1200, cx: 0.2, cy: 0.2, cursorType: "closed-hand" },
			{ timeMs: 1400, cx: 0.3, cy: 0.3, cursorType: "arrow" },
		];

		const drags = detectCursorDrags(samples);
		expect(drags).toHaveLength(1);
		expect(drags[0].startMs).toBe(1000);
		expect(drags[0].endMs).toBe(1400);
	});

	it("detects whooshes from rapid cursor sweeps and zoom transitions", () => {
		const samples: CursorTelemetryPoint[] = [
			{ timeMs: 0, cx: 0.1, cy: 0.1 },
			{ timeMs: 50, cx: 0.5, cy: 0.5 }, // dx=0.4, dy=0.4, dist=0.565, dt=0.05s -> velocity=11.3
			{ timeMs: 100, cx: 0.9, cy: 0.9 },
		];

		const zoomRegions: ZoomRegion[] = [
			{
				id: "zoom-1",
				startMs: 2000,
				endMs: 3500,
				depth: 2,
				focus: { cx: 0.5, cy: 0.5 },
			},
		];

		const whooshes = detectCursorWhooshes(samples, zoomRegions, "both");
		// Rapid movement around 25ms-75ms, zoom in at 2000, zoom out at 3100
		expect(whooshes.length).toBeGreaterThanOrEqual(2);
		expect(whooshes).toContain(2000);
		expect(whooshes).toContain(3100);
	});

	it("generates timeline AudioRegion items properly with sample-based whoosh", () => {
		const samples: CursorTelemetryPoint[] = [
			{ timeMs: 300, cx: 0.5, cy: 0.5, interactionType: "click" },
			{ timeMs: 1000, cx: 0.1, cy: 0.1, interactionType: "click" },
			{ timeMs: 1100, cx: 0.3, cy: 0.3 },
			{ timeMs: 1400, cx: 0.5, cy: 0.5, interactionType: "mouseup" },
		];

		const zoomRegions: ZoomRegion[] = [
			{
				id: "zoom-1",
				startMs: 2500,
				endMs: 4000,
				depth: 2,
				focus: { cx: 0.5, cy: 0.5 },
			},
		];

		const regions = generateAutoCursorSfxRegions({
			telemetry: samples,
			zoomRegions,
			durationMs: 10000,
			options: {
				settings: {
					clickStyle: "crisp",
					dragEnabled: true,
					dragStyle: "mouse",
					clickVolume: 0.8,
					dragVolume: 0.6,
					whooshVolume: 0.7,
					whooshStyle: "fast",
				},
			},
		});

		const clicks = regions.filter((r) => r.label === "Click");
		const drags = regions.filter((r) => r.label === "Drag");
		const whooshes = regions.filter((r) => r.label === "Whoosh");
		const zooms = regions.filter((r) => r.label === "Zoom In" || r.label === "Zoom Out");

		expect(clicks.length).toBeGreaterThanOrEqual(1);
		expect(clicks[0].audioPath).toBe("/sfx/click-crisp.mp3");
		expect(clicks[0].volume).toBe(0.8);
		expect(clicks[0].trackIndex).toBe(0);
		expect(clicks[0].category).toBe("Cursor SFX");

		expect(drags.length).toBeGreaterThanOrEqual(1);
		expect(drags[0].audioPath).toBe("/sfx/drag-mouse.mp3");
		expect(drags[0].volume).toBe(0.6);
		expect(drags[0].trackIndex).toBe(0);

		// Zoom transitions are separated into Track 2 (Zooms layer)
		expect(zooms.length).toBeGreaterThanOrEqual(1);
		expect(zooms[0].audioPath).toBe("/sfx/whoosh-fast.mp3");
		expect(zooms[0].volume).toBe(0.7);
		expect(zooms[0].trackIndex).toBe(2);
	});

	it("properly separates Clicks (track 0), Whooshes (track 1), and Zooms (track 2) into distinct layers", () => {
		const samples: CursorTelemetryPoint[] = [
			{ timeMs: 100, cx: 0.1, cy: 0.1, interactionType: "click" },
			// Fast sweep for movement whoosh
			{ timeMs: 400, cx: 0.1, cy: 0.1 },
			{ timeMs: 450, cx: 0.5, cy: 0.5 },
			{ timeMs: 500, cx: 0.9, cy: 0.9 },
		];

		const zoomRegions: ZoomRegion[] = [
			{
				id: "zoom-test",
				startMs: 2000,
				endMs: 3500,
				depth: 2,
				focus: { cx: 0.5, cy: 0.5 },
			},
		];

		const regions = generateAutoCursorSfxRegions({
			telemetry: samples,
			zoomRegions,
			durationMs: 8000,
			options: {
				settings: { whooshStyle: "procedural" },
			},
		});

		const clickTracks = regions.filter((r) => r.trackIndex === 0);
		const whooshTracks = regions.filter((r) => r.trackIndex === 1);
		const zoomTracks = regions.filter((r) => r.trackIndex === 2);

		expect(clickTracks.length).toBeGreaterThanOrEqual(1);
		expect(clickTracks.every((r) => r.label === "Click" || r.label === "Drag")).toBe(true);

		expect(whooshTracks.length).toBeGreaterThanOrEqual(1);
		expect(whooshTracks.every((r) => r.label === "Whoosh (Dynamic)")).toBe(true);

		expect(zoomTracks.length).toBeGreaterThanOrEqual(1);
		expect(zoomTracks.every((r) => r.label === "Zoom In" || r.label === "Zoom Out")).toBe(true);
	});

	it("generates procedural motion-adaptive whoosh audio directly from cursor movement", () => {
		const sweepSamples: CursorTelemetryPoint[] = [
			{ timeMs: 100, cx: 0.1, cy: 0.2 },
			{ timeMs: 180, cx: 0.4, cy: 0.4 },
			{ timeMs: 250, cx: 0.85, cy: 0.7 },
			{ timeMs: 320, cx: 0.9, cy: 0.72 },
		];

		const regions = generateAutoCursorSfxRegions({
			telemetry: sweepSamples,
			durationMs: 5000,
			options: {
				settings: {
					whooshStyle: "procedural",
					whooshVolume: 0.65,
				},
			},
		});

		const whooshes = regions.filter((r) => r.label === "Whoosh (Dynamic)");
		expect(whooshes.length).toBeGreaterThanOrEqual(1);

		const whoosh = whooshes[0];
		expect(whoosh.audioPath).toMatch(/^data:audio\/wav;base64,/);
		expect(whoosh.volume).toBe(0.65);
		expect(whoosh.endMs).toBeGreaterThan(whoosh.startMs);

		// Decode and verify WAV header
		const base64Data = whoosh.audioPath.replace(/^data:audio\/wav;base64,/, "");
		const binary = atob(base64Data);
		expect(binary.slice(0, 4)).toBe("RIFF");
		expect(binary.slice(8, 12)).toBe("WAVE");
		expect(binary.slice(12, 16)).toBe("fmt ");
	});

	it("generates procedural realistic click and drag audio from physical switch synthesis", () => {
		const samples: CursorTelemetryPoint[] = [
			{ timeMs: 150, cx: 0.2, cy: 0.3, interactionType: "click" },
			{ timeMs: 300, cx: 0.2, cy: 0.3, interactionType: "click" },
			{ timeMs: 400, cx: 0.4, cy: 0.4 },
			{ timeMs: 650, cx: 0.7, cy: 0.7, interactionType: "mouseup" },
		];

		const regions = generateAutoCursorSfxRegions({
			telemetry: samples,
			durationMs: 5000,
			options: {
				settings: {
					clickStyle: "procedural",
					dragEnabled: true,
					dragStyle: "procedural",
				},
			},
		});

		const clicks = regions.filter((r) => r.label === "Click");
		const drags = regions.filter((r) => r.label === "Drag");

		expect(clicks.length).toBeGreaterThanOrEqual(1);
		expect(clicks[0].audioPath).toMatch(/^data:audio\/wav;base64,/);
		expect(clicks[0].trackIndex).toBe(0);

		// Validate generated WAV structure
		const clickBase64 = clicks[0].audioPath.replace(/^data:audio\/wav;base64,/, "");
		const clickBinary = atob(clickBase64);
		expect(clickBinary.slice(0, 4)).toBe("RIFF");
		expect(clickBinary.slice(8, 12)).toBe("WAVE");

		expect(drags.length).toBeGreaterThanOrEqual(1);
		expect(drags[0].audioPath).toMatch(/^data:audio\/wav;base64,/);
		expect(drags[0].trackIndex).toBe(0);
	});

	it("defaults to bundled crisp click audio and aligns audio peak to click timestamp", () => {
		expect(DEFAULT_CURSOR_SFX_SETTINGS.clickStyle).toBe("crisp");

		const samples: CursorTelemetryPoint[] = [
			{ timeMs: 500, cx: 0.5, cy: 0.5, interactionType: "click" },
		];

		const regions = generateAutoCursorSfxRegions({
			telemetry: samples,
			durationMs: 3000,
		});

		const clickRegion = regions.find((r) => r.label === "Click");
		expect(clickRegion).toBeDefined();
		expect(clickRegion?.audioPath).toBe("/sfx/click-crisp.mp3");
		// 500ms click timestamp - 32ms peak offset = 468ms startMs so peak is at exactly 500ms
		expect(clickRegion?.startMs).toBe(500 - SFX_PEAK_OFFSETS_MS["/sfx/click-crisp.mp3"]);
	});

	it("synthesizes valid procedural keystroke audio for mechanical, thock, typewriter, and soft styles", () => {
		const styles = ["mechanical", "thock", "typewriter", "soft"] as const;
		for (const style of styles) {
			const synth = synthesizeKeystrokeClickWav({ style });
			expect(synth.dataUrl).toMatch(/^data:audio\/wav;base64,/);
			expect(synth.durationMs).toBeGreaterThan(0);

			const base64 = synth.dataUrl.replace(/^data:audio\/wav;base64,/, "");
			const binary = atob(base64);
			expect(binary.slice(0, 4)).toBe("RIFF");
			expect(binary.slice(8, 12)).toBe("WAVE");
		}

		// Spacebar synthesis
		const spaceSynth = synthesizeKeystrokeClickWav({ style: "mechanical", isSpacebar: true });
		expect(spaceSynth.durationMs).toBeGreaterThan(45);
	});

	it("generates keystroke SFX audio regions on track 3 and deduplicates rapid chords", () => {
		const keystrokes: KeystrokeEvent[] = [
			{
				id: "key-1",
				timeMs: 200,
				durationMs: 1500,
				keys: ["Ctrl", "C"],
				displayText: "Ctrl + C",
				isShortcut: true,
				enabled: true,
			},
			{
				id: "key-chord-dup",
				timeMs: 220, // within 55ms of key-1 -> should be deduplicated
				durationMs: 1500,
				keys: ["C"],
				displayText: "C",
				isShortcut: false,
				enabled: true,
			},
			{
				id: "key-2",
				timeMs: 800,
				durationMs: 1500,
				keys: ["Space"],
				displayText: "Space",
				isShortcut: false,
				enabled: true,
			},
			{
				id: "key-disabled",
				timeMs: 1200,
				durationMs: 1500,
				keys: ["V"],
				displayText: "V",
				isShortcut: false,
				enabled: false,
			},
		];

		const regions = generateKeystrokeSfxRegions({
			keystrokes,
			durationMs: 3000,
			style: "thock",
		});

		expect(regions).toHaveLength(2); // key-1 and key-2 (dup and disabled ignored)
		expect(regions[0].trackIndex).toBe(3);
		expect(regions[0].category).toBe("Keystroke SFX");
		expect(regions[0].label).toBe("Key (Ctrl + C)");
		expect(regions[0].audioPath).toMatch(/^data:audio\/wav;base64,/);

		expect(regions[1].trackIndex).toBe(3);
		expect(regions[1].label).toBe("Key (Space)");

		// Test shortcutsOnly filtering
		const shortcutRegions = generateKeystrokeSfxRegions({
			keystrokes,
			durationMs: 3000,
			shortcutsOnly: true,
		});
		expect(shortcutRegions).toHaveLength(1);
		expect(shortcutRegions[0].label).toBe("Key (Ctrl + C)");
	});

	it("integrates keystrokes into generateAutoCursorSfxRegions alongside clicks, whooshes, and zooms", () => {
		const samples: CursorTelemetryPoint[] = [
			{ timeMs: 100, cx: 0.5, cy: 0.5, interactionType: "click" },
		];
		const keystrokes: KeystrokeEvent[] = [
			{
				id: "key-1",
				timeMs: 400,
				durationMs: 1500,
				keys: ["Enter"],
				displayText: "Enter",
				isShortcut: true,
				enabled: true,
			},
		];

		const regions = generateAutoCursorSfxRegions({
			telemetry: samples,
			keystrokes,
			durationMs: 2000,
		});

		const clickRegion = regions.find((r) => r.label === "Click");
		const keyRegion = regions.find((r) => r.category === "Keystroke SFX");

		expect(clickRegion).toBeDefined();
		expect(clickRegion?.trackIndex).toBe(0);

		expect(keyRegion).toBeDefined();
		expect(keyRegion?.trackIndex).toBe(3);
		expect(keyRegion?.label).toBe("Key (Enter)");
	});
});
