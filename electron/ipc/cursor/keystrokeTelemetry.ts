import fs from "node:fs/promises";
import { activeKeystrokeEvents, isCursorCaptureActive, setActiveKeystrokeEvents } from "../state";
import type { KeystrokeEvent, KeystrokeTelemetryData } from "../types";
import { getKeystrokeTelemetryPathForVideo } from "../utils";
import { getCursorCaptureElapsedMs, isCursorCapturePaused } from "./telemetry";

// Map uiohook keycodes to friendly names
const UIOHOOK_KEY_NAMES: Record<number, string> = {
	1: "Esc",
	2: "1",
	3: "2",
	4: "3",
	5: "4",
	6: "5",
	7: "6",
	8: "7",
	9: "8",
	10: "9",
	11: "0",
	12: "-",
	13: "=",
	14: "Backspace",
	15: "Tab",
	16: "Q",
	17: "W",
	18: "E",
	19: "R",
	20: "T",
	21: "Y",
	22: "U",
	23: "I",
	24: "O",
	25: "P",
	26: "[",
	27: "]",
	28: "Enter",
	29: "Ctrl",
	30: "A",
	31: "S",
	32: "D",
	33: "F",
	34: "G",
	35: "H",
	36: "J",
	37: "K",
	38: "L",
	39: ";",
	40: "'",
	41: "`",
	42: "Shift",
	43: "\\",
	44: "Z",
	45: "X",
	46: "C",
	47: "V",
	48: "B",
	49: "N",
	50: "M",
	51: ",",
	52: ".",
	53: "/",
	54: "Shift",
	56: "Alt",
	57: "Space",
	58: "CapsLock",
	59: "F1",
	60: "F2",
	61: "F3",
	62: "F4",
	63: "F5",
	64: "F6",
	65: "F7",
	66: "F8",
	67: "F9",
	68: "F10",
	69: "NumLock",
	70: "ScrollLock",
	71: "7",
	72: "8",
	73: "9",
	74: "-",
	75: "4",
	76: "5",
	77: "6",
	78: "+",
	79: "1",
	80: "2",
	81: "3",
	82: "0",
	83: ".",
	87: "F11",
	88: "F12",
	55: "*",
	3612: "Enter",
	3613: "Ctrl",
	3637: "/",
	3639: "PrintScreen",
	3640: "Alt",
	3653: "Pause",
	3655: "Home",
	3657: "PageUp",
	3663: "End",
	3665: "PageDown",
	3666: "Insert",
	3667: "Delete",
	3675: "Meta",
	3676: "Meta",
	3677: "Menu",
	57416: "ArrowUp",
	57419: "ArrowLeft",
	57421: "ArrowRight",
	57424: "ArrowDown",
};

// Linux EV_KEY to friendly names
const LINUX_EVDEV_NAMES: Record<number, string> = {
	1: "Esc",
	2: "1",
	3: "2",
	4: "3",
	5: "4",
	6: "5",
	7: "6",
	8: "7",
	9: "8",
	10: "9",
	11: "0",
	12: "-",
	13: "=",
	14: "Backspace",
	15: "Tab",
	16: "Q",
	17: "W",
	18: "E",
	19: "R",
	20: "T",
	21: "Y",
	22: "U",
	23: "I",
	24: "O",
	25: "P",
	26: "[",
	27: "]",
	28: "Enter",
	29: "Ctrl",
	30: "A",
	31: "S",
	32: "D",
	33: "F",
	34: "G",
	35: "H",
	36: "J",
	37: "K",
	38: "L",
	39: ";",
	40: "'",
	41: "`",
	42: "Shift",
	43: "\\",
	44: "Z",
	45: "X",
	46: "C",
	47: "V",
	48: "B",
	49: "N",
	50: "M",
	51: ",",
	52: ".",
	53: "/",
	54: "Shift",
	56: "Alt",
	57: "Space",
	58: "CapsLock",
	59: "F1",
	60: "F2",
	61: "F3",
	62: "F4",
	63: "F5",
	64: "F6",
	65: "F7",
	66: "F8",
	67: "F9",
	68: "F10",
	87: "F11",
	88: "F12",
	97: "Ctrl",
	100: "Alt",
	102: "Home",
	103: "ArrowUp",
	104: "PageUp",
	105: "ArrowLeft",
	106: "ArrowRight",
	107: "End",
	108: "ArrowDown",
	109: "PageDown",
	110: "Insert",
	111: "Delete",
	125: "Meta",
	126: "Meta",
};

const MODIFIER_NAMES = new Set(["Ctrl", "Alt", "Shift", "Meta"]);
const SPECIAL_KEYS = new Set([
	"Enter",
	"Esc",
	"Tab",
	"Backspace",
	"Delete",
	"Insert",
	"Home",
	"End",
	"PageUp",
	"PageDown",
	"ArrowUp",
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
	"F1",
	"F2",
	"F3",
	"F4",
	"F5",
	"F6",
	"F7",
	"F8",
	"F9",
	"F10",
	"F11",
	"F12",
	"PrintScreen",
	"Menu",
	"Pause",
	"NumLock",
	"ScrollLock",
]);

