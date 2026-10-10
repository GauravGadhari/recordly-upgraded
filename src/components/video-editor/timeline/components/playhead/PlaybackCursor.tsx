import { useTimelineContext } from "dnd-timeline";
import { useEffect, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { formatSMPTETimecode } from "../../core/time";
import { TIMELINE_SIDEBAR_WIDTH_PX } from "../../timelineLayout";

interface PlaybackCursorProps {
	currentTimeMs: number;
	videoDurationMs: number;
	onSeek?: (time: number) => void;
	timelineRef: RefObject<HTMLDivElement>;
	keyframes?: { id: string; time: number }[];
	isLoading?: boolean;
}

export default function PlaybackCursor({
	currentTimeMs,
	videoDurationMs,
	onSeek,
	timelineRef,
	keyframes = [],
	isLoading = false,
}: PlaybackCursorProps) {
	const { sidebarWidth, direction, range, valueToPixels, pixelsToValue } = useTimelineContext();
	const effectiveSidebarWidth = sidebarWidth > 0 ? sidebarWidth : TIMELINE_SIDEBAR_WIDTH_PX;
	const sideProperty = direction === "rtl" ? "right" : "left";
	const [isDragging, setIsDragging] = useState(false);

	useEffect(() => {
		if (!isDragging) return;

		const handleMouseMove = (e: MouseEvent) => {
			if (!timelineRef.current || !onSeek) return;
			const rect = timelineRef.current.getBoundingClientRect();
			const clickX = e.clientX - rect.left - effectiveSidebarWidth;
			const relativeMs = pixelsToValue(clickX);
			let absoluteMs = Math.max(0, Math.min(range.start + relativeMs, videoDurationMs));

			const snapThresholdMs = 150;
			const nearbyKeyframe = keyframes.find(
				(kf) =>
					Math.abs(kf.time - absoluteMs) <= snapThresholdMs &&
					kf.time >= range.start &&
					kf.time <= range.end,
			);
			if (nearbyKeyframe) absoluteMs = nearbyKeyframe.time;

			onSeek(absoluteMs / 1000);
		};

		const handleMouseUp = () => {
			setIsDragging(false);
			document.body.style.cursor = "";
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
		document.body.style.cursor = "ew-resize";

		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
			document.body.style.cursor = "";
		};
	}, [
		isDragging,
		onSeek,
		timelineRef,
		effectiveSidebarWidth,
		range.start,
		range.end,
		videoDurationMs,
		pixelsToValue,
		keyframes,
	]);

	if (videoDurationMs <= 0 || currentTimeMs < 0) return null;
	const clampedTime = Math.min(currentTimeMs, videoDurationMs);
	if (clampedTime < range.start || clampedTime > range.end) return null;

	const offset = valueToPixels(clampedTime - range.start);

	return (
		<div
			className="absolute top-0 bottom-0 z-50 group/cursor"
			style={{
				[sideProperty === "right" ? "marginRight" : "marginLeft"]: `${effectiveSidebarWidth}px`,
				pointerEvents: "none",
			}}
		>
			<div
				className="absolute top-0 bottom-0 w-[2px] -translate-x-1/2 bg-[#2563EB] shadow-[0_0_10px_rgba(37,99,235,0.5)] cursor-ew-resize pointer-events-auto hover:shadow-[0_0_15px_rgba(37,99,235,0.7)] transition-shadow"
				style={{ [sideProperty]: `${offset}px` }}
				onMouseDown={(e) => {
					e.stopPropagation();
					setIsDragging(true);
				}}
			>
				<div
					className="absolute -top-1 left-1/2 -translate-x-1/2 hover:scale-125 transition-transform"
					style={{ width: "16px", height: "16px" }}
				>
					<div className="w-3 h-3 mx-auto mt-[2px] bg-[#2563EB] rotate-45 rounded-sm shadow-lg border border-foreground/20" />
				</div>
				<div
					className={cn(
						"absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-black/95 text-[10px] font-mono text-white/95 font-semibold tabular-nums tracking-wider whitespace-nowrap border border-[#2563EB]/40 shadow-xl pointer-events-none transition-all duration-150",
						isDragging || isLoading
							? "opacity-100 scale-100"
							: "opacity-0 group-hover/cursor:opacity-100 scale-95 group-hover/cursor:scale-100",
					)}
				>
					<div className="flex items-center">
						{formatSMPTETimecode(clampedTime)
							.split("")
							.map((char, i) => (
								<span
									key={i}
									className={cn(
										"leading-5 whitespace-pre",
										isLoading &&
											"bg-gradient-to-r from-white/40 via-white to-white/40 bg-clip-text text-transparent animate-text-shimmer",
									)}
									style={
										isLoading
											? {
													animationDelay: `${i * 0.05}s`,
													animationDuration: "2.5s",
												}
											: undefined
									}
								>
									{char}
								</span>
							))}
					</div>
				</div>
			</div>
		</div>
	);
}
