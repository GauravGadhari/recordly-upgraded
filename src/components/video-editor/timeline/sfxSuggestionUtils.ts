import type { AudioRegion, CursorTelemetryPoint, KeystrokeEvent, ZoomRegion } from "../types";
import { detectInteractionCandidates } from "./zoomSuggestionUtils";
import {
	type ProceduralKeystrokeStyle,
	type ScrollSfxStyle,
	synthesizeCursorClickWav,
	synthesizeCursorDragWav,
	synthesizeCursorWhooshWav,
	synthesizeKeystrokeClickWav,
	synthesizeScrollTickWav,
	synthesizeZoomWhooshWav,
} from "./proceduralWhooshGenerator";

export type { ScrollSfxStyle };

export type ClickSfxStyle = "procedural" | "crisp" | "soft" | "digital" | "mechanical";
export type DragSfxStyle = "procedural" | "mouse" | "slide";
export type WhooshSfxStyle = "procedural" | "fast" | "swoosh";
export type WhooshTriggerMode = "both" | "zooms" | "movement";
export type KeystrokeSfxStyle = ProceduralKeystrokeStyle;

export interface CursorSfxSettings {
	enabled: boolean;
	clickEnabled: boolean;
	clickVolume: number;
	clickStyle: ClickSfxStyle;
	dragEnabled: boolean;
	dragVolume: number;
	dragStyle: DragSfxStyle;
	whooshEnabled: boolean;
	whooshVolume: number;
	whooshStyle: WhooshSfxStyle;
	whooshTriggers: WhooshTriggerMode;
	zoomSfxEnabled?: boolean;
	zoomSfxVolume?: number;
	keystrokeEnabled?: boolean;
	keystrokeVolume?: number;
	keystrokeStyle?: KeystrokeSfxStyle;
	keystrokeShortcutsOnly?: boolean;
	scrollEnabled?: boolean;
	scrollVolume?: number;
	scrollStyle?: ScrollSfxStyle;
}

export const DEFAULT_CURSOR_SFX_SETTINGS: CursorSfxSettings = {
	enabled: true,
	clickEnabled: true,
	clickVolume: 0.7,
	clickStyle: "crisp",
	dragEnabled: false,
	dragVolume: 0.5,
	dragStyle: "procedural",
	whooshEnabled: true,
	whooshVolume: 0.6,
	whooshStyle: "procedural",
	whooshTriggers: "both",
	zoomSfxEnabled: true,
	zoomSfxVolume: 0.6,
	keystrokeEnabled: true,
	keystrokeVolume: 0.65,
	keystrokeStyle: "mechanical",
	keystrokeShortcutsOnly: false,
	scrollEnabled: true,
	scrollVolume: 0.5,
	scrollStyle: "ratchet",
};

export const SFX_DURATIONS_MS: Record<string, number> = {
	"/sfx/click-crisp.mp3": 245,
	"/sfx/click-soft.wav": 500,
	"/sfx/click-digital.mp3": 579,
	"/sfx/drag-mouse.mp3": 700,
	"/sfx/whoosh-fast.mp3": 480,
	"/sfx/whoosh-swoosh.mp3": 557,
};

/**
 * Peak offset (milliseconds from audio start to maximum amplitude/transient).
 * Used to align the highest point of the click sound with the exact click event timestamp.
 */
export const SFX_PEAK_OFFSETS_MS: Record<string, number> = {
	"/sfx/click-crisp.mp3": 32,
	"/sfx/click.mp3": 32,
	"/sfx/click-digital.mp3": 227,
	"/sfx/click-soft.wav": 4,
};

export function getClickSfxAudioPath(style: ClickSfxStyle): string {
	switch (style) {
		case "soft":
			return "/sfx/click-soft.wav";
		case "digital":
			return "/sfx/click-digital.mp3";
		case "crisp":
		default:
			return "/sfx/click-crisp.mp3";
	}
}

export function getDragSfxAudioPath(style: DragSfxStyle): string {
	switch (style) {
		case "mouse":
		case "slide":
		default:
			return "/sfx/drag-mouse.mp3";
	}
}

export function getWhooshSfxAudioPath(style: WhooshSfxStyle): string {
	switch (style) {
		case "swoosh":
			return "/sfx/whoosh-swoosh.mp3";
		case "fast":
			return "/sfx/whoosh-fast.mp3";
		case "procedural":
		default:
			return "/sfx/whoosh-fast.mp3";
	}
}

