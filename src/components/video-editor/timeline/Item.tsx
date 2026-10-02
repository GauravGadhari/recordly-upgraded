import {
	ArrowsLeftRight as TransitionIcon,
	FilmSlate as Film,
	Gauge,
	ChatCircle as MessageSquare,
	MusicNotes as Music,
	Keyboard,
	MouseLeftClickIcon as PhMouseLeftClick,
	Scissors,
	Smiley as MemeIcon,
	SpeakerX,
	MagnifyingGlassPlus as ZoomIn,
	MagnifyingGlassMinus as ZoomOut,
} from "@phosphor-icons/react";
import type { Span } from "dnd-timeline";
import { useItem } from "dnd-timeline";
import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatClipSpeedLabel } from "../clipSpeedChange";
import AudioWaveform from "./components/waveform/AudioWaveform";
import type { AudioPeaksData } from "./core/timelineTypes";
import glassStyles from "./ItemGlass.module.css";

interface ItemProps {
	id: string;
	span: Span;
	rowId: string;
	disabled?: boolean;
	children: React.ReactNode;
	isSelected?: boolean;
	onSelect?: () => void;
	onSelectId?: (id: string) => void;
	zoomDepth?: number;
	zoomMode?: "auto" | "manual";
	speedValue?: number;
	waveformPeaks?: AudioPeaksData | null;
	waveformSegmentSpan?: Span;
	waveformGain?: number;
	waveformNormalize?: boolean;
	muted?: boolean;
	variant?:
		| "zoom"
		| "zoom-out"
		| "trim"
		| "clip"
		| "annotation"
		| "speed"
		| "audio"
		| "caption"
		| "keystroke"
		| "transition"
		| "meme";
	isLoading?: boolean;
	loadingLabel?: string;
}

// Map zoom depth to multiplier labels
const ZOOM_LABELS: Record<number, string> = {
	1: "1.25×",
	2: "1.5×",
	3: "1.8×",
	4: "2.2×",
	5: "3.5×",
	6: "5×",
};

function formatMs(ms: number): string {
	const totalSeconds = ms / 1000;
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes > 0) {
		return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
	}
	return `${seconds.toFixed(1)}s`;
}

