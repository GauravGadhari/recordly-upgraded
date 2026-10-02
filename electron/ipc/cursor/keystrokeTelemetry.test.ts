import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
	app: {
		getPath: vi.fn(() => "/tmp"),
	},
}));

vi.mock("./telemetry", () => ({
	getCursorCaptureElapsedMs: vi.fn(() => 150),
	isCursorCapturePaused: vi.fn(() => false),
}));

import { setIsCursorCaptureActive, activeKeystrokeEvents } from "../state";
import {
	resetKeystrokeTracking,
	recordKeyDown,
	recordKeyUp,
} from "./keystrokeTelemetry";

describe("keystrokeTelemetry", () => {
	it("processes key down and key up events correctly", () => {
		setIsCursorCaptureActive(true);
		resetKeystrokeTracking();

		// Simulate Ctrl down (KEY_LEFTCTRL = 29)
		recordKeyDown(29, { source: "linux-evdev" });
		// Simulate Shift down (KEY_LEFTSHIFT = 42)
		recordKeyDown(42, { source: "linux-evdev" });
		// Simulate P down (KEY_P = 25)
		recordKeyDown(25, { source: "linux-evdev" });

		expect(activeKeystrokeEvents.length).toBe(1);
		const ev = activeKeystrokeEvents[0];
		expect(ev.keys).toEqual(["Ctrl", "Shift", "P"]);
		expect(ev.isShortcut).toBe(true);
		expect(ev.displayText).toBe("Ctrl + Shift + P");

		// Key up
		recordKeyUp(25, true);
		recordKeyUp(42, true);
		recordKeyUp(29, true);

		setIsCursorCaptureActive(false);
	});
});
