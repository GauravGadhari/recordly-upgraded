import { describe, expect, it } from "vitest";
import {
	getActiveKeystrokeEvent,
	getActiveKeystrokeEvents,
	getKeystrokeDimensions,
	getKeystrokeTheme,
	buildKeystrokeLayout,
	buildMultiKeystrokeLayout,
} from "./keystrokeRenderer";
import type { KeystrokeEvent, KeystrokeVisualSettings } from "@/components/video-editor/types";

describe("keystrokeRenderer", () => {
	const sampleEvents: KeystrokeEvent[] = [
		{
			id: "evt-1",
			timeMs: 1000,
			durationMs: 1500,
			keys: ["Ctrl", "Alt", "T"],
			displayText: "Ctrl + Alt + T",
			isShortcut: true,
			enabled: true,
		},
		{
			id: "evt-2",
			timeMs: 3000,
			durationMs: 1500,
			keys: ["a"],
			displayText: "a",
			isShortcut: false,
			enabled: true,
		},
	];

	const defaultSettings: KeystrokeVisualSettings = {
		enabled: true,
		showShortcutsOnly: false,
		position: "bottom-center",
		style: "dark",
		size: "medium",
		lingerDurationMs: 1500,
	};

	it("finds active keystroke event within time window", () => {
		const active = getActiveKeystrokeEvent(sampleEvents, defaultSettings, 1500);
		expect(active).not.toBeNull();
		expect(active?.event.id).toBe("evt-1");
		expect(active?.opacity).toBeGreaterThan(0);
	});

	it("returns null when timestamp is outside event window", () => {
		const active = getActiveKeystrokeEvent(sampleEvents, defaultSettings, 500);
		expect(active).toBeNull();
	});

	it("filters shortcuts only when showShortcutsOnly is true", () => {
		const settings: KeystrokeVisualSettings = {
			...defaultSettings,
			showShortcutsOnly: true,
		};
		// At 3500ms, evt-2 ('a') is active, but isShortcut is false
		const active = getActiveKeystrokeEvent(sampleEvents, settings, 3500);
		expect(active).toBeNull();
	});

	it("returns proper dimensions and themes", () => {
		const smallDims = getKeystrokeDimensions("small", 1.0);
		const largeDims = getKeystrokeDimensions("large", 1.0);
		expect(largeDims.keycapFontSize).toBeGreaterThan(smallDims.keycapFontSize);

		const darkTheme = getKeystrokeTheme("dark");
		const lightTheme = getKeystrokeTheme("light");
		expect(darkTheme.textColor).toBe("#ffffff");
		expect(lightTheme.textColor).toBe("#171717");
	});

	it("calculates layout properly with mock canvas context", () => {
		const mockContext = {
			font: "",
			measureText: (text: string) => ({ width: text.length * 10 }),
		} as unknown as CanvasRenderingContext2D;

		const layout = buildKeystrokeLayout(
			mockContext,
			sampleEvents[0],
			defaultSettings,
			1920,
			1080,
		);

		expect(layout.boxWidth).toBeGreaterThan(0);
		expect(layout.boxHeight).toBeGreaterThan(0);
		expect(layout.centerX).toBe(960);
		expect(layout.key).toContain("evt-1");
	});

	it("returns multiple active events for multi-layer stacking", () => {
		const overlappingEvents: KeystrokeEvent[] = [
			{
				id: "evt-1",
				timeMs: 1000,
				durationMs: 2000,
				keys: ["Ctrl", "C"],
				displayText: "Ctrl + C",
				isShortcut: true,
				enabled: true,
			},
			{
				id: "evt-2",
				timeMs: 1500,
				durationMs: 2000,
				keys: ["Ctrl", "V"],
				displayText: "Ctrl + V",
				isShortcut: true,
				enabled: true,
			},
		];

		// At 2000ms, both evt-1 (1000..3000) and evt-2 (1500..3500) are active
		const activeList = getActiveKeystrokeEvents(overlappingEvents, { ...defaultSettings, maxLayers: 2 }, 2000);
		expect(activeList.length).toBe(2);
		expect(activeList[0].event.id).toBe("evt-1");
		expect(activeList[1].event.id).toBe("evt-2");
		// First (older) is de-emphasized
		expect(activeList[0].opacity).toBeLessThan(activeList[1].opacity);

		// With maxLayers = 1, only the latest active event is returned
		const singleActive = getActiveKeystrokeEvents(overlappingEvents, { ...defaultSettings, maxLayers: 1 }, 2000);
		expect(singleActive.length).toBe(1);
		expect(singleActive[0].event.id).toBe("evt-2");
	});

	it("supports center, center-left, and center-right alignments", () => {
		const mockContext = {
			font: "",
			measureText: (text: string) => ({ width: text.length * 10 }),
		} as unknown as CanvasRenderingContext2D;

		const activeEntries = [
			{ event: sampleEvents[0], opacity: 1, scale: 1, layerIndex: 0 },
		];

		const centerLayout = buildMultiKeystrokeLayout(
			mockContext,
			activeEntries,
			{ ...defaultSettings, position: "center" },
			1920,
			1080,
		);
		expect(centerLayout.centerX).toBe(960);
		expect(centerLayout.centerY).toBe(540);

		const centerLeftLayout = buildMultiKeystrokeLayout(
			mockContext,
			activeEntries,
			{ ...defaultSettings, position: "center-left" },
			1920,
			1080,
		);
		expect(centerLeftLayout.centerY).toBe(540);
		expect(centerLeftLayout.centerX).toBeLessThan(960);

		const centerRightLayout = buildMultiKeystrokeLayout(
			mockContext,
			activeEntries,
			{ ...defaultSettings, position: "center-right" },
			1920,
			1080,
		);
		expect(centerRightLayout.centerY).toBe(540);
		expect(centerRightLayout.centerX).toBeGreaterThan(960);
	});
});
