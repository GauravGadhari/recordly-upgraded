import { useCallback, useEffect, useRef, useState } from "react";
import {
	applyChromaKeyToImageData,
	getMemeProgress,
} from "@/lib/exporter/mediaOverlayRenderer";
import type { MemeRegion } from "../types";
import { useResolvedMediaUrl } from "../mediaLibrary/useResolvedMediaUrl";

interface MemeOverlayProps {
	memeRegions: MemeRegion[];
	/** Playhead position on the composed timeline, in milliseconds. */
	currentTimeMs: number;
	isPlaying: boolean;
	selectedMemeId: string | null;
	onSelectMeme?: (id: string | null) => void;
	onPositionChange?: (id: string, position: { x: number; y: number }) => void;
	onSizeChange?: (id: string, size: { width: number; height: number }) => void;
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

export { getMemeProgress };

const MAX_CHROMA_CANVAS_WIDTH = 640;

function ChromaKeyMemeVideo({
	url,
	similarity,
	isPlaying,
	volume,
	localTimeSec,
}: {
	url: string;
	similarity: number;
	isPlaying: boolean;
	volume: number;
	localTimeSec: number;
}) {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const similarityRef = useRef(similarity);
	similarityRef.current = similarity;

	const handleLoadedMetadata = useCallback(() => {
		const video = videoRef.current;
		if (!video) return;
		const duration = Number.isFinite(video.duration) ? video.duration : 0;
		if (duration > 0) {
			video.currentTime = localTimeSec % duration;
		}
	}, [localTimeSec]);

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;
		video.volume = clamp(volume, 0, 1);
		video.muted = volume <= 0.001;
	}, [volume]);

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;
		const duration = Number.isFinite(video.duration) ? video.duration : 0;
		const target = duration > 0 ? localTimeSec % duration : localTimeSec;
		if (Math.abs(video.currentTime - target) > 0.05) video.currentTime = target;
	}, [localTimeSec]);

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;
		if (isPlaying) {
			void video.play().catch(() => {
				// Browsers can reject an autoplay attempt during a seek.
			});
		} else {
			video.pause();
		}
	}, [isPlaying]);

	useEffect(() => {
		void localTimeSec;
		let cancelled = false;
		let raf = 0;

		const draw = () => {
			if (cancelled) return;
			const video = videoRef.current;
			const canvas = canvasRef.current;
			if (video && canvas && video.readyState >= 2 && video.videoWidth > 0) {
				const scale = Math.min(1, MAX_CHROMA_CANVAS_WIDTH / video.videoWidth);
				const width = Math.max(2, Math.round(video.videoWidth * scale));
				const height = Math.max(2, Math.round(video.videoHeight * scale));
				if (canvas.width !== width) canvas.width = width;
				if (canvas.height !== height) canvas.height = height;
				const ctx = canvas.getContext("2d", { willReadFrequently: true });
				if (ctx) {
					ctx.drawImage(video, 0, 0, width, height);
					const frame = ctx.getImageData(0, 0, width, height);
					applyChromaKeyToImageData(frame.data, similarityRef.current);
					ctx.putImageData(frame, 0, 0);
				}
			}
			if (isPlaying) raf = requestAnimationFrame(draw);
		};

		draw();
		return () => {
			cancelled = true;
			cancelAnimationFrame(raf);
		};
	}, [isPlaying, localTimeSec]);

	return (
		<>
			{/* Kept on-screen but 1px/transparent so frames keep being presented
				(the same trick the main preview uses) while still producing audio. */}
			<video
				ref={videoRef}
				src={url}
				loop
				playsInline
				preload="auto"
				onLoadedMetadata={handleLoadedMetadata}
				className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
				aria-hidden="true"
			/>
			<canvas
				ref={canvasRef}
				className="pointer-events-none absolute inset-0 h-full w-full"
				style={{ objectFit: "contain" }}
			/>
		</>
	);
}