export default function Item({
	id,
	span,
	rowId,
	disabled = false,
	isSelected = false,
	onSelect,
	onSelectId,
	zoomDepth = 1,
	zoomMode = "auto",
	speedValue,
	waveformPeaks = null,
	waveformSegmentSpan,
	waveformGain = 1,
	waveformNormalize = false,
	muted = false,
	variant = "zoom",
	isLoading = false,
	loadingLabel,
	children,
}: ItemProps) {
	const { setNodeRef, attributes, listeners, itemStyle, itemContentStyle } = useItem({
		id,
		span,
		disabled: disabled || isLoading,
		data: { rowId },
	});

	const timeLabel = useMemo(
		() => `${formatMs(span.start)} – ${formatMs(span.end)}`,
		[span.start, span.end],
	);

	if (isLoading) {
		return (
			<div
				ref={setNodeRef}
				style={{
					...itemStyle,
					height: "100%",
					display: "flex",
					alignItems: "center",
				}}
				{...listeners}
				{...attributes}
				data-timeline-item="true"
				onMouseDownCapture={(event) => event.stopPropagation()}
				onClickCapture={(event) => event.stopPropagation()}
			>
				<Skeleton
					variant="clip"
					animation="shimmer-premium"
					label={loadingLabel || "Loading..."}
					className="w-full"
					style={{ height: "85%", minHeight: 22 }}
				/>
			</div>
		);
	}

	const isZoom = variant === "zoom";
	const isZoomOut = variant === "zoom-out";
	const isTrim = variant === "trim";
	const isClip = variant === "clip";
	const isSpeed = variant === "speed";
	const isAudio = variant === "audio";
	const isCaption = variant === "caption";
	const isKeystroke = variant === "keystroke";
	const isTransition = variant === "transition";
	const isMeme = variant === "meme";
	const showAudioWaveform = isAudio && Boolean(waveformPeaks);
	const clipSpeedLabel = isClip ? formatClipSpeedLabel(speedValue ?? 1) : null;
	const canResize = !disabled && !isLoading && !isKeystroke;

	const glassClass = isZoom
		? glassStyles.glassPurple
		: isZoomOut
			? glassStyles.glassCyan
			: isTrim
			? glassStyles.glassRed
			: isClip
				? glassStyles.glassCyan
				: isSpeed
					? glassStyles.glassAmber
					: isAudio
						? glassStyles.glassDarkGreen
						: isCaption
							? glassStyles.glassCaption
							: isKeystroke
								? glassStyles.glassDarkGreen
								: isTransition
									? glassStyles.glassViolet
									: isMeme
										? glassStyles.glassEmerald
										: glassStyles.glassYellow;

	const MIN_ITEM_PX = 6;
	const handleSelect = () => {
		onSelect?.();
		onSelectId?.(id);
	};
	const safeItemStyle = {
		...itemStyle,
		minWidth: MIN_ITEM_PX,
		height: "100%",
		overflow: "hidden",
	};

	return (
		<div
			ref={setNodeRef}
			style={safeItemStyle}
			{...listeners}
			{...attributes}
			data-timeline-item="true"
			onPointerDownCapture={handleSelect}
			className="group h-full"
		>
			<div
				className="h-full"
				style={{
					...itemContentStyle,
					minWidth: MIN_ITEM_PX,
					height: "100%",
					display: "flex",
					alignItems: "center",
				}}
			>
				<div
					className={cn(
						glassClass,
						"w-full overflow-hidden flex items-center justify-center gap-1.5 cursor-grab active:cursor-grabbing relative",
						isSelected && glassStyles.selected,
					)}
					style={{
						height: "85%",
						minHeight: 22,
						minWidth: MIN_ITEM_PX,
					}}
					onClick={(event) => {
						event.stopPropagation();
					}}
				>
					{canResize && (
						<>
							<div
								className={cn(glassStyles.zoomEndCap, glassStyles.left)}
								style={{ cursor: "col-resize", pointerEvents: "auto" }}
								title="Trim start (drag to resize)"
								aria-label="Trim start"
							/>
							<div
								className={cn(glassStyles.zoomEndCap, glassStyles.right)}
								style={{ cursor: "col-resize", pointerEvents: "auto" }}
								title="Trim end (drag to resize)"
								aria-label="Trim end"
							/>
						</>
					)}
					{showAudioWaveform && waveformPeaks && (
						<AudioWaveform
							peaks={waveformPeaks}
							segmentStartMs={
								waveformSegmentSpan?.start ??
								(span.start > (waveformPeaks.durationMs ?? 0)
									? 0
									: span.start)
							}
							segmentEndMs={
								waveformSegmentSpan?.end ??
								(span.start > (waveformPeaks.durationMs ?? 0)
									? Math.max(0, span.end - span.start)
									: span.end)
							}
							gain={waveformGain}
							normalize={waveformNormalize}
							className="absolute inset-0 w-full h-full pointer-events-none opacity-60"
						/>
					)}
					{/* Muted overlay for source audio track items */}
					{isAudio && muted && (
						<div className="absolute inset-0 z-20 flex items-center justify-center gap-1 bg-red-900/40 pointer-events-none">
							<SpeakerX className="w-3 h-3 text-red-300/90 shrink-0" />
						</div>
					)}
					{/* Content */}
					<div className="relative z-10 flex flex-col items-center justify-center text-black/70 dark:text-white/90 opacity-80 group-hover:opacity-100 transition-opacity select-none overflow-hidden">
						<div className="flex items-center gap-1.5">
							{isZoom ? (
								<>
									<ZoomIn className="w-3.5 h-3.5 shrink-0" />
									<span className="text-[11px] font-semibold tracking-tight whitespace-nowrap">
										{ZOOM_LABELS[zoomDepth] || `${zoomDepth}×`}
									</span>
								</>
							) : isZoomOut ? (
								<>
									<ZoomOut className="w-3.5 h-3.5 shrink-0 text-cyan-200" />
									<span className="text-[11px] font-semibold tracking-tight whitespace-nowrap text-cyan-100">
										Fit Screen
									</span>
								</>
							) : isTrim ? (
								<>
									<Scissors className="w-3.5 h-3.5 shrink-0" />
									<span className="text-[11px] font-semibold tracking-tight whitespace-nowrap">
										Trim
									</span>
								</>
							) : isClip ? (
								<>
									<Film className="w-3.5 h-3.5 shrink-0" />
									<span className="text-[11px] font-semibold tracking-tight whitespace-nowrap">
										Clip
									</span>
									{clipSpeedLabel && (
										<span className="rounded-[4px] bg-black/10 px-1 text-[9px] font-bold tabular-nums text-black/65 dark:bg-white/15 dark:text-white/80">
											{clipSpeedLabel}
										</span>
									)}
								</>
							) : isSpeed ? (
								<>
									<Gauge className="w-3.5 h-3.5 shrink-0" />
									<span className="text-[11px] font-semibold tracking-tight whitespace-nowrap">
										{speedValue !== undefined ? `${speedValue}×` : "Speed"}
									</span>
								</>
							) : isAudio ? (
								<>
									{children === "Click" ? (
										<PhMouseLeftClick className="w-3.5 h-3.5 shrink-0" />
									) : (
										<Music className="w-3.5 h-3.5 shrink-0" />
									)}
									<span className="text-[11px] font-semibold tracking-tight truncate max-w-full">
										{children}
									</span>
								</>
							) : isKeystroke ? (
								<>
									<Keyboard className="w-3.5 h-3.5 shrink-0" />
									<span className="text-[11px] font-semibold tracking-tight whitespace-nowrap">
										{children}
									</span>
								</>
							) : isTransition ? (
								<>
									<TransitionIcon className="w-3.5 h-3.5 shrink-0" />
									<span className="text-[11px] font-semibold tracking-tight whitespace-nowrap">
										{children}
									</span>
								</>
							) : isMeme ? (
								<>
									<MemeIcon className="w-3.5 h-3.5 shrink-0" />
									<span className="text-[11px] font-semibold tracking-tight truncate max-w-full">
										{children}
									</span>
								</>
							) : (
								<>
									<MessageSquare className="w-3.5 h-3.5 shrink-0" />
									<span className="text-[11px] font-semibold tracking-tight whitespace-nowrap">
										{children}
									</span>
								</>
							)}
						</div>
						{isZoom ? (
							<div
								className={`flex items-center gap-0.5 transition-opacity ${isSelected ? "opacity-70" : "opacity-0 group-hover:opacity-50"}`}
							>
								<PhMouseLeftClick
									className="w-2.5 h-2.5 shrink-0"
									weight={zoomMode === "manual" ? "regular" : "fill"}
								/>
								<span className="text-[9px] font-medium tracking-tight whitespace-nowrap">
									{zoomMode === "manual" ? "Manual" : "Auto"}
								</span>
							</div>
						) : (
							<span
								className={cn(
									"text-[9px] tabular-nums tracking-tight whitespace-nowrap transition-opacity",
									isAudio && (span.end - span.start <= 350) && "hidden",
									isSelected ? "opacity-60" : "opacity-0 group-hover:opacity-40",
								)}
							>
								{timeLabel}
							</span>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