/**
 * Detects kinematic micro-dwells where a user moves to a button or target,
 * pauses briefly (55ms - 400ms) with minimal jitter (< 0.014 normalized units),
 * and then moves away or stops.
 * This catches clicks that dropped below the threshold of standard dwell detectors
 * or where OS mouse hook events were swallowed (e.g. Wayland sandboxing, touchpad tap).
 */
export function detectKinematicMicroDwells(
	samples: CursorTelemetryPoint[],
	minDwellDurationMs = 55,
	maxDwellDurationMs = 400,
	maxJitterDistance = 0.014,
): number[] {
	if (samples.length < 3) return [];

	const clickTimes: number[] = [];
	let runStartIndex = 0;

	for (let i = 1; i < samples.length; i++) {
		const start = samples[runStartIndex];
		const curr = samples[i];
		const duration = curr.timeMs - start.timeMs;
		const distance = Math.hypot(curr.cx - start.cx, curr.cy - start.cy);

		if (distance > maxJitterDistance) {
			// Movement exceeded threshold: check if the previous run was a micro-dwell
			if (duration >= minDwellDurationMs && duration <= maxDwellDurationMs) {
				// Check if there was approach motion before this dwell (moved in the prior 250ms)
				const priorIndex = Math.max(0, runStartIndex - 3);
				const priorSample = samples[priorIndex];
				const priorDistance = Math.hypot(start.cx - priorSample.cx, start.cy - priorSample.cy);
				const hasPriorMotion = runStartIndex > 0 && priorDistance > 0.012;

				// Or cursor was an interactive pointer/hand/text
				const isInteractiveCursor = samples
					.slice(runStartIndex, i)
					.some(
						(s) =>
							s.cursorType === "pointer" ||
							s.cursorType === "closed-hand" ||
							s.cursorType === "text",
					);

				if (hasPriorMotion || isInteractiveCursor) {
					clickTimes.push(Math.round(start.timeMs + duration * 0.3));
				}
			}
			runStartIndex = i;
		} else if (duration > maxDwellDurationMs) {
			// Stayed still too long (idle hover, not a quick click)
			runStartIndex = i;
		}
	}

	return clickTimes;
}

/**
 * Detects distinct click timestamps from cursor telemetry.
 * Combines explicit interaction samples, isolated mouseup events, heuristic candidates,
 * and kinematic micro-dwells, merging without dropping valid clicks.
 */
export function detectCursorClicks(
	samples: CursorTelemetryPoint[],
	minGapMs = 120,
): number[] {
	if (!samples || samples.length === 0) return [];

	const sortedSamples = [...samples].sort((a, b) => a.timeMs - b.timeMs);
	const explicitTimestamps: number[] = [];
	const candidateTimestamps: number[] = [];

	// 1. Explicit interaction clicks from uiohook / evdev
	for (const sample of sortedSamples) {
		const type = sample.interactionType;
		if (
			type === "click" ||
			type === "right-click" ||
			type === "middle-click"
		) {
			explicitTimestamps.push(Math.round(sample.timeMs));
		} else if (type === "double-click") {
			explicitTimestamps.push(Math.round(sample.timeMs));
			explicitTimestamps.push(Math.round(sample.timeMs + 130));
		}
	}

	// 1b. Standalone mouseup events (when mousedown was dropped or lost)
	for (let i = 0; i < sortedSamples.length; i++) {
		const sample = sortedSamples[i];
		if (sample.interactionType === "mouseup") {
			const time = Math.round(sample.timeMs);
			const hasNearbyClick = explicitTimestamps.some(
				(t) => Math.abs(t - time) <= 350,
			);
			if (!hasNearbyClick) {
				explicitTimestamps.push(time);
			}
		}
	}

	// Helper to check if a timestamp is near any confirmed explicit click
	const isNearExplicit = (time: number, windowMs = 200) =>
		explicitTimestamps.some((t) => Math.abs(t - time) <= windowMs);

	// 2. High-confidence kinematic pointer clicks (user moved to button/link with 'pointer' cursor and clicked)
	for (let i = 1; i < sortedSamples.length; i++) {
		const curr = sortedSamples[i];
		if (curr.cursorType === "pointer") {
			const time = Math.round(curr.timeMs);
			if (!isNearExplicit(time, 240) && !candidateTimestamps.some((t) => Math.abs(t - time) <= 240)) {
				const prev = sortedSamples[i - 1];
				const dt = curr.timeMs - prev.timeMs;
				const dist = Math.hypot(curr.cx - prev.cx, curr.cy - prev.cy);
				if (dt >= 40 && dt <= 250 && dist < 0.01) {
					candidateTimestamps.push(time);
				}
			}
		}
	}

	// 3. Fallback heuristic candidates ONLY when no explicit clicks were captured anywhere
	if (explicitTimestamps.length === 0) {
		const candidates = detectInteractionCandidates(sortedSamples);
		for (const cand of candidates) {
			if (
				cand.kind === "click-like" ||
				cand.kind === "text-field-click" ||
				cand.kind === "dropdown-open"
			) {
				const time = Math.round(cand.centerTimeMs);
				if (!candidateTimestamps.some((t) => Math.abs(t - time) <= 180)) {
					candidateTimestamps.push(time);
				}
			} else if (cand.kind === "double-click-like") {
				const time = Math.round(cand.centerTimeMs);
				candidateTimestamps.push(time);
				candidateTimestamps.push(time + 130);
			}
		}
	}

	// 4. Combine all sources, sort & de-duplicate with minGapMs (120ms preserves double-clicks at 130ms)
	const all = [...explicitTimestamps, ...candidateTimestamps].sort((a, b) => a - b);
	const deduplicated: number[] = [];
	for (const ts of all) {
		if (
			deduplicated.length === 0 ||
			ts - deduplicated[deduplicated.length - 1] >= minGapMs
		) {
			deduplicated.push(ts);
		}
	}

	return deduplicated;
}

