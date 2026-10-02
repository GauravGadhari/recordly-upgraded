import {
	type KeystrokeEvent,
	type KeystrokePosition,
	type KeystrokeVisualSettings,
} from "@/components/video-editor/types";
import { drawSquircleOnCanvas } from "@/lib/geometry/squircle";

export interface ActiveKeystrokeEntry {
	event: KeystrokeEvent;
	opacity: number;
	scale: number;
	layerIndex: number;
}

export function getActiveKeystrokeEvents(
	keystrokes: KeystrokeEvent[] | undefined,
	settings: KeystrokeVisualSettings | undefined,
	timeMs: number,
): ActiveKeystrokeEntry[] {
	if (!settings?.enabled || !keystrokes || keystrokes.length === 0) {
		return [];
	}

	const maxLayers = settings.maxLayers ?? 2;
	const lingerMs = settings.lingerDurationMs || 1500;
	const matches: KeystrokeEvent[] = [];

	for (let i = keystrokes.length - 1; i >= 0; i--) {
		const evt = keystrokes[i];
		if (evt.enabled === false) continue;
		if (settings.showShortcutsOnly && !evt.isShortcut) continue;

		const start = evt.timeMs;
		const end = evt.timeMs + (settings.lingerDurationMs || evt.durationMs || lingerMs);
		if (timeMs >= start && timeMs <= end) {
			matches.push(evt);
			if (matches.length >= maxLayers) {
				break;
			}
		}
	}

	if (matches.length === 0) return [];

	// Reverse so older is on top and newest is on bottom (standard reading order)
	matches.reverse();

	return matches
		.map((evt, idx) => {
			const elapsed = timeMs - evt.timeMs;
			const duration = settings.lingerDurationMs || evt.durationMs || lingerMs;
			const fadeIn = Math.min(1, elapsed / 120);
			const remaining = duration - elapsed;
			const fadeOut = Math.min(1, remaining / 220);
			let opacity = Math.max(0, Math.min(fadeIn, fadeOut));

			// If there are 2 layers and this is the older one, slightly de-emphasize
			if (matches.length > 1 && idx === 0) {
				opacity *= 0.85;
			}

			const scale = 0.96 + opacity * 0.04;
			return {
				event: evt,
				opacity,
				scale,
				layerIndex: idx,
			};
		})
		.filter((e) => e.opacity > 0.001);
}

/** Convenience helper returning the single latest active event */
export function getActiveKeystrokeEvent(
	keystrokes: KeystrokeEvent[] | undefined,
	settings: KeystrokeVisualSettings | undefined,
	timeMs: number,
): { event: KeystrokeEvent; opacity: number; scale: number } | null {
	const activeList = getActiveKeystrokeEvents(keystrokes, settings, timeMs);
	if (activeList.length === 0) return null;
	const latest = activeList[activeList.length - 1];
	return { event: latest.event, opacity: latest.opacity, scale: latest.scale };
}

export function getKeystrokeDimensions(size: KeystrokeVisualSettings["size"], resScale: number) {
	switch (size) {
		case "small":
			return {
				keycapFontSize: 16 * resScale,
				sepFontSize: 15 * resScale,
				containerPadX: 14 * resScale,
				containerPadY: 8 * resScale,
				containerRadius: 10 * resScale,
				keycapPadX: 10 * resScale,
				keycapPadY: 5 * resScale,
				keycapRadius: 6 * resScale,
				keycapMinW: 30 * resScale,
				gap: 8 * resScale,
				stackGap: 6 * resScale,
				margin: 36 * resScale,
			};
		case "large":
			return {
				keycapFontSize: 26 * resScale,
				sepFontSize: 22 * resScale,
				containerPadX: 24 * resScale,
				containerPadY: 14 * resScale,
				containerRadius: 18 * resScale,
				keycapPadX: 18 * resScale,
				keycapPadY: 9 * resScale,
				keycapRadius: 10 * resScale,
				keycapMinW: 48 * resScale,
				gap: 12 * resScale,
				stackGap: 10 * resScale,
				margin: 52 * resScale,
			};
		case "medium":
		default:
			return {
				keycapFontSize: 20 * resScale,
				sepFontSize: 18 * resScale,
				containerPadX: 18 * resScale,
				containerPadY: 10 * resScale,
				containerRadius: 14 * resScale,
				keycapPadX: 14 * resScale,
				keycapPadY: 7 * resScale,
				keycapRadius: 8 * resScale,
				keycapMinW: 38 * resScale,
				gap: 10 * resScale,
				stackGap: 8 * resScale,
				margin: 44 * resScale,
			};
	}
}

