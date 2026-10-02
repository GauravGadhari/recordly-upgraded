import { useCallback, useEffect, useRef } from "react";
import { resolveMediaResourceUrl } from "@/lib/exporter/localMediaSource";
import {
	applyChromaKeyToImageData,
	getTransitionProgress,
	pseudoRandom,
	smoothstep,
} from "@/lib/exporter/mediaOverlayRenderer";
import type { TransitionRegion } from "../types";
import { useResolvedMediaUrl } from "../mediaLibrary/useResolvedMediaUrl";

interface TransitionOverlayProps {
	transitionRegions: TransitionRegion[];
	/** Playhead position on the composed timeline, in milliseconds. */
	currentTimeMs: number;
	isPlaying: boolean;
}

export { getTransitionProgress };

const MAX_CHROMA_CANVAS_WIDTH = 720;

function ChromaKeyTransitionVideo({
	url,
	progress,
	region,
	isPlaying,
	similarity = 0.35,
}: {
	url: string;
	progress: number;
	region: TransitionRegion;
	isPlaying: boolean;
	similarity?: number;
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
			video.currentTime = Math.max(0, Math.min(progress * duration, duration - 0.05));
		}
	}, [progress]);

	useEffect(() => {
		const video = videoRef.current;
		if (!video || !url) return;
		if (isPlaying) {
			const duration = Number.isFinite(video.duration) ? video.duration : 0;
			const regionDurationSec = Math.max(0.05, (region.endMs - region.startMs) / 1000);
			if (duration > 0) {
				video.playbackRate = Math.max(0.1, Math.min(10, duration / regionDurationSec));
			}
			void video.play().catch(() => {});
		} else {
			video.pause();
		}
	}, [isPlaying, region.endMs, region.startMs, url]);

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;
		const duration = Number.isFinite(video.duration) ? video.duration : 0;
		if (duration > 0) {
			const target = Math.max(0, Math.min(progress * duration, duration - 0.05));
			if (!isPlaying || Math.abs(video.currentTime - target) > 0.15) {
				video.currentTime = target;
			}
		}
	}, [isPlaying, progress]);

	useEffect(() => {
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
			raf = requestAnimationFrame(draw);
		};

		draw();
		return () => {
			cancelled = true;
			cancelAnimationFrame(raf);
		};
	}, []);

	return (
		<>
			<video
				ref={videoRef}
				src={url}
				muted
				playsInline
				loop
				preload="auto"
				onLoadedMetadata={handleLoadedMetadata}
				className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
				aria-hidden="true"
			/>
			<canvas
				ref={canvasRef}
				className="pointer-events-none absolute inset-0 h-full w-full"
				style={{ objectFit: "cover" }}
			/>
		</>
	);
}

function FilmBurnLayer({
	region,
	progress,
	isPlaying,
}: {
	region: TransitionRegion;
	progress: number;
	isPlaying: boolean;
}) {
	const url = useResolvedMediaUrl(region.overlayVideoPath ?? null);
	const videoRef = useRef<HTMLVideoElement | null>(null);

	const handleLoadedMetadata = useCallback(() => {
		const video = videoRef.current;
		if (!video) return;
		const duration = Number.isFinite(video.duration) ? video.duration : 0;
		if (duration > 0) {
			video.currentTime = Math.max(0, Math.min(progress * duration, duration - 0.05));
		}
	}, [progress]);

	useEffect(() => {
		const video = videoRef.current;
		if (!video || !url) return;
		if (isPlaying) {
			const duration = Number.isFinite(video.duration) ? video.duration : 0;
			const regionDurationSec = Math.max(0.05, (region.endMs - region.startMs) / 1000);
			if (duration > 0) {
				video.playbackRate = Math.max(0.1, Math.min(10, duration / regionDurationSec));
			}
			void video.play().catch(() => {});
		} else {
			video.pause();
		}
	}, [isPlaying, region.endMs, region.startMs, url]);

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;
		const duration = Number.isFinite(video.duration) ? video.duration : 0;
		if (duration > 0) {
			const target = Math.max(0, Math.min(progress * duration, duration - 0.05));
			if (!isPlaying || Math.abs(video.currentTime - target) > 0.15) {
				video.currentTime = target;
			}
		}
	}, [isPlaying, progress]);

	if (!url) return null;
	return (
		<video
			ref={videoRef}
			src={url}
			muted
			playsInline
			loop
			preload="auto"
			onLoadedMetadata={handleLoadedMetadata}
			className="pointer-events-none absolute inset-0 h-full w-full object-cover"
			style={{ mixBlendMode: "screen" }}
		/>
	);
}