export interface DragSpan {
	startMs: number;
	endMs: number;
}

/**
 * Detects mouse drag intervals (mousedown + movement + mouseup, or closed-hand cursor).
 * Strictly bounded by maxDragDurationMs (2.5s) to avoid runaway spans across the timeline.
 */
export function detectCursorDrags(
	samples: CursorTelemetryPoint[],
	minDragDurationMs = 180,
	maxDragDurationMs = 2500,
	minDragDistance = 0.02,
): DragSpan[] {
	if (!samples || samples.length < 2) return [];

	const rawSpans: DragSpan[] = [];

	// 1. Detect drag from click/mousedown to mouseup without crossing intervening clicks
	for (let i = 0; i < samples.length; i++) {
		const sample = samples[i];
		if (sample.interactionType !== "click" && sample.interactionType !== "double-click") {
			continue;
		}

		let mouseUp: CursorTelemetryPoint | null = null;
		for (let j = i + 1; j < samples.length; j++) {
			const next = samples[j];
			if (next.timeMs - sample.timeMs > maxDragDurationMs) {
				break;
			}
			// If another click starts, terminate this candidate
			if (
				next.interactionType === "click" ||
				next.interactionType === "double-click" ||
				next.interactionType === "right-click"
			) {
				break;
			}
			if (next.interactionType === "mouseup") {
				mouseUp = next;
				break;
			}
		}

		if (!mouseUp) continue;

		const duration = mouseUp.timeMs - sample.timeMs;
		const distance = Math.hypot(mouseUp.cx - sample.cx, mouseUp.cy - sample.cy);

		if (duration >= minDragDurationMs && duration <= maxDragDurationMs && distance >= minDragDistance) {
			rawSpans.push({
				startMs: Math.round(sample.timeMs),
				endMs: Math.round(mouseUp.timeMs),
			});
		}
	}

	// 2. Detect closed-hand cursor runs (capped at maxDragDurationMs)
	let closedHandStart: number | null = null;
	let closedHandStartX = 0;
	let closedHandStartY = 0;
	for (let i = 0; i < samples.length; i++) {
		const s = samples[i];
		if (s.cursorType === "closed-hand") {
			if (closedHandStart === null) {
				closedHandStart = s.timeMs;
				closedHandStartX = s.cx;
				closedHandStartY = s.cy;
			} else if (s.timeMs - closedHandStart >= maxDragDurationMs) {
				const dist = Math.hypot(s.cx - closedHandStartX, s.cy - closedHandStartY);
				if (dist >= minDragDistance) {
					rawSpans.push({
						startMs: Math.round(closedHandStart),
						endMs: Math.round(closedHandStart + maxDragDurationMs),
					});
				}
				closedHandStart = null;
			}
		} else if (closedHandStart !== null) {
			const dur = s.timeMs - closedHandStart;
			const dist = Math.hypot(s.cx - closedHandStartX, s.cy - closedHandStartY);
			if (dur >= minDragDurationMs && dur <= maxDragDurationMs && dist >= minDragDistance) {
				rawSpans.push({
					startMs: Math.round(closedHandStart),
					endMs: Math.round(s.timeMs),
				});
			}
			closedHandStart = null;
		}
	}
	if (closedHandStart !== null && samples.length > 0) {
		const last = samples[samples.length - 1];
		const dur = Math.min(maxDragDurationMs, last.timeMs - closedHandStart);
		const dist = Math.hypot(last.cx - closedHandStartX, last.cy - closedHandStartY);
		if (dur >= minDragDurationMs && dist >= minDragDistance) {
			rawSpans.push({
				startMs: Math.round(closedHandStart),
				endMs: Math.round(closedHandStart + dur),
			});
		}
	}

	if (rawSpans.length === 0) return [];

	// 3. Sort and merge overlapping or near-adjacent spans (within 150ms)
	rawSpans.sort((a, b) => a.startMs - b.startMs);
	const merged: DragSpan[] = [rawSpans[0]];

	for (let i = 1; i < rawSpans.length; i++) {
		const current = rawSpans[i];
		const prev = merged[merged.length - 1];

		if (current.startMs <= prev.endMs + 150) {
			prev.endMs = Math.max(prev.endMs, Math.min(prev.startMs + maxDragDurationMs, current.endMs));
		} else {
			merged.push({ ...current });
		}
	}

	return merged;
}

