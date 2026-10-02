import {
	ArrowsInSimple,
	MagnifyingGlassMinus,
	MagnifyingGlassPlus,
} from "@phosphor-icons/react";
import { type MouseEvent, useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface TimelineScrollbarProps {
	totalMs: number;
	visibleRange: { start: number; end: number };
	currentTimeMs: number;
	minVisibleRangeMs?: number;
	onRangeChange: (
		updater: (prev: { start: number; end: number }) => { start: number; end: number },
	) => void;
	onSeek?: (timeSec: number) => void;
}

type DragMode = "pan" | "resize-left" | "resize-right";

export default function TimelineScrollbar({
	totalMs,
	visibleRange,
	currentTimeMs,
	minVisibleRangeMs = 500,
	onRangeChange,
	onSeek: _onSeek,
}: TimelineScrollbarProps) {
	const trackRef = useRef<HTMLDivElement | null>(null);
	const dragRef = useRef<{
		mode: DragMode;
		pointerId: number;
		startX: number;
		originStart: number;
		originEnd: number;
	} | null>(null);
	const [isDragging, setIsDragging] = useState(false);

	const visibleSpan = Math.max(1, visibleRange.end - visibleRange.start);
	const safeTotalMs = Math.max(1, totalMs);

	// Calculate thumb geometry as percentage (0..100)
	const leftPercent = Math.max(0, Math.min(100, (visibleRange.start / safeTotalMs) * 100));
	const widthPercent = Math.max(1, Math.min(100 - leftPercent, (visibleSpan / safeTotalMs) * 100));

	// Calculate playhead position as percentage (0..100)
	const playheadPercent = Math.max(0, Math.min(100, (currentTimeMs / safeTotalMs) * 100));

	const handlePointerDown = useCallback(
		(mode: DragMode) => (event: React.PointerEvent<HTMLDivElement>) => {
			event.stopPropagation();
			event.preventDefault();
			dragRef.current = {
				mode,
				pointerId: event.pointerId,
				startX: event.clientX,
				originStart: visibleRange.start,
				originEnd: visibleRange.end,
			};
			event.currentTarget.setPointerCapture(event.pointerId);
			setIsDragging(true);
		},
		[visibleRange.end, visibleRange.start],
	);

	const handlePointerMove = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			const drag = dragRef.current;
			if (!drag || drag.pointerId !== event.pointerId || !trackRef.current) return;
			const rect = trackRef.current.getBoundingClientRect();
			if (rect.width <= 0) return;

			const deltaPixels = event.clientX - drag.startX;
			const deltaMs = (deltaPixels / rect.width) * safeTotalMs;

			if (drag.mode === "pan") {
				const currentSpan = drag.originEnd - drag.originStart;
				const maxStart = Math.max(0, safeTotalMs - currentSpan);
				const nextStart = Math.max(0, Math.min(drag.originStart + deltaMs, maxStart));
				onRangeChange(() => ({
					start: Math.round(nextStart),
					end: Math.round(nextStart + currentSpan),
				}));
			} else if (drag.mode === "resize-left") {
				const maxStart = drag.originEnd - minVisibleRangeMs;
				const nextStart = Math.max(0, Math.min(drag.originStart + deltaMs, maxStart));
				onRangeChange(() => ({
					start: Math.round(nextStart),
					end: Math.round(drag.originEnd),
				}));
			} else if (drag.mode === "resize-right") {
				const minEnd = drag.originStart + minVisibleRangeMs;
				const nextEnd = Math.min(safeTotalMs, Math.max(drag.originEnd + deltaMs, minEnd));
				onRangeChange(() => ({
					start: Math.round(drag.originStart),
					end: Math.round(nextEnd),
				}));
			}
		},
		[minVisibleRangeMs, onRangeChange, safeTotalMs],
	);

	const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
		if (dragRef.current?.pointerId === event.pointerId) {
			dragRef.current = null;
			setIsDragging(false);
		}
	}, []);

	// Click on empty track jumps / centers the visible range
	const handleTrackClick = useCallback(
		(event: MouseEvent<HTMLDivElement>) => {
			if (!trackRef.current) return;
			const rect = trackRef.current.getBoundingClientRect();
			if (rect.width <= 0) return;

			const clickRatio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
			const clickMs = clickRatio * safeTotalMs;

			onRangeChange((prev) => {
				const currentSpan = prev.end - prev.start;
				const halfSpan = currentSpan / 2;
				const nextStart = Math.max(0, Math.min(clickMs - halfSpan, safeTotalMs - currentSpan));
				return {
					start: Math.round(nextStart),
					end: Math.round(nextStart + currentSpan),
				};
			});
		},
		[onRangeChange, safeTotalMs],
	);

	// Wheel on scrollbar pans horizontally
	const handleWheel = useCallback(
		(event: React.WheelEvent<HTMLDivElement>) => {
			event.preventDefault();
			event.stopPropagation();
			const delta = event.deltaX !== 0 ? event.deltaX : event.deltaY;
			if (delta === 0) return;
			const deltaMs = (delta / 400) * visibleSpan;

			onRangeChange((prev) => {
				const currentSpan = prev.end - prev.start;
				const maxStart = Math.max(0, safeTotalMs - currentSpan);
				const nextStart = Math.max(0, Math.min(prev.start + deltaMs, maxStart));
				return {
					start: Math.round(nextStart),
					end: Math.round(nextStart + currentSpan),
				};
			});
		},
		[onRangeChange, safeTotalMs, visibleSpan],
	);

	// Zoom buttons
	const handleZoomIn = useCallback(() => {
		onRangeChange((prev) => {
			const currentSpan = prev.end - prev.start;
			const newSpan = Math.max(minVisibleRangeMs, currentSpan * 0.75);
			const diff = currentSpan - newSpan;
			const nextStart = Math.max(0, prev.start + diff / 2);
			return {
				start: Math.round(nextStart),
				end: Math.round(nextStart + newSpan),
			};
		});
	}, [minVisibleRangeMs, onRangeChange]);

	const handleZoomOut = useCallback(() => {
		onRangeChange((prev) => {
			const currentSpan = prev.end - prev.start;
			const newSpan = Math.min(safeTotalMs, currentSpan * 1.33);
			const diff = newSpan - currentSpan;
			const nextStart = Math.max(0, Math.min(prev.start - diff / 2, safeTotalMs - newSpan));
			return {
				start: Math.round(nextStart),
				end: Math.round(nextStart + newSpan),
			};
		});
	}, [onRangeChange, safeTotalMs]);

	const handleZoomToFit = useCallback(() => {
		onRangeChange(() => ({
			start: 0,
			end: safeTotalMs,
		}));
	}, [onRangeChange, safeTotalMs]);

	if (totalMs <= 0) return null;

	return (
		<div
			className="h-7 w-full bg-[#0f0f14] border-t border-white/[0.08] flex items-center px-3 gap-2.5 select-none z-30"
			onWheel={handleWheel}
		>
			{/* Overview Track */}
			<div
				ref={trackRef}
				className="relative flex-1 h-2.5 bg-white/[0.04] hover:bg-white/[0.06] rounded-full border border-white/[0.06] cursor-pointer transition-colors group"
				onClick={handleTrackClick}
			>
				{/* Mini Playhead Pip */}
				<div
					className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1.5 h-3.5 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.9)] pointer-events-none z-20 transition-[left] duration-75"
					style={{ left: `${playheadPercent}%` }}
					title={`Playhead: ${(currentTimeMs / 1000).toFixed(1)}s`}
				/>

				{/* Draggable Thumb (Visible Window) */}
				<div
					className={cn(
						"absolute top-0 bottom-0 rounded-full border border-white/25 shadow-sm backdrop-blur-sm transition-colors flex items-center justify-between",
						isDragging
							? "bg-white/[0.28] cursor-grabbing"
							: "bg-white/[0.14] hover:bg-white/[0.22] cursor-grab",
					)}
					style={{
						left: `${leftPercent}%`,
						width: `${widthPercent}%`,
						minWidth: 28,
					}}
					onPointerDown={handlePointerDown("pan")}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
					onPointerCancel={handlePointerUp}
					onClick={(e) => e.stopPropagation()}
					title="Drag to pan timeline"
				>
					{/* Left Zoom Handle */}
					<div
						className="h-full w-2.5 cursor-ew-resize flex items-center justify-center rounded-l-full hover:bg-white/35 active:bg-white/50 transition-colors"
						onPointerDown={handlePointerDown("resize-left")}
						onPointerMove={handlePointerMove}
						onPointerUp={handlePointerUp}
						onPointerCancel={handlePointerUp}
						title="Drag to zoom start"
					>
						<div className="w-0.5 h-2 rounded-full bg-white/70 pointer-events-none" />
					</div>

					{/* Center Grip Dots */}
					<div className="flex items-center gap-0.5 opacity-40 group-hover:opacity-70 pointer-events-none">
						<div className="w-0.5 h-1.5 rounded-full bg-white" />
						<div className="w-0.5 h-1.5 rounded-full bg-white" />
					</div>

					{/* Right Zoom Handle */}
					<div
						className="h-full w-2.5 cursor-ew-resize flex items-center justify-center rounded-r-full hover:bg-white/35 active:bg-white/50 transition-colors"
						onPointerDown={handlePointerDown("resize-right")}
						onPointerMove={handlePointerMove}
						onPointerUp={handlePointerUp}
						onPointerCancel={handlePointerUp}
						title="Drag to zoom end"
					>
						<div className="w-0.5 h-2 rounded-full bg-white/70 pointer-events-none" />
					</div>
				</div>
			</div>

			{/* Quick Zoom Actions */}
			<div className="flex items-center gap-1 shrink-0 text-white/60">
				<button
					type="button"
					onClick={handleZoomOut}
					className="h-5 w-5 flex items-center justify-center rounded hover:bg-white/10 hover:text-white transition-colors"
					title="Zoom out"
					aria-label="Zoom out"
				>
					<MagnifyingGlassMinus className="w-3.5 h-3.5" />
				</button>
				<button
					type="button"
					onClick={handleZoomIn}
					className="h-5 w-5 flex items-center justify-center rounded hover:bg-white/10 hover:text-white transition-colors"
					title="Zoom in"
					aria-label="Zoom in"
				>
					<MagnifyingGlassPlus className="w-3.5 h-3.5" />
				</button>
				<button
					type="button"
					onClick={handleZoomToFit}
					className="h-5 w-5 flex items-center justify-center rounded hover:bg-white/10 hover:text-white transition-colors"
					title="Fit entire timeline"
					aria-label="Fit entire timeline"
				>
					<ArrowsInSimple className="w-3.5 h-3.5" />
				</button>
			</div>
		</div>
	);
}