function VideoOverlayLayer({
	region,
	progress,
	isPlaying,
}: {
	region: TransitionRegion;
	progress: number;
	isPlaying: boolean;
}) {
	const isGreenScreen = region.greenScreen || region.blendMode === "chroma-key";
	const url = useResolvedMediaUrl(region.overlayVideoPath ?? null);
	if (!url) return null;

	if (isGreenScreen) {
		return (
			<ChromaKeyTransitionVideo
				url={url}
				progress={progress}
				region={region}
				isPlaying={isPlaying}
				similarity={region.chromaKeySimilarity ?? 0.35}
			/>
		);
	}

	return <FilmBurnLayer region={region} progress={progress} isPlaying={isPlaying} />;
}

function GlitchLayer({ progress, seed }: { progress: number; seed: number }) {
	const intensity = smoothstep(0, 0.25, progress) * (1 - smoothstep(0.75, 1, progress));
	const slices = [];
	for (let index = 0; index < 6; index += 1) {
		const r1 = pseudoRandom(seed + index * 7.13);
		const r2 = pseudoRandom(seed + index * 17.71 + 3.7);
		const top = r1 * 90;
		const height = 3 + r2 * 12;
		const offset = (r2 - 0.5) * 14 * intensity;
		slices.push(
			<div
				key={index}
				className="pointer-events-none absolute inset-x-0"
				style={{
					top: `${top}%`,
					height: `${height}%`,
					transform: `translateX(${offset}%)`,
					background:
						index % 2 === 0
							? "linear-gradient(90deg, transparent 8%, rgba(37,99,235,0.35) 30%, rgba(236,72,153,0.3) 68%, transparent 92%)"
							: "linear-gradient(90deg, transparent 12%, rgba(34,211,238,0.3) 40%, rgba(250,204,21,0.22) 75%, transparent 95%)",
					mixBlendMode: "screen",
					opacity: intensity,
				}}
			/>,
		);
	}
	return <>{slices}</>;
}