export interface CursorWhooshEvent {
	startMs: number;
	endMs: number;
	peakMs: number;
	peakVelocity: number;
	type: "movement" | "zoom";
	isZoomIn?: boolean;
	samples: CursorTelemetryPoint[];
}

/**
 * Detects whoosh moments from rapid cursor sweeps and/or zoom transitions.
 */
export function detectCursorWhooshes(
	samples: CursorTelemetryPoint[],
	zoomRegions: ZoomRegion[] = [],
	triggers: WhooshTriggerMode = "both",
	velocityThreshold = 1.6, // screen widths per sec
	cooldownMs = 1200,
): number[] {
	const events = detectCursorWhooshEvents(
		samples,
		zoomRegions,
		triggers,
		velocityThreshold,
		cooldownMs,
	);
	return events.map((e) => (e.type === "movement" ? e.peakMs : e.startMs));
}

/**
 * Detects detailed whoosh events (movement spans and zoom transitions)
 * suitable for both procedural synthesis and sample placement.
 */
export function detectCursorWhooshEvents(
	samples: CursorTelemetryPoint[],
	zoomRegions: ZoomRegion[] = [],
	triggers: WhooshTriggerMode = "both",
	velocityThreshold = 1.6, // screen widths per sec
	cooldownMs = 1200,
): CursorWhooshEvent[] {
	const events: CursorWhooshEvent[] = [];

	// 1. Zoom in & Zoom out transitions
	if (triggers === "both" || triggers === "zooms") {
		for (const zoom of zoomRegions) {
			// Zoom In onset
			const inStart = Math.round(zoom.startMs);
			events.push({
				startMs: inStart,
				endMs: inStart + 350,
				peakMs: inStart,
				peakVelocity: 2.5,
				type: "zoom",
				isZoomIn: true,
				samples: [],
			});

			// Zoom Out onset
			if (zoom.endMs - zoom.startMs >= 800) {
				const outStart = Math.round(Math.max(zoom.startMs + 400, zoom.endMs - 400));
				events.push({
					startMs: outStart,
					endMs: outStart + 400,
					peakMs: outStart,
					peakVelocity: 2.0,
					type: "zoom",
					isZoomIn: false,
					samples: [],
				});
			}
		}
	}

	// 2. Rapid cursor sweeps (high velocity)
	if ((triggers === "both" || triggers === "movement") && samples.length >= 2) {
		let lastWhooshTime = -99999;

		for (let i = 1; i < samples.length; i++) {
			const prev = samples[i - 1];
			const curr = samples[i];
			const dt = (curr.timeMs - prev.timeMs) / 1000;

			if (dt <= 0.005 || dt > 0.4) continue;

			const dist = Math.hypot(curr.cx - prev.cx, curr.cy - prev.cy);
			const velocity = dist / dt;

			if (velocity >= velocityThreshold) {
				const peakTime = Math.round((prev.timeMs + curr.timeMs) / 2);
				if (peakTime - lastWhooshTime >= cooldownMs) {
					// Check it doesn't collide with a zoom whoosh within 500ms
					const overlapsZoom = events.some((e) => Math.abs(e.peakMs - peakTime) < 500);
					if (!overlapsZoom) {
						// Expand backwards to find when movement began
						let startIdx = i - 1;
						while (startIdx > 0 && samples[startIdx].timeMs >= peakTime - 220) {
							const pA = samples[startIdx - 1];
							const pB = samples[startIdx];
							const stepDt = Math.max(0.005, (pB.timeMs - pA.timeMs) / 1000);
							const stepV = Math.hypot(pB.cx - pA.cx, pB.cy - pA.cy) / stepDt;
							if (stepV < 0.45) break;
							startIdx--;
						}

						// Expand forwards to find when movement settled
						let endIdx = i;
						while (endIdx < samples.length - 1 && samples[endIdx].timeMs <= peakTime + 280) {
							const pA = samples[endIdx];
							const pB = samples[endIdx + 1];
							const stepDt = Math.max(0.005, (pB.timeMs - pA.timeMs) / 1000);
							const stepV = Math.hypot(pB.cx - pA.cx, pB.cy - pA.cy) / stepDt;
							if (stepV < 0.45) break;
							endIdx++;
						}

						const sweepPoints = samples.slice(startIdx, endIdx + 1);
						const startMs = Math.round(samples[startIdx].timeMs);
						const endMs = Math.round(samples[endIdx].timeMs);

						events.push({
							startMs,
							endMs: Math.max(startMs + 180, endMs),
							peakMs: peakTime,
							peakVelocity: velocity,
							type: "movement",
							samples: sweepPoints,
						});
						lastWhooshTime = peakTime;
					}
				}
			}
		}
	}

	events.sort((a, b) => a.startMs - b.startMs);
	return events;
}