export function getKeystrokeTheme(style: KeystrokeVisualSettings["style"]) {
	switch (style) {
		case "light":
			return {
				containerBg: "rgba(255, 255, 255, 0.96)",
				containerBorder: "rgba(212, 212, 212, 0.9)",
				containerShadow: "rgba(0, 0, 0, 0.15)",
				keycapBg: "#f5f5f5",
				keycapBorder: "#d4d4d4",
				textColor: "#171717",
				sepColor: "#737373",
			};
		case "glass":
			return {
				containerBg: "rgba(0, 0, 0, 0.45)",
				containerBorder: "rgba(255, 255, 255, 0.25)",
				containerShadow: "rgba(0, 0, 0, 0.5)",
				keycapBg: "rgba(255, 255, 255, 0.18)",
				keycapBorder: "rgba(255, 255, 255, 0.3)",
				textColor: "#ffffff",
				sepColor: "rgba(255, 255, 255, 0.7)",
			};
		case "accent":
			return {
				containerBg: "rgba(15, 23, 42, 0.92)",
				containerBorder: "rgba(59, 130, 246, 0.5)",
				containerShadow: "rgba(37, 99, 235, 0.35)",
				keycapBg: "rgba(37, 99, 235, 0.35)",
				keycapBorder: "rgba(96, 165, 250, 0.6)",
				textColor: "#dbeafe",
				sepColor: "#60a5fa",
			};
		case "dark":
		default:
			return {
				containerBg: "rgba(23, 23, 23, 0.92)",
				containerBorder: "rgba(64, 64, 64, 0.8)",
				containerShadow: "rgba(0, 0, 0, 0.6)",
				keycapBg: "rgba(38, 38, 38, 0.95)",
				keycapBorder: "rgba(82, 82, 82, 0.8)",
				textColor: "#ffffff",
				sepColor: "#a3a3a3",
			};
	}
}

export interface SinglePillLayout {
	event: KeystrokeEvent;
	keysToRender: string[];
	keycapMeasurements: Array<{ key: string; width: number }>;
	sepWidth: number;
	keycapHeight: number;
	boxWidth: number;
	boxHeight: number;
}

export interface MultiKeystrokeLayout {
	resScale: number;
	dims: ReturnType<typeof getKeystrokeDimensions>;
	pills: SinglePillLayout[];
	totalStackWidth: number;
	totalStackHeight: number;
	centerX: number;
	centerY: number;
	key: string;
}