// Track active modifiers across keydowns
const activeModifiers = new Set<string>();
let lastKeystrokeTimeMs = 0;
let lastKeystrokeText = "";

export function resetKeystrokeTracking() {
	activeModifiers.clear();
	setActiveKeystrokeEvents([]);
	lastKeystrokeTimeMs = 0;
	lastKeystrokeText = "";
}

export function recordKeyDown(
	keycode: number,
	options?: {
		source?: "uiohook" | "linux-evdev";
		altKey?: boolean;
		ctrlKey?: boolean;
		metaKey?: boolean;
		shiftKey?: boolean;
	},
) {
	if (!isCursorCaptureActive || isCursorCapturePaused()) {
		return;
	}

	const isLinux = options?.source === "linux-evdev";
	const keyName = isLinux ? LINUX_EVDEV_NAMES[keycode] : UIOHOOK_KEY_NAMES[keycode];
	if (!keyName) return;

	// Track explicit boolean modifier flags if provided
	if (options?.ctrlKey) activeModifiers.add("Ctrl");
	if (options?.altKey) activeModifiers.add("Alt");
	if (options?.shiftKey) activeModifiers.add("Shift");
	if (options?.metaKey) activeModifiers.add("Meta");

	// Update modifier set if modifier key itself was pressed
	if (MODIFIER_NAMES.has(keyName)) {
		activeModifiers.add(keyName);
		return;
	}

	// Format modifiers in standard order
	const isMac = process.platform === "darwin";
	const orderedMods: string[] = [];
	if (isMac) {
		if (activeModifiers.has("Ctrl")) orderedMods.push("⌃");
		if (activeModifiers.has("Alt")) orderedMods.push("⌥");
		if (activeModifiers.has("Shift")) orderedMods.push("⇧");
		if (activeModifiers.has("Meta")) orderedMods.push("⌘");
	} else {
		if (activeModifiers.has("Ctrl")) orderedMods.push("Ctrl");
		if (activeModifiers.has("Alt")) orderedMods.push("Alt");
		if (activeModifiers.has("Shift")) orderedMods.push("Shift");
		if (activeModifiers.has("Meta")) orderedMods.push("Win");
	}

	const isShortcut = orderedMods.length > 0 || SPECIAL_KEYS.has(keyName);
	const keys = [...orderedMods, keyName];
	const displayText = isMac
		? orderedMods.length > 0
			? `${orderedMods.join("")}${keyName}`
			: keyName
		: keys.join(" + ");

	const timeMs = getCursorCaptureElapsedMs();

	// Deduplicate rapid repeat events (under 120ms for the same text)
	if (displayText === lastKeystrokeText && timeMs - lastKeystrokeTimeMs < 120) {
		return;
	}

	lastKeystrokeTimeMs = timeMs;
	lastKeystrokeText = displayText;

	const event: KeystrokeEvent = {
		id: `key_${timeMs}_${Math.random().toString(36).slice(2, 7)}`,
		timeMs,
		durationMs: 1500,
		keys,
		displayText,
		isShortcut,
		enabled: true,
	};

	activeKeystrokeEvents.push(event);
}

export function recordKeyUp(keycode: number, isLinuxEvdev = false) {
	const keyName = isLinuxEvdev ? LINUX_EVDEV_NAMES[keycode] : UIOHOOK_KEY_NAMES[keycode];
	if (!keyName) return;

	if (MODIFIER_NAMES.has(keyName)) {
		activeModifiers.delete(keyName);
	}
}

export async function writeKeystrokeTelemetry(
	videoPath: string,
	events: KeystrokeEvent[],
): Promise<KeystrokeEvent[]> {
	const telemetryPath = getKeystrokeTelemetryPathForVideo(videoPath);
	if (!events || events.length === 0) {
		await fs.rm(telemetryPath, { force: true });
		return [];
	}

	const data: KeystrokeTelemetryData = {
		version: 1,
		events,
	};

	await fs.writeFile(telemetryPath, JSON.stringify(data, null, 2), "utf-8");
	return events;
}

export async function readKeystrokeTelemetry(videoPath: string): Promise<KeystrokeEvent[]> {
	const telemetryPath = getKeystrokeTelemetryPathForVideo(videoPath);
	try {
		const content = await fs.readFile(telemetryPath, "utf-8");
		const data = JSON.parse(content) as KeystrokeTelemetryData;
		return Array.isArray(data?.events) ? data.events : [];
	} catch {
		return [];
	}
}

export async function persistPendingKeystrokeTelemetry(videoPath: string): Promise<void> {
	if (activeKeystrokeEvents.length > 0) {
		await writeKeystrokeTelemetry(videoPath, [...activeKeystrokeEvents]);
	}
}