/**
 * Generates AudioRegion[] items from keystroke telemetry.
 * Automatically synthesizes realistic mechanical/thock/typewriter/soft clicks
 * and assigns them to a dedicated audio track (Track 3: Keys SFX).
 */
export function generateKeystrokeSfxRegions(input: {
	keystrokes: KeystrokeEvent[];
	durationMs: number;
	style?: KeystrokeSfxStyle;
	volume?: number;
	shortcutsOnly?: boolean;
	trackIndex?: number;
}): AudioRegion[] {
	const {
		keystrokes,
		durationMs,
		style = "mechanical",
		volume = 0.65,
		shortcutsOnly = false,
		trackIndex = 3,
	} = input;

	if (!keystrokes || keystrokes.length === 0) return [];

	// Filter enabled keystrokes and respect shortcutsOnly if requested
	const candidates = keystrokes
		.filter((k) => k.enabled !== false && (!shortcutsOnly || k.isShortcut))
		.sort((a, b) => a.timeMs - b.timeMs);

	const regions: AudioRegion[] = [];
	let lastKeyTimeMs = -100;
	let idCounter = 0;

	for (const key of candidates) {
		const ts = Math.round(key.timeMs);
		if (ts >= durationMs) continue;

		// Deduplicate rapid repeat events within 55ms (chords / repeat keys)
		if (ts - lastKeyTimeMs < 55) {
			continue;
		}
		lastKeyTimeMs = ts;

		const isSpace =
			key.keys?.some((k) => k.toLowerCase() === "space") ||
			key.displayText?.toLowerCase() === "space";
		const isMod = key.keys?.some((k) =>
			["ctrl", "shift", "alt", "meta", "win", "cmd", "enter", "tab", "backspace"].includes(
				k.toLowerCase(),
			),
		);

		const synth = synthesizeKeystrokeClickWav({
			style,
			volume: 1.0,
			isSpacebar: isSpace,
			isModifier: isMod,
		});

		// 140ms duration provides a legible, interactable timeline badge
		const displayDurMs = 140;
		const endMs = Math.min(durationMs, ts + displayDurMs);

		regions.push({
			id: `sfx-key-${ts}-${idCounter++}`,
			startMs: ts,
			endMs,
			audioPath: synth.dataUrl,
			volume,
			trackIndex,
			label: key.displayText ? `Key (${key.displayText})` : "Keypress",
			category: "Keystroke SFX",
		});
	}

	return regions;
}

