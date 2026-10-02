import React, { useMemo } from "react";
import type { KeystrokeEvent, KeystrokeVisualSettings } from "../types";

interface KeystrokeOverlayProps {
	currentTimeMs: number;
	keystrokes?: KeystrokeEvent[];
	settings?: KeystrokeVisualSettings;
}

const POSITION_CLASSES: Record<KeystrokeVisualSettings["position"], string> = {
	"top-left": "top-6 left-6",
	"top-center": "top-6 left-1/2",
	"top-right": "top-6 right-6",
	"center-left": "top-1/2 left-6",
	center: "top-1/2 left-1/2",
	"center-right": "top-1/2 right-6",
	"bottom-left": "bottom-6 left-6",
	"bottom-center": "bottom-6 left-1/2",
	"bottom-right": "bottom-6 right-6",
};

const SIZE_CLASSES: Record<
	KeystrokeVisualSettings["size"],
	{ container: string; keycap: string; separator: string; gap: string }
> = {
	small: {
		container: "px-2.5 py-1 rounded-lg text-xs",
		keycap: "px-1.5 py-0.5 rounded text-xs min-w-[22px]",
		separator: "text-[11px]",
		gap: "gap-1",
	},
	medium: {
		container: "px-3.5 py-1.5 rounded-xl text-sm",
		keycap: "px-2.5 py-1 rounded-md text-sm min-w-[28px]",
		separator: "text-xs font-semibold",
		gap: "gap-1.5",
	},
	large: {
		container: "px-4.5 py-2 rounded-2xl text-base",
		keycap: "px-3.5 py-1.5 rounded-lg text-base min-w-[34px]",
		separator: "text-sm font-bold",
		gap: "gap-2",
	},
};

const THEME_CLASSES: Record<
	KeystrokeVisualSettings["style"],
	{ container: string; keycap: string; separator: string }
> = {
	dark: {
		container:
			"bg-neutral-900/90 text-neutral-100 border border-neutral-700/60 shadow-[0_8px_30px_rgba(0,0,0,0.6)] backdrop-blur-md",
		keycap:
			"bg-neutral-800/90 border border-neutral-600/80 shadow-[0_2px_4px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.15)] text-white font-medium tracking-tight",
		separator: "text-neutral-400 font-bold",
	},
	light: {
		container:
			"bg-white/95 text-neutral-900 border border-neutral-300/80 shadow-[0_8px_30px_rgba(0,0,0,0.15)] backdrop-blur-md",
		keycap:
			"bg-neutral-100 border border-neutral-300 shadow-[0_2px_4px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] text-neutral-900 font-medium tracking-tight",
		separator: "text-neutral-500 font-bold",
	},
	glass: {
		container:
			"bg-black/35 text-white border border-white/20 shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur-xl",
		keycap:
			"bg-white/15 border border-white/25 shadow-[0_2px_4px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.25)] text-white font-medium tracking-tight",
		separator: "text-white/60 font-bold",
	},
	accent: {
		container:
			"bg-blue-950/85 text-white border border-blue-500/50 shadow-[0_0_24px_rgba(37,99,235,0.35),0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-md",
		keycap:
			"bg-blue-600/30 border border-blue-400/60 shadow-[0_2px_4px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.2)] text-blue-100 font-medium tracking-tight",
		separator: "text-blue-400 font-bold",
	},
};

export const KeystrokeOverlay: React.FC<KeystrokeOverlayProps> = ({
	currentTimeMs,
	keystrokes = [],
	settings,
}) => {
	const maxLayers = settings?.maxLayers ?? 2;
	const lingerMs = settings?.lingerDurationMs || 1500;

	// Find active keystrokes up to maxLayers (default 2 layers)
	const activeEvents = useMemo(() => {
		if (!settings?.enabled || keystrokes.length === 0) {
			return [];
		}

		const matches: KeystrokeEvent[] = [];
		for (let i = keystrokes.length - 1; i >= 0; i--) {
			const evt = keystrokes[i];
			if (evt.enabled === false) continue;
			if (settings.showShortcutsOnly && !evt.isShortcut) continue;

			const start = evt.timeMs;
			const end = evt.timeMs + (settings.lingerDurationMs || evt.durationMs || lingerMs);
			if (currentTimeMs >= start && currentTimeMs <= end) {
				matches.push(evt);
				if (matches.length >= maxLayers) {
					break;
				}
			}
		}

		// Reverse so older is on top and newest is on bottom
		matches.reverse();
		return matches;
	}, [keystrokes, currentTimeMs, settings, maxLayers, lingerMs]);

	if (!settings?.enabled || activeEvents.length === 0) {
		return null;
	}

	const isHorizontalCenter =
		settings.position === "bottom-center" ||
		settings.position === "top-center" ||
		settings.position === "center";
	const isVerticalCenter =
		settings.position === "center" ||
		settings.position === "center-left" ||
		settings.position === "center-right";

	const alignClass = settings.position.includes("left")
		? "items-start"
		: settings.position.includes("right")
			? "items-end"
			: "items-center";

	const posClass = POSITION_CLASSES[settings.position] || POSITION_CLASSES["bottom-center"];
	const sizeConfig = SIZE_CLASSES[settings.size] || SIZE_CLASSES.medium;
	const themeConfig = THEME_CLASSES[settings.style] || THEME_CLASSES.dark;

	const transformX = isHorizontalCenter ? "translateX(-50%) " : "";
	const transformY = isVerticalCenter ? "translateY(-50%) " : "";

	return (
		<div
			className={`pointer-events-none absolute z-40 flex flex-col gap-2 transition-all duration-75 select-none ${posClass} ${alignClass}`}
			style={{
				transform: `${transformX}${transformY}`,
				transformOrigin: "center center",
			}}
		>
			{activeEvents.map((evt, idx) => {
				const elapsed = currentTimeMs - evt.timeMs;
				const duration = settings.lingerDurationMs || evt.durationMs || lingerMs;
				const fadeIn = Math.min(1, elapsed / 120);
				const remaining = duration - elapsed;
				const fadeOut = Math.min(1, remaining / 220);
				let opacity = Math.max(0, Math.min(fadeIn, fadeOut));

				if (activeEvents.length > 1 && idx === 0) {
					opacity *= 0.85;
				}

				const keysToRender =
					Array.isArray(evt.keys) && evt.keys.length > 0
						? evt.keys
						: [evt.displayText || "Key"];

				return (
					<div
						key={evt.id}
						className="flex items-center transition-all duration-75"
						style={{
							opacity,
							transform: `scale(${0.96 + opacity * 0.04})`,
						}}
					>
						<div
							className={`flex items-center ${sizeConfig.gap} ${sizeConfig.container} ${themeConfig.container}`}
						>
							{keysToRender.map((key, keyIdx) => (
								<React.Fragment key={`${evt.id}_key_${keyIdx}`}>
									{keyIdx > 0 && (
										<span className={`${sizeConfig.separator} ${themeConfig.separator}`}>+</span>
									)}
									<span
										className={`inline-flex items-center justify-center text-center font-mono ${sizeConfig.keycap} ${themeConfig.keycap}`}
									>
										{key}
									</span>
								</React.Fragment>
							))}
						</div>
					</div>
				);
			})}
		</div>
	);
};

export default KeystrokeOverlay;