function MemeItem({
	region,
	currentTimeMs,
	isPlaying,
	isSelected,
	onSelect,
	onPositionChange,
	onSizeChange,
}: {
	region: MemeRegion;
	currentTimeMs: number;
	isPlaying: boolean;
	isSelected: boolean;
	onSelect?: (id: string | null) => void;
	onPositionChange?: (id: string, position: { x: number; y: number }) => void;
	onSizeChange?: (id: string, size: { width: number; height: number }) => void;
}) {
	const url = useResolvedMediaUrl(region.videoPath);
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const frameRef = useRef<HTMLDivElement | null>(null);
	type DragMode = "move" | "resize-br" | "resize-tl" | "resize-tr" | "resize-bl";

	const dragRef = useRef<{
		mode: DragMode;
		pointerId: number;
		startX: number;
		startY: number;
		origin: { x: number; y: number; width: number; height: number };
	} | null>(null);
	const [dragging, setDragging] = useState(false);
	const localTimeSec = Math.max(0, (currentTimeMs - region.startMs) / 1000);

	const handleLoadedMetadata = useCallback(() => {
		const video = videoRef.current;
		if (!video) return;
		const duration = Number.isFinite(video.duration) ? video.duration : 0;
		if (duration > 0) {
			video.currentTime = localTimeSec % duration;
		}
	}, [localTimeSec]);

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;
		video.volume = clamp(region.volume, 0, 1);
		video.muted = region.volume <= 0.001;
	}, [region.volume]);

	useEffect(() => {
		const video = videoRef.current;
		if (!video || !url) return;
		const duration = Number.isFinite(video.duration) ? video.duration : 0;
		const target = duration > 0 ? localTimeSec % duration : localTimeSec;
		if (Math.abs(video.currentTime - target) > 0.05) video.currentTime = target;
	}, [localTimeSec, url]);

	useEffect(() => {
		const video = videoRef.current;
		if (!video || !url) return;
		if (isPlaying) {
			void video.play().catch(() => {
				// Browsers can reject an autoplay attempt during a seek.
			});
		} else {
			video.pause();
		}
	}, [isPlaying, url]);

	const beginDrag = useCallback(
		(mode: DragMode) => (event: React.PointerEvent<HTMLDivElement>) => {
			event.stopPropagation();
			event.preventDefault();
			onSelect?.(region.id);
			dragRef.current = {
				mode,
				pointerId: event.pointerId,
				startX: event.clientX,
				startY: event.clientY,
				origin: {
					x: region.position.x,
					y: region.position.y,
					width: region.size.width,
					height: region.size.height,
				},
			};
			event.currentTarget.setPointerCapture(event.pointerId);
			setDragging(true);
		},
		[onSelect, region.id, region.position.x, region.position.y, region.size.height, region.size.width],
	);

	const handleDragMove = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			const drag = dragRef.current;
			const frame = frameRef.current?.parentElement;
			if (!drag || drag.pointerId !== event.pointerId || !frame) return;
			const rect = frame.getBoundingClientRect();
			if (rect.width <= 0 || rect.height <= 0) return;
			const dxPercent = ((event.clientX - drag.startX) / rect.width) * 100;
			const dyPercent = ((event.clientY - drag.startY) / rect.height) * 100;

			if (drag.mode === "move") {
				onPositionChange?.(region.id, {
					x: clamp(Math.round(drag.origin.x + dxPercent), 0, 100 - drag.origin.width),
					y: clamp(Math.round(drag.origin.y + dyPercent), 0, 100 - drag.origin.height),
				});
			} else if (drag.mode === "resize-br") {
				onSizeChange?.(region.id, {
					width: clamp(Math.round(drag.origin.width + dxPercent), 5, 100 - drag.origin.x),
					height: clamp(Math.round(drag.origin.height + dyPercent), 5, 100 - drag.origin.y),
				});
			} else if (drag.mode === "resize-bl") {
				const nextX = clamp(Math.round(drag.origin.x + dxPercent), 0, drag.origin.x + drag.origin.width - 5);
				const nextWidth = clamp(Math.round(drag.origin.width - dxPercent), 5, drag.origin.x + drag.origin.width);
				const nextHeight = clamp(Math.round(drag.origin.height + dyPercent), 5, 100 - drag.origin.y);
				onPositionChange?.(region.id, { x: nextX, y: region.position.y });
				onSizeChange?.(region.id, { width: nextWidth, height: nextHeight });
			} else if (drag.mode === "resize-tr") {
				const nextY = clamp(Math.round(drag.origin.y + dyPercent), 0, drag.origin.y + drag.origin.height - 5);
				const nextHeight = clamp(Math.round(drag.origin.height - dyPercent), 5, drag.origin.y + drag.origin.height);
				const nextWidth = clamp(Math.round(drag.origin.width + dxPercent), 5, 100 - drag.origin.x);
				onPositionChange?.(region.id, { x: region.position.x, y: nextY });
				onSizeChange?.(region.id, { width: nextWidth, height: nextHeight });
			} else if (drag.mode === "resize-tl") {
				const nextX = clamp(Math.round(drag.origin.x + dxPercent), 0, drag.origin.x + drag.origin.width - 5);
				const nextY = clamp(Math.round(drag.origin.y + dyPercent), 0, drag.origin.y + drag.origin.height - 5);
				const nextWidth = clamp(Math.round(drag.origin.width - dxPercent), 5, drag.origin.x + drag.origin.width);
				const nextHeight = clamp(Math.round(drag.origin.height - dyPercent), 5, drag.origin.y + drag.origin.height);
				onPositionChange?.(region.id, { x: nextX, y: nextY });
				onSizeChange?.(region.id, { width: nextWidth, height: nextHeight });
			}
		},
		[onPositionChange, onSizeChange, region.id, region.position.x, region.position.y],
	);

	const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
		if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
		dragRef.current = null;
		setDragging(false);
	}, []);

	const interactive = Boolean(onSelect || onPositionChange || onSizeChange);

	return (
		<div
			ref={frameRef}
			className="absolute overflow-hidden"
			style={{
				left: `${region.position.x}%`,
				top: `${region.position.y}%`,
				width: `${region.size.width}%`,
				height: `${region.size.height}%`,
				zIndex: 40 + (region.trackIndex ?? 0) * 4 + (region.zIndex ?? 0),
				pointerEvents: interactive ? "auto" : "none",
				cursor: isSelected && !dragging ? "move" : dragging ? "grabbing" : undefined,
				outline: isSelected ? "1.5px solid #2563EB" : "none",
				outlineOffset: -1,
				borderRadius: region.greenScreen ? 0 : 8,
				background: "transparent",
			}}
			onPointerDown={(event) => {
				event.stopPropagation();
				onSelect?.(region.id);
				beginDrag("move")(event);
			}}
			onPointerMove={handleDragMove}
			onPointerUp={endDrag}
			onPointerCancel={endDrag}
		>
			{!url ? null : region.greenScreen ? (
				<ChromaKeyMemeVideo
					url={url}
					similarity={region.chromaKeySimilarity ?? 0.3}
					isPlaying={isPlaying && !dragging}
					volume={region.volume}
					localTimeSec={localTimeSec}
				/>
			) : (
				<video
					ref={videoRef}
					src={url}
					loop
					playsInline
					preload="auto"
					muted={region.volume <= 0.001}
					onLoadedMetadata={handleLoadedMetadata}
					className="pointer-events-none absolute inset-0 h-full w-full object-contain"
				/>
			)}
			{isSelected ? (
				<>
					{/* Top-Left Handle */}
					<div
						className="absolute left-0 top-0 h-3.5 w-3.5 cursor-nwse-resize rounded-br-sm bg-[#2563EB] shadow-sm transition-transform hover:scale-125"
						style={{ pointerEvents: "auto" }}
						onPointerDown={beginDrag("resize-tl")}
						onPointerMove={handleDragMove}
						onPointerUp={endDrag}
						onPointerCancel={endDrag}
						title="Resize meme"
					/>
					{/* Top-Right Handle */}
					<div
						className="absolute right-0 top-0 h-3.5 w-3.5 cursor-nesw-resize rounded-bl-sm bg-[#2563EB] shadow-sm transition-transform hover:scale-125"
						style={{ pointerEvents: "auto" }}
						onPointerDown={beginDrag("resize-tr")}
						onPointerMove={handleDragMove}
						onPointerUp={endDrag}
						onPointerCancel={endDrag}
						title="Resize meme"
					/>
					{/* Bottom-Left Handle */}
					<div
						className="absolute bottom-0 left-0 h-3.5 w-3.5 cursor-nesw-resize rounded-tr-sm bg-[#2563EB] shadow-sm transition-transform hover:scale-125"
						style={{ pointerEvents: "auto" }}
						onPointerDown={beginDrag("resize-bl")}
						onPointerMove={handleDragMove}
						onPointerUp={endDrag}
						onPointerCancel={endDrag}
						title="Resize meme"
					/>
					{/* Bottom-Right Handle */}
					<div
						className="absolute bottom-0 right-0 h-3.5 w-3.5 cursor-nwse-resize rounded-tl-sm bg-[#2563EB] shadow-sm transition-transform hover:scale-125"
						style={{ pointerEvents: "auto" }}
						onPointerDown={beginDrag("resize-br")}
						onPointerMove={handleDragMove}
						onPointerUp={endDrag}
						onPointerCancel={endDrag}
						title="Resize meme"
					/>
				</>
			) : null}
		</div>
	);
}

/**
 * Preview compositor for meme overlay regions: draggable / resizable video
 * boxes, with canvas-based chroma keying for green-screen clips. The exporter
 * reproduces the same layers frame-by-frame.
 */
export function MemeOverlay({
	memeRegions,
	currentTimeMs,
	isPlaying,
	selectedMemeId,
	onSelectMeme,
	onPositionChange,
	onSizeChange,
}: MemeOverlayProps) {
	if (memeRegions.length === 0) return null;

	return (
		<>
			{memeRegions.map((region) => {
				const progress = getMemeProgress(region, currentTimeMs);
				if (progress === null) return null;
				return (
					<MemeItem
						key={region.id}
						region={region}
						currentTimeMs={currentTimeMs}
						isPlaying={isPlaying}
						isSelected={region.id === selectedMemeId}
						onSelect={onSelectMeme}
						onPositionChange={onPositionChange}
						onSizeChange={onSizeChange}
					/>
				);
			})}
		</>
	);
}