export interface ScrollBurst {
	startMs: number;
	endMs: number;
	tickCount: number;
	avgDelta: number;
	cx: number;
	cy: number;
}

/**
 * Detects scroll event bursts from cursor telemetry.
 * Groups consecutive scroll samples within 200ms into bursts and emits one
 * SFX tick per scroll notch within each burst.
 */
export function detectScrollBursts(
	samples: CursorTelemetryPoint[],
	minGapMs = 80,
): ScrollBurst[] {
	const scrollSamples = samples.filter((s) => s.interactionType === "scroll");
	if (scrollSamples.length === 0) return [];

	const bursts: ScrollBurst[] = [];
	let burstStart = scrollSamples[0];
	let burstEnd = scrollSamples[0];
	let tickCount = 1;
	let deltaSum = burstStart.scrollDelta ?? 0;
	let cxSum = burstStart.cx;
	let cySum = burstStart.cy;

	for (let i = 1; i < scrollSamples.length; i++) {
		const s = scrollSamples[i];
		if (s.timeMs - burstEnd.timeMs <= minGapMs) {
			burstEnd = s;
			tickCount++;
			deltaSum += s.scrollDelta ?? 0;
			cxSum += s.cx;
			cySum += s.cy;
		} else {
			bursts.push({
				startMs: Math.round(burstStart.timeMs),
				endMs: Math.round(burstEnd.timeMs),
				tickCount,
				avgDelta: deltaSum / tickCount,
				cx: cxSum / tickCount,
				cy: cySum / tickCount,
			});
			burstStart = s;
			burstEnd = s;
			tickCount = 1;
			deltaSum = s.scrollDelta ?? 0;
			cxSum = s.cx;
			cySum = s.cy;
		}
	}

	bursts.push({
		startMs: Math.round(burstStart.timeMs),
		endMs: Math.round(burstEnd.timeMs),
		tickCount,
		avgDelta: deltaSum / tickCount,
		cx: cxSum / tickCount,
		cy: cySum / tickCount,
	});

	return bursts;
}

export interface AutoSfxGenerationOptions {
	settings?: Partial<CursorSfxSettings>;
	types?: {
		clicks?: boolean;
		drags?: boolean;
		whooshes?: boolean;
		zooms?: boolean;
		keystrokes?: boolean;
		scrolls?: boolean;
	};
}

/**
 * Generates AudioRegion[] items from cursor telemetry, zoom regions, and keystrokes.
 * Neatly partitions audio into 4 dedicated tracks:
 * - Track 0: Clicks & Drags
 * - Track 1: Cursor movement Whooshes
 * - Track 2: Zoom transition audio (Zoom In / Zoom Out)
 * - Track 3: Keystroke & Typing audio
 */