function ProceduralLayer({ type, progress }: { type: TransitionRegion["type"]; progress: number }) {
	const dip = Math.sin(Math.PI * Math.min(1, Math.max(0, progress)));

	switch (type) {
		case "fade-black":
			return (
				<div
					className="pointer-events-none absolute inset-0 bg-black"
					style={{ opacity: dip }}
				/>
			);
		case "dip-white":
			return (
				<div
					className="pointer-events-none absolute inset-0 bg-white"
					style={{ opacity: dip }}
				/>
			);
		case "cross-dissolve":
			return (
				<div
					className="pointer-events-none absolute inset-0"
					style={{
						background:
							"radial-gradient(circle at 50% 50%, rgba(255,255,255,0.9), rgba(210,215,230,0.65) 70%, rgba(160,170,195,0.55))",
						opacity: dip * 0.6,
					}}
				/>
			);
		case "zoom-in":
		case "zoom-out": {
			const core =
				type === "zoom-in" ? 78 - dip * 38 : 40 + dip * 38;
			return (
				<div
					className="pointer-events-none absolute inset-0"
					style={{
						background: `radial-gradient(circle at 50% 50%, transparent ${Math.max(4, core - 26)}%, rgba(0,0,0,0.82) ${core + 16}%)`,
						opacity: Math.max(0.15, dip),
					}}
				/>
			);
		}
		case "slide-left": {
			const xPercent = (0.5 - progress) * 200;
			return (
				<div
					className="pointer-events-none absolute inset-y-0 w-full"
					style={{
						transform: `translateX(${xPercent}%)`,
						background:
							"linear-gradient(90deg, transparent 0%, rgba(15,23,42,0.7) 12%, rgba(15,23,42,0.92) 28%, rgba(15,23,42,0.92) 72%, rgba(15,23,42,0.7) 88%, transparent 100%)",
						boxShadow: "0 0 50px rgba(59,130,246,0.35)",
					}}
				>
					<div
						className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2"
						style={{
							background: "linear-gradient(180deg, transparent, rgba(96,165,250,0.8), transparent)",
						}}
					/>
				</div>
			);
		}
		case "slide-right": {
			const xPercent = (progress - 0.5) * 200;
			return (
				<div
					className="pointer-events-none absolute inset-y-0 w-full"
					style={{
						transform: `translateX(${xPercent}%)`,
						background:
							"linear-gradient(90deg, transparent 0%, rgba(15,23,42,0.7) 12%, rgba(15,23,42,0.92) 28%, rgba(15,23,42,0.92) 72%, rgba(15,23,42,0.7) 88%, transparent 100%)",
						boxShadow: "0 0 50px rgba(139,92,246,0.35)",
					}}
				>
					<div
						className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2"
						style={{
							background: "linear-gradient(180deg, transparent, rgba(167,139,250,0.8), transparent)",
						}}
					/>
				</div>
			);
		}
		case "glitch":
			return <GlitchLayer progress={progress} seed={Math.floor(progress * 40)} />;
		default:
			return null;
	}
}

/**
 * Preview compositor for transition regions. Procedural types are approximated
 * with CSS layers driven by the timeline playhead; film burns composite the
 * overlay clip with `screen` blending or chroma-keying for green screen.
 */
export function TransitionOverlay({
	transitionRegions,
	currentTimeMs,
	isPlaying,
}: TransitionOverlayProps) {
	const sfxPlayedRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		const activeIds = new Set<string>();
		for (const region of transitionRegions) {
			const progress = getTransitionProgress(region, currentTimeMs);
			if (progress === null) continue;
			activeIds.add(region.id);
			if (!region.sfxAudioPath) continue;
			if (!isPlaying) {
				// Scrubbing across a region should not machine-gun the SFX.
				sfxPlayedRef.current.add(region.id);
				continue;
			}
			if (sfxPlayedRef.current.has(region.id)) continue;
			sfxPlayedRef.current.add(region.id);
			const path = region.sfxAudioPath;
			void resolveMediaResourceUrl(path)
				.then((url) => {
					const audio = new Audio(url);
					audio.volume = 0.9;
					void audio.play().catch(() => {});
				})
				.catch(() => {});
		}
		for (const playedId of Array.from(sfxPlayedRef.current)) {
			if (!activeIds.has(playedId)) sfxPlayedRef.current.delete(playedId);
		}
	}, [currentTimeMs, isPlaying, transitionRegions]);

	if (transitionRegions.length === 0) return null;

	return (
		<>
			{transitionRegions.map((region) => {
				const progress = getTransitionProgress(region, currentTimeMs);
				if (progress === null) return null;
				return (
					<div
						key={region.id}
						className="pointer-events-none absolute inset-0 overflow-hidden"
						style={{ zIndex: 60 }}
					>
						{region.type === "film-burn" || region.overlayVideoPath ? (
							<VideoOverlayLayer region={region} progress={progress} isPlaying={isPlaying} />
						) : (
							<ProceduralLayer type={region.type} progress={progress} />
						)}
					</div>
				);
			})}
		</>
	);
}