export function buildMultiKeystrokeLayout(
	measureCtx: CanvasRenderingContext2D,
	activeEntries: ActiveKeystrokeEntry[],
	settings: KeystrokeVisualSettings,
	width: number,
	height: number,
): MultiKeystrokeLayout {
	const resScale = Math.max(0.5, height / 1080);
	const size = settings.size || "medium";
	const dims = getKeystrokeDimensions(size, resScale);

	const pills: SinglePillLayout[] = activeEntries.map(({ event }) => {
		const keysToRender =
			Array.isArray(event.keys) && event.keys.length > 0
				? event.keys
				: [event.displayText || "Key"];

		measureCtx.font = `600 ${dims.keycapFontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
		const keycapMeasurements = keysToRender.map((k) => {
			const textW = measureCtx.measureText(k).width;
			const w = Math.max(dims.keycapMinW, textW + dims.keycapPadX * 2);
			return { key: k, width: w };
		});

		measureCtx.font = `700 ${dims.sepFontSize}px system-ui, -apple-system, sans-serif`;
		const sepWidth = measureCtx.measureText("+").width;

		let totalInnerWidth = 0;
		keycapMeasurements.forEach((k, idx) => {
			if (idx > 0) {
				totalInnerWidth += dims.gap + sepWidth + dims.gap;
			}
			totalInnerWidth += k.width;
		});

		const keycapHeight = dims.keycapFontSize + dims.keycapPadY * 2;
		const boxWidth = totalInnerWidth + dims.containerPadX * 2;
		const boxHeight = keycapHeight + dims.containerPadY * 2;

		return {
			event,
			keysToRender,
			keycapMeasurements,
			sepWidth,
			keycapHeight,
			boxWidth,
			boxHeight,
		};
	});

	const totalStackWidth = pills.reduce((max, p) => Math.max(max, p.boxWidth), 0);
	const totalPillHeight = pills.reduce((sum, p) => sum + p.boxHeight, 0);
	const totalGaps = Math.max(0, pills.length - 1) * dims.stackGap;
	const totalStackHeight = totalPillHeight + totalGaps;

	let centerX = width / 2;
	let centerY = height - dims.margin - totalStackHeight / 2;

	const pos: KeystrokePosition = settings.position || "bottom-center";
	if (pos === "bottom-left") {
		centerX = dims.margin + totalStackWidth / 2;
		centerY = height - dims.margin - totalStackHeight / 2;
	} else if (pos === "bottom-right") {
		centerX = width - dims.margin - totalStackWidth / 2;
		centerY = height - dims.margin - totalStackHeight / 2;
	} else if (pos === "top-center") {
		centerX = width / 2;
		centerY = dims.margin + totalStackHeight / 2;
	} else if (pos === "top-left") {
		centerX = dims.margin + totalStackWidth / 2;
		centerY = dims.margin + totalStackHeight / 2;
	} else if (pos === "top-right") {
		centerX = width - dims.margin - totalStackWidth / 2;
		centerY = dims.margin + totalStackHeight / 2;
	} else if (pos === "center-left") {
		centerX = dims.margin + totalStackWidth / 2;
		centerY = height / 2;
	} else if (pos === "center") {
		centerX = width / 2;
		centerY = height / 2;
	} else if (pos === "center-right") {
		centerX = width - dims.margin - totalStackWidth / 2;
		centerY = height / 2;
	}

	const key = `${activeEntries.map((e) => `${e.event.id}_${Math.round(e.opacity * 20)}`).join("-")}:${size}:${settings.style}:${pos}`;

	return {
		resScale,
		dims,
		pills,
		totalStackWidth,
		totalStackHeight,
		centerX,
		centerY,
		key,
	};
}

/** Legacy single-pill layout helper for backwards compatibility */
export function buildKeystrokeLayout(
	measureCtx: CanvasRenderingContext2D,
	event: KeystrokeEvent,
	settings: KeystrokeVisualSettings,
	width: number,
	height: number,
) {
	const multi = buildMultiKeystrokeLayout(
		measureCtx,
		[{ event, opacity: 1, scale: 1, layerIndex: 0 }],
		settings,
		width,
		height,
	);
	const pill = multi.pills[0];
	return {
		resScale: multi.resScale,
		dims: multi.dims,
		keysToRender: pill.keysToRender,
		keycapMeasurements: pill.keycapMeasurements,
		sepWidth: pill.sepWidth,
		keycapHeight: pill.keycapHeight,
		boxWidth: pill.boxWidth,
		boxHeight: pill.boxHeight,
		centerX: multi.centerX,
		centerY: multi.centerY,
		key: multi.key,
	};
}

/** Standalone canvas rendering for frameRenderer.ts and export compositing */
export function renderKeystrokes(
	ctx: CanvasRenderingContext2D,
	keystrokes: KeystrokeEvent[] | undefined,
	settings: KeystrokeVisualSettings | undefined,
	width: number,
	height: number,
	timeMs: number,
): void {
	const activeList = getActiveKeystrokeEvents(keystrokes, settings, timeMs);
	if (activeList.length === 0 || !settings) return;

	const layout = buildMultiKeystrokeLayout(ctx, activeList, settings, width, height);
	const theme = getKeystrokeTheme(settings.style);
	const { dims, resScale, pills, totalStackWidth, totalStackHeight } = layout;

	ctx.save();
	ctx.translate(layout.centerX, layout.centerY);

	const pos = settings.position || "bottom-center";
	const isLeftAligned = pos.includes("left");
	const isRightAligned = pos.includes("right");

	let curY = -totalStackHeight / 2;

	pills.forEach((pill, idx) => {
		const activeEntry = activeList[idx];
		const pillOpacity = activeEntry?.opacity ?? 1;
		const pillScale = activeEntry?.scale ?? 1;

		let pillX = 0;
		if (isLeftAligned) {
			pillX = -totalStackWidth / 2 + pill.boxWidth / 2;
		} else if (isRightAligned) {
			pillX = totalStackWidth / 2 - pill.boxWidth / 2;
		}

		ctx.save();
		ctx.translate(pillX, curY + pill.boxHeight / 2);
		ctx.scale(pillScale, pillScale);
		ctx.globalAlpha = pillOpacity;

		// Shadow
		ctx.shadowColor = theme.containerShadow;
		ctx.shadowBlur = 16 * resScale;
		ctx.shadowOffsetY = 6 * resScale;

		// Container background
		ctx.fillStyle = theme.containerBg;
		drawSquircleOnCanvas(ctx, {
			x: -pill.boxWidth / 2,
			y: -pill.boxHeight / 2,
			width: pill.boxWidth,
			height: pill.boxHeight,
			radius: dims.containerRadius,
		});
		ctx.fill();

		ctx.shadowColor = "transparent";
		ctx.shadowBlur = 0;
		ctx.shadowOffsetY = 0;

		// Container border
		ctx.lineWidth = Math.max(1, 1.5 * resScale);
		ctx.strokeStyle = theme.containerBorder;
		drawSquircleOnCanvas(ctx, {
			x: -pill.boxWidth / 2,
			y: -pill.boxHeight / 2,
			width: pill.boxWidth,
			height: pill.boxHeight,
			radius: dims.containerRadius,
		});
		ctx.stroke();

		// Draw keycaps and separators
		let curKeyX = -pill.boxWidth / 2 + dims.containerPadX;
		const keycapY = -pill.keycapHeight / 2;

		pill.keycapMeasurements.forEach((k, kIdx) => {
			if (kIdx > 0) {
				const sepX = curKeyX + dims.gap;
				ctx.font = `700 ${dims.sepFontSize}px system-ui, -apple-system, sans-serif`;
				ctx.fillStyle = theme.sepColor;
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";
				ctx.fillText("+", sepX + pill.sepWidth / 2, 0);
				curKeyX += dims.gap + pill.sepWidth + dims.gap;
			}

			// Keycap background
			ctx.fillStyle = theme.keycapBg;
			drawSquircleOnCanvas(ctx, {
				x: curKeyX,
				y: keycapY,
				width: k.width,
				height: pill.keycapHeight,
				radius: dims.keycapRadius,
			});
			ctx.fill();

			// Keycap border
			ctx.lineWidth = Math.max(1, 1 * resScale);
			ctx.strokeStyle = theme.keycapBorder;
			drawSquircleOnCanvas(ctx, {
				x: curKeyX,
				y: keycapY,
				width: k.width,
				height: pill.keycapHeight,
				radius: dims.keycapRadius,
			});
			ctx.stroke();

			// Keycap text
			ctx.font = `600 ${dims.keycapFontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
			ctx.fillStyle = theme.textColor;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText(k.key, curKeyX + k.width / 2, 0);

			curKeyX += k.width;
		});

		ctx.restore();

		curY += pill.boxHeight + dims.stackGap;
	});

	ctx.restore();
}