export function generateAutoCursorSfxRegions(input: {
	telemetry?: CursorTelemetryPoint[];
	zoomRegions?: ZoomRegion[];
	keystrokes?: KeystrokeEvent[];
	durationMs: number;
	options?: AutoSfxGenerationOptions;
}): AudioRegion[] {
	const { telemetry = [], zoomRegions = [], keystrokes = [], durationMs, options = {} } = input;
	const settings: CursorSfxSettings = {
		...DEFAULT_CURSOR_SFX_SETTINGS,
		...(options.settings ?? {}),
	};
	const zoomVolume =
		options.settings?.zoomSfxVolume ??
		(options.settings?.whooshVolume !== undefined
			? options.settings.whooshVolume
			: (settings.zoomSfxVolume ?? 0.6));

	const includeClicks = options.types?.clicks ?? settings.clickEnabled;
	const includeDrags = options.types?.drags ?? settings.dragEnabled;
	const includeWhooshes = options.types?.whooshes ?? settings.whooshEnabled;
	const includeZooms = options.types?.zooms ?? (settings.zoomSfxEnabled ?? true);
	const includeKeystrokes =
		options.types?.keystrokes ??
		(options.settings?.keystrokeEnabled !== undefined
			? options.settings.keystrokeEnabled
			: Boolean(settings.keystrokeEnabled && keystrokes && keystrokes.length > 0));

	const regions: AudioRegion[] = [];
	let idCounter = 0;

	// 1. Clicks (Track 0)
	if (includeClicks && telemetry.length > 0) {
		const clickTimestamps = detectCursorClicks(telemetry);

		for (const ts of clickTimestamps) {
			if (ts >= durationMs) continue;

			let audioPath: string;
			const clickDuration = 220; // 220ms ensures clean, legible badges that never crush into 1px slivers
			let startMs: number;
			let endMs: number;

			if (settings.clickStyle === "procedural") {
				// Find closest telemetry sample for spatial panning and click type
				const sample = telemetry.find((s) => Math.abs(s.timeMs - ts) < 80);
				const pan = sample ? (sample.cx - 0.5) * 1.5 : 0;
				const isRight = sample?.interactionType === "right-click";
				const isDouble = sample?.interactionType === "double-click";

				const synth = synthesizeCursorClickWav({
					style: "crisp",
					isRightClick: isRight,
					isDoubleClick: isDouble,
					pan,
					volume: 1.0,
					durationMs: clickDuration,
				});
				audioPath = synth.dataUrl;
				startMs = ts;
				endMs = Math.min(durationMs, ts + clickDuration);
			} else {
				audioPath = getClickSfxAudioPath(settings.clickStyle);
				const defaultDur = SFX_DURATIONS_MS[audioPath] ?? 245;
				const peakOffsetMs = SFX_PEAK_OFFSETS_MS[audioPath] ?? 0;
				// Align the highest point (peak amplitude) of the click audio with when the click happened (ts)
				startMs = Math.max(0, ts - peakOffsetMs);
				endMs = Math.min(durationMs, startMs + Math.max(clickDuration, defaultDur));
			}

			regions.push({
				id: `sfx-click-${ts}-${idCounter++}`,
				startMs,
				endMs,
				audioPath,
				volume: settings.clickVolume,
				trackIndex: 0,
				label: "Click",
				category: "Cursor SFX",
			});
		}
	}

	// 2. Drags (Track 0)
	if (includeDrags) {
		const dragSpans = detectCursorDrags(telemetry);

		for (const span of dragSpans) {
			if (span.startMs >= durationMs) continue;

			let audioPath: string;
			// Strictly cap drag audio duration to max 2500ms
			const dragDuration = Math.min(2500, Math.max(200, span.endMs - span.startMs));

			if (settings.dragStyle === "procedural") {
				const spanSamples = telemetry.filter(
					(s) => s.timeMs >= span.startMs && s.timeMs <= span.endMs,
				);
				const avgCx =
					spanSamples.length > 0
						? spanSamples.reduce((sum, s) => sum + s.cx, 0) / spanSamples.length
						: 0.5;
				const synth = synthesizeCursorDragWav(spanSamples, {
					pan: (avgCx - 0.5) * 1.4,
					volume: 1.0,
					durationMs: dragDuration,
				});
				audioPath = synth.dataUrl;
			} else {
				audioPath = getDragSfxAudioPath(settings.dragStyle);
			}

			const endMs = Math.min(durationMs, span.startMs + dragDuration);
			regions.push({
				id: `sfx-drag-${span.startMs}-${idCounter++}`,
				startMs: span.startMs,
				endMs,
				audioPath,
				volume: settings.dragVolume,
				trackIndex: 0,
				label: "Drag",
				category: "Cursor SFX",
			});
		}
	}

	// 3. Whooshes (Track 1) & Zooms (Track 2)
	if (includeWhooshes || includeZooms) {
		let effectiveTriggers: WhooshTriggerMode = "both";
		if (includeWhooshes && !includeZooms) {
			effectiveTriggers = "movement";
		} else if (!includeWhooshes && includeZooms) {
			effectiveTriggers = "zooms";
		} else {
			effectiveTriggers = settings.whooshTriggers;
		}

		const whooshEvents = detectCursorWhooshEvents(
			telemetry,
			zoomRegions,
			effectiveTriggers,
		);

		for (const event of whooshEvents) {
			if (event.startMs >= durationMs) continue;

			if (event.type === "movement") {
				if (!includeWhooshes) continue;

				let audioPath = getWhooshSfxAudioPath(settings.whooshStyle);
				let soundDur = SFX_DURATIONS_MS[audioPath] ?? 480;

				if (settings.whooshStyle === "procedural" && event.samples.length >= 2) {
					const generated = synthesizeCursorWhooshWav(event.samples, {
						volume: 1.0,
					});
					audioPath = generated.dataUrl;
					soundDur = generated.durationMs;
				}

				const endMs = Math.min(durationMs, event.startMs + soundDur);
				regions.push({
					id: `sfx-whoosh-${event.startMs}-${idCounter++}`,
					startMs: event.startMs,
					endMs,
					audioPath,
					volume: settings.whooshVolume,
					trackIndex: 1, // DEDICATED WHOOSHES LAYER
					label: settings.whooshStyle === "procedural" ? "Whoosh (Dynamic)" : "Whoosh",
					category: "Cursor SFX",
				});
			} else {
				// Zoom transition event
				if (!includeZooms) continue;

				let audioPath = getWhooshSfxAudioPath(settings.whooshStyle);
				let soundDur = SFX_DURATIONS_MS[audioPath] ?? 480;

				if (settings.whooshStyle === "procedural") {
					const generated = synthesizeZoomWhooshWav(Boolean(event.isZoomIn), {
						volume: 1.0,
					});
					audioPath = generated.dataUrl;
					soundDur = generated.durationMs;
				}

				const endMs = Math.min(durationMs, event.startMs + soundDur);
				regions.push({
					id: `sfx-zoom-${event.startMs}-${idCounter++}`,
					startMs: event.startMs,
					endMs,
					audioPath,
					volume: zoomVolume,
					trackIndex: 2, // DEDICATED ZOOMS LAYER
					label: event.isZoomIn ? "Zoom In" : "Zoom Out",
					category: "Cursor SFX",
				});
			}
		}
	}

	// 4. Keystrokes (Track 3)
	if (includeKeystrokes && keystrokes && keystrokes.length > 0) {
		const keystrokeVolume = options.settings?.keystrokeVolume ?? settings.keystrokeVolume ?? 0.65;
		const keystrokeStyle = options.settings?.keystrokeStyle ?? settings.keystrokeStyle ?? "mechanical";
		const shortcutsOnly = options.settings?.keystrokeShortcutsOnly ?? settings.keystrokeShortcutsOnly ?? false;

		const keyRegions = generateKeystrokeSfxRegions({
			keystrokes,
			durationMs,
			style: keystrokeStyle,
			volume: keystrokeVolume,
			shortcutsOnly,
			trackIndex: 3,
		});
		regions.push(...keyRegions);
	}

	// 5. Scroll ticks (Track 4)
	const includeScrolls =
		options.types?.scrolls ??
		(options.settings?.scrollEnabled !== undefined
			? options.settings.scrollEnabled
			: Boolean(settings.scrollEnabled));

	if (includeScrolls && telemetry.length > 0) {
		const scrollVolume = options.settings?.scrollVolume ?? settings.scrollVolume ?? 0.5;
		const scrollStyle = options.settings?.scrollStyle ?? settings.scrollStyle ?? "ratchet";

		const scrollBursts = detectScrollBursts(telemetry);

		for (const burst of scrollBursts) {
			if (burst.startMs >= durationMs) continue;

			// Generate individual tick sounds for each scroll notch in the burst
			const tickSpacing = burst.tickCount > 1
				? Math.max(35, (burst.endMs - burst.startMs) / burst.tickCount)
				: 0;

			for (let tick = 0; tick < burst.tickCount; tick++) {
				const tickMs = Math.round(burst.startMs + tick * tickSpacing);
				if (tickMs >= durationMs) break;

				const synth = synthesizeScrollTickWav({
					style: scrollStyle,
					volume: 1.0,
					pan: (burst.cx - 0.5) * 1.2,
					intensity: Math.min(1, Math.abs(burst.avgDelta)),
				});

				const endMs = Math.min(durationMs, tickMs + synth.durationMs);
				regions.push({
					id: `sfx-scroll-${tickMs}-${idCounter++}`,
					startMs: tickMs,
					endMs,
					audioPath: synth.dataUrl,
					volume: scrollVolume,
					trackIndex: 4,
					label: "Scroll",
					category: "Cursor SFX",
				});
			}
		}
	}

	// Sort chronologically
	regions.sort((a, b) => a.startMs - b.startMs);
	return regions;
}
