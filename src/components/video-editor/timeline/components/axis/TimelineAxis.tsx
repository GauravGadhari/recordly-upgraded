import { useTimelineContext } from "dnd-timeline";
import { useMemo, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { calculateAxisScale, formatTimeLabel } from "../../core/time";
import { TIMELINE_SIDEBAR_WIDTH_PX } from "../../timelineLayout";

interface TimelineAxisProps {
	videoDurationMs: number;
	currentTimeMs: number;
}

export default function TimelineAxis({ videoDurationMs, currentTimeMs }: TimelineAxisProps) {
	const { sidebarWidth, direction, range, valueToPixels } = useTimelineContext();
	const effectiveSidebarWidth = sidebarWidth > 0 ? sidebarWidth : TIMELINE_SIDEBAR_WIDTH_PX;
	const sideProperty = direction === "rtl" ? "right" : "left";

	const { intervalMs } = useMemo(
		() => calculateAxisScale(range.end - range.start),
		[range.end, range.start],
	);

	const markers = useMemo(() => {
		if (intervalMs <= 0) {
			return { markers: [], minorTicks: [] as number[] };
		}

		const maxTime = videoDurationMs > 0 ? videoDurationMs : range.end;
		const visibleStart = Math.max(0, Math.min(range.start, maxTime));
		const visibleEnd = Math.min(range.end, maxTime);
		const markerTimes = new Set<number>();
		const firstMarker = Math.ceil(visibleStart / intervalMs) * intervalMs;

		for (let time = firstMarker; time <= visibleEnd; time += intervalMs) {
			markerTimes.add(Math.round(time));
		}

		if (visibleStart <= maxTime) markerTimes.add(Math.round(visibleStart));
		if (videoDurationMs > 0) markerTimes.add(Math.round(videoDurationMs));

		const sorted = Array.from(markerTimes)
			.filter((time) => time <= maxTime)
			.sort((a, b) => a - b);

		const minorTicks: number[] = [];
		const minorInterval = intervalMs / 5;
		for (let time = firstMarker; time <= visibleEnd; time += minorInterval) {
			const isMajor = Math.abs(time % intervalMs) < 1;
			if (!isMajor) minorTicks.push(time);
		}

		return {
			markers: sorted.map((time) => ({ time, label: formatTimeLabel(time, intervalMs) })),
			minorTicks,
		};
	}, [intervalMs, range.end, range.start, videoDurationMs]);

	return (
		<div
			className="h-8 bg-editor-bg border-b border-foreground/10 relative overflow-hidden select-none"
			style={{
				[sideProperty === "right" ? "marginRight" : "marginLeft"]: `${effectiveSidebarWidth}px`,
			}}
		>
			{markers.minorTicks.map((time) => {
				const offset = valueToPixels(time - range.start);
				return (
					<div
						key={`minor-${time}`}
						className="absolute bottom-1 h-1 w-[1px] bg-foreground/5"
						style={{ [sideProperty]: `${offset}px` }}
					/>
				);
			})}

			{markers.markers.map((marker) => {
				const offset = valueToPixels(marker.time - range.start);
				const isNearLeft = offset < 24;
				const markerStyle: CSSProperties = {
					position: "absolute",
					bottom: 0,
					height: "100%",
					display: "flex",
					flexDirection: "row",
					alignItems: "flex-end",
					[sideProperty]: `${offset}px`,
					transform: direction === "rtl"
						? (isNearLeft ? "translateX(0)" : "translateX(50%)")
						: (isNearLeft ? "translateX(0)" : "translateX(-50%)"),
				};

				return (
					<div key={marker.time} style={markerStyle}>
						<div className={cn("flex flex-col pb-1", isNearLeft ? "items-start pl-0.5" : "items-center")}>
							<div className="mb-1.5 h-[5px] w-[5px] rounded-full bg-foreground/30" />
							<span
								className={cn(
									"text-[10px] font-medium tabular-nums tracking-tight font-mono",
									Math.abs(marker.time - currentTimeMs) < 1
										? "text-[#2563EB] font-semibold"
										: "text-foreground/40",
								)}
							>
								{marker.label}
							</span>
						</div>
					</div>
				);
			})}
		</div>
	);
}
