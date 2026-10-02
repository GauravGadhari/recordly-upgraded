/**
 * Shared compositing math + canvas painters for transition and meme regions.
 * Used by the preview overlays (`videoPlayback/TransitionOverlay`,
 * `videoPlayback/MemeOverlay`) and by both frame renderers so the exported
 * video matches what the editor shows.
 */
import type { AudioRegion, MemeRegion, TransitionRegion } from "@/components/video-editor/types";
import { resolveMediaElementSource } from "./localMediaSource";

const MAX_CHROMA_PROCESS_WIDTH = 640;
const CHROMA_SOFTNESS = 0.12;

export function clampValue(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

export function smoothstep(edge0: number, edge1: number, value: number) {
	if (edge0 === edge1) return value < edge0 ? 0 : 1;
	const t = clampValue((value - edge0) / (edge1 - edge0), 0, 1);
	return t * t * (3 - 2 * t);
}

export function pseudoRandom(seed: number) {
	const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
	return x - Math.floor(x);
}

/** Progress through a `[startMs, endMs)` window in timeline ms, or null. */
export function getWindowProgress(
	startMs: number,
	endMs: number,
	timeMs: number,
): number | null {
	const duration = endMs - startMs;
	if (duration <= 0) return null;
	if (timeMs < startMs || timeMs >= endMs) return null;
	return clampValue((timeMs - startMs) / duration, 0, 1);
}

export function getTransitionProgress(region: TransitionRegion, timeMs: number): number | null {
	return getWindowProgress(region.startMs, region.endMs, timeMs);
}

export function getMemeProgress(region: MemeRegion, timeMs: number): number | null {
	return getWindowProgress(region.startMs, region.endMs, timeMs);
}

/**
 * Media overlays have their own audio sources. Convert them to normal audio
 * regions so every export backend sends them through the same offline mixer as
 * sounds placed on the audio tracks.
 */
export function buildMediaOverlayAudioRegions(
	memeRegions: MemeRegion[] | undefined,
	transitionRegions: TransitionRegion[] | undefined,
): AudioRegion[] {
	const memeAudio = (memeRegions ?? [])
		.filter(
			(region) =>
				region.endMs > region.startMs &&
				region.videoPath.trim().length > 0 &&
				region.volume > 0,
		)
		.map(
			(region): AudioRegion => ({
				id: `meme-audio:${region.id}`,
				startMs: region.startMs,
				endMs: region.endMs,
				audioPath: region.videoPath,
				volume: clampValue(region.volume, 0, 1),
				label: region.name || "Meme audio",
				category: "Meme",
			}),
		);

	const transitionAudio = (transitionRegions ?? [])
		.filter(
			(region) =>
				region.endMs > region.startMs &&
				typeof region.sfxAudioPath === "string" &&
				region.sfxAudioPath.trim().length > 0,
		)
		.map(
			(region): AudioRegion => ({
				id: `transition-sfx:${region.id}`,
				startMs: region.startMs,
				endMs: region.endMs,
				audioPath: region.sfxAudioPath!,
				volume: 0.9,
				label: `${region.name || "Transition"} whoosh`,
				category: "Transition SFX",
			}),
		);

	return [...memeAudio, ...transitionAudio];
}

/**
 * Remove the green screen from an RGBA buffer in place: dominance of the green
 * channel over red/blue past `similarity` fades the pixel to transparent, with
 * spill suppression on the partially-keyed edge pixels.
 */
export function applyChromaKeyToImageData(data: Uint8ClampedArray, similarity: number) {
	const threshold = clampValue(similarity, 0.05, 0.6);
	for (let i = 0; i < data.length; i += 4) {
		const r = data[i];
		const g = data[i + 1];
		const b = data[i + 2];
		const dominance = (g - Math.max(r, b)) / 255;
		if (dominance <= 0) continue;
		const keyed = smoothstep(threshold, threshold + CHROMA_SOFTNESS, dominance);
		if (keyed > 0) data[i + 3] = Math.round(data[i + 3] * (1 - keyed));
		if (keyed < 1 && dominance > threshold * 0.5) {
			data[i + 1] = Math.min(g, (r + b) / 2 + 30);
		}
	}
}

interface PooledOverlayVideo {
	element: HTMLVideoElement;
	revoke: () => void;
}

/**
 * Lazily-created, seek-driven HTMLVideoElements for auxiliary overlay clips
 * (meme videos and film-burn masks). Export walks the timeline in order, so a
 * per-frame seek keeps these in sync without a second decoder pipeline.
 */
export class OverlayVideoPool {
	private entries = new Map<string, Promise<PooledOverlayVideo | null>>();
	private destroyed = false;

	private load(resource: string): Promise<PooledOverlayVideo | null> {
		return (async () => {
			try {
				const { src, revoke } = await resolveMediaElementSource(resource);
				const element = document.createElement("video");
				element.src = src;
				element.muted = true;
				element.playsInline = true;
				element.preload = "auto";
				element.crossOrigin = "anonymous";
				await new Promise<void>((resolve) => {
					if (element.readyState >= 1) {
						resolve();
						return;
					}
					const cleanup = () => {
						window.clearTimeout(timer);
						element.removeEventListener("loadedmetadata", onReady);
						element.removeEventListener("error", onReady);
					};
					const onReady = () => {
						cleanup();
						resolve();
					};
					const timer = window.setTimeout(onReady, 5000);
					element.addEventListener("loadedmetadata", onReady);
					element.addEventListener("error", onReady);
				});
				if (!element.videoWidth || !element.videoHeight || this.destroyed) {
					revoke();
					return null;
				}
				return { element, revoke };
			} catch {
				return null;
			}
		})();
	}

	private get(resource: string): Promise<PooledOverlayVideo | null> {
		let entry = this.entries.get(resource);
		if (!entry) {
			entry = this.load(resource);
			this.entries.set(resource, entry);
		}
		return entry;
	}

	/**
	 * Seek the pooled element for `resource` to `localTimeSec` (looped over the
	 * clip duration) and return it once a frame is decodable, else null.
	 */
	async seekFrame(
		resource: string,
		localTimeSec: number,
		loop = true,
	): Promise<HTMLVideoElement | null> {
		const pooled = await this.get(resource);
		if (!pooled) return null;
		const video = pooled.element;
		const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
		let target = Math.max(0, localTimeSec);
		if (loop && duration > 0) {
			target %= duration;
			// Stay off the very last frame so the next loop wrap seeks cleanly.
			target = Math.min(target, Math.max(0, duration - 0.05));
		} else if (duration > 0) {
			target = Math.min(target, Math.max(0, duration - 0.05));
		}
		if (Math.abs(video.currentTime - target) > 0.004) {
			video.pause();
			await new Promise<void>((resolve) => {
				let settled = false;
				const done = () => {
					if (settled) return;
					settled = true;
					video.removeEventListener("seeked", done);
					window.clearTimeout(timer);
					resolve();
				};
				const timer = window.setTimeout(done, 500);
				video.addEventListener("seeked", done);
				video.currentTime = target;
			});
		}
		return video.readyState >= 2 ? video : null;
	}

	/** Seek to a 0..1 fraction of the clip's playable duration (film burns). */
	async seekNormalized(resource: string, progress: number): Promise<HTMLVideoElement | null> {
		const pooled = await this.get(resource);
		if (!pooled) return null;
		const video = pooled.element;
		const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
		if (duration <= 0) return video.readyState >= 2 ? video : null;
		const target = clampValue(progress, 0, 1) * Math.max(0, duration - 0.05);
		if (Math.abs(video.currentTime - target) > 0.004) {
			video.pause();
			await new Promise<void>((resolve) => {
				let settled = false;
				const done = () => {
					if (settled) return;
					settled = true;
					video.removeEventListener("seeked", done);
					window.clearTimeout(timer);
					resolve();
				};
				const timer = window.setTimeout(done, 500);
				video.addEventListener("seeked", done);
				video.currentTime = target;
			});
		}
		return video.readyState >= 2 ? video : null;
	}

	destroyAll() {
		this.destroyed = true;
		for (const entry of this.entries.values()) {
			void entry.then((pooled) => {
				if (!pooled) return;
				pooled.element.pause();
				pooled.revoke();
			});
		}
		this.entries.clear();
	}
}

function drawVideoContain(
	ctx: CanvasRenderingContext2D,
	video: HTMLVideoElement | HTMLCanvasElement,
	x: number,
	y: number,
	width: number,
	height: number,
) {
	const sourceWidth = video instanceof HTMLVideoElement ? video.videoWidth : video.width;
	const sourceHeight = video instanceof HTMLVideoElement ? video.videoHeight : video.height;
	if (!sourceWidth || !sourceHeight || width <= 0 || height <= 0) return;
	const scale = Math.min(width / sourceWidth, height / sourceHeight);
	const drawWidth = sourceWidth * scale;
	const drawHeight = sourceHeight * scale;
	ctx.drawImage(
		video,
		x + (width - drawWidth) / 2,
		y + (height - drawHeight) / 2,
		drawWidth,
		drawHeight,
	);
}

function drawVideoCover(
	ctx: CanvasRenderingContext2D,
	video: HTMLVideoElement | HTMLCanvasElement,
	x: number,
	y: number,
	width: number,
	height: number,
) {
	const sourceWidth = video instanceof HTMLVideoElement ? video.videoWidth : video.width;
	const sourceHeight = video instanceof HTMLVideoElement ? video.videoHeight : video.height;
	if (!sourceWidth || !sourceHeight || width <= 0 || height <= 0) return;
	const scale = Math.max(width / sourceWidth, height / sourceHeight);
	const drawWidth = sourceWidth * scale;
	const drawHeight = sourceHeight * scale;
	ctx.drawImage(video, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

let chromaScratchCanvas: HTMLCanvasElement | null = null;

function drawChromaKeyedVideo(
	ctx: CanvasRenderingContext2D,
	video: HTMLVideoElement,
	x: number,
	y: number,
	width: number,
	height: number,
	similarity: number,
	fit: "contain" | "cover" = "contain",
) {
	const scale = Math.min(
		1,
		MAX_CHROMA_PROCESS_WIDTH / Math.max(1, video.videoWidth),
		Math.max(1, width) / Math.max(1, video.videoWidth),
	);
	const processWidth = Math.max(2, Math.round(video.videoWidth * scale));
	const processHeight = Math.max(2, Math.round(video.videoHeight * scale));
	if (!chromaScratchCanvas) {
		chromaScratchCanvas = document.createElement("canvas");
	}
	const scratch = chromaScratchCanvas;
	if (scratch.width !== processWidth) scratch.width = processWidth;
	if (scratch.height !== processHeight) scratch.height = processHeight;
	const scratchCtx = scratch.getContext("2d", { willReadFrequently: true });
	if (!scratchCtx) return;
	scratchCtx.clearRect(0, 0, processWidth, processHeight);
	scratchCtx.drawImage(video, 0, 0, processWidth, processHeight);
	const frame = scratchCtx.getImageData(0, 0, processWidth, processHeight);
	applyChromaKeyToImageData(frame.data, similarity);
	scratchCtx.putImageData(frame, 0, 0);
	if (fit === "cover") {
		drawVideoCover(ctx, scratch, x, y, width, height);
	} else {
		drawVideoContain(ctx, scratch, x, y, width, height);
	}
}

export function hasActiveMeme(memeRegions: MemeRegion[], timeMs: number): boolean {
	return memeRegions.some((region) => getMemeProgress(region, timeMs) !== null);
}

export function hasActiveTransition(
	transitionRegions: TransitionRegion[],
	timeMs: number,
): boolean {
	return transitionRegions.some((region) => getTransitionProgress(region, timeMs) !== null);
}

/** Draw every meme region active at `timeMs` (timeline ms) onto `ctx`. */
export async function drawActiveMemes(
	ctx: CanvasRenderingContext2D,
	memeRegions: MemeRegion[],
	frameWidth: number,
	frameHeight: number,
	timeMs: number,
	pool: OverlayVideoPool,
): Promise<void> {
	const active = memeRegions
		.map((region) => ({ region, progress: getMemeProgress(region, timeMs) }))
		.filter(
			(entry): entry is { region: MemeRegion; progress: number } => entry.progress !== null,
		)
		.sort(
			(a, b) =>
				(a.region.trackIndex ?? 0) - (b.region.trackIndex ?? 0) ||
				(a.region.zIndex ?? 0) - (b.region.zIndex ?? 0),
		);

	for (const { region } of active) {
		const localTimeSec = (timeMs - region.startMs) / 1000;
		const video = await pool.seekFrame(region.videoPath, localTimeSec, true);
		if (!video) continue;

		const x = (region.position.x / 100) * frameWidth;
		const y = (region.position.y / 100) * frameHeight;
		const width = (region.size.width / 100) * frameWidth;
		const height = (region.size.height / 100) * frameHeight;
		if (width <= 0 || height <= 0) continue;

		ctx.save();
		if (!region.greenScreen) {
			const radius = frameWidth * 0.006;
			if (typeof ctx.roundRect === "function" && radius > 0.5) {
				ctx.beginPath();
				ctx.roundRect(x, y, width, height, radius);
				ctx.clip();
			}
		}
		if (region.greenScreen) {
			drawChromaKeyedVideo(
				ctx,
				video,
				x,
				y,
				width,
				height,
				region.chromaKeySimilarity ?? 0.3,
			);
		} else {
			drawVideoContain(ctx, video, x, y, width, height);
		}
		ctx.restore();
	}
}

/** Draw every transition region active at `timeMs` (timeline ms) onto `ctx`. */
export async function drawActiveTransitions(
	ctx: CanvasRenderingContext2D,
	transitionRegions: TransitionRegion[],
	frameWidth: number,
	frameHeight: number,
	timeMs: number,
	pool: OverlayVideoPool,
): Promise<void> {
	const active = transitionRegions
		.map((region) => ({ region, progress: getTransitionProgress(region, timeMs) }))
		.filter(
			(entry): entry is { region: TransitionRegion; progress: number } =>
				entry.progress !== null,
		);

	for (const { region, progress } of active) {
		ctx.save();
		await paintTransitionRegion(ctx, region, progress, frameWidth, frameHeight, pool);
		ctx.restore();
	}
}

async function paintTransitionRegion(
	ctx: CanvasRenderingContext2D,
	region: TransitionRegion,
	progress: number,
	width: number,
	height: number,
	pool: OverlayVideoPool,
) {
	const dip = Math.sin(Math.PI * clampValue(progress, 0, 1));

	switch (region.type) {
		case "fade-black":
			ctx.fillStyle = "#000000";
			ctx.globalAlpha = dip;
			ctx.fillRect(0, 0, width, height);
			return;
		case "dip-white":
			ctx.fillStyle = "#ffffff";
			ctx.globalAlpha = dip;
			ctx.fillRect(0, 0, width, height);
			return;
		case "cross-dissolve": {
			const gradient = ctx.createRadialGradient(
				width / 2,
				height / 2,
				0,
				width / 2,
				height / 2,
				Math.hypot(width, height) / 2,
			);
			gradient.addColorStop(0, "rgba(255,255,255,0.9)");
			gradient.addColorStop(0.7, "rgba(210,215,230,0.65)");
			gradient.addColorStop(1, "rgba(160,170,195,0.55)");
			ctx.globalAlpha = dip * 0.6;
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, width, height);
			return;
		}
		case "zoom-in":
		case "zoom-out": {
			const core = region.type === "zoom-in" ? 78 - dip * 38 : 40 + dip * 38;
			const radius = Math.hypot(width, height) / 2;
			const gradient = ctx.createRadialGradient(
				width / 2,
				height / 2,
				0,
				width / 2,
				height / 2,
				radius,
			);
			const innerStop = clampValue((core - 26) / 100, 0, 1);
			const outerStop = clampValue(Math.max(core + 16, core - 25) / 100, 0, 1);
			gradient.addColorStop(0, "rgba(0,0,0,0)");
			gradient.addColorStop(innerStop, "rgba(0,0,0,0)");
			gradient.addColorStop(outerStop, "rgba(0,0,0,0.82)");
			gradient.addColorStop(1, "rgba(0,0,0,0.82)");
			ctx.globalAlpha = Math.max(0.15, dip);
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, width, height);
			return;
		}
		case "slide-left": {
			const x = (0.5 - progress) * 2 * width;
			const grad = ctx.createLinearGradient(x, 0, x + width, 0);
			grad.addColorStop(0, "rgba(15,23,42,0)");
			grad.addColorStop(0.12, "rgba(15,23,42,0.7)");
			grad.addColorStop(0.28, "rgba(15,23,42,0.92)");
			grad.addColorStop(0.72, "rgba(15,23,42,0.92)");
			grad.addColorStop(0.88, "rgba(15,23,42,0.7)");
			grad.addColorStop(1, "rgba(15,23,42,0)");
			ctx.fillStyle = grad;
			ctx.fillRect(x, 0, width, height);
			return;
		}
		case "slide-right": {
			const x = (progress - 0.5) * 2 * width;
			const grad = ctx.createLinearGradient(x, 0, x + width, 0);
			grad.addColorStop(0, "rgba(15,23,42,0)");
			grad.addColorStop(0.12, "rgba(15,23,42,0.7)");
			grad.addColorStop(0.28, "rgba(15,23,42,0.92)");
			grad.addColorStop(0.72, "rgba(15,23,42,0.92)");
			grad.addColorStop(0.88, "rgba(15,23,42,0.7)");
			grad.addColorStop(1, "rgba(15,23,42,0)");
			ctx.fillStyle = grad;
			ctx.fillRect(x, 0, width, height);
			return;
		}
		case "glitch": {
			const intensity = smoothstep(0, 0.25, progress) * (1 - smoothstep(0.75, 1, progress));
			const seed = Math.floor(progress * 40);
			ctx.globalCompositeOperation = "screen";
			for (let index = 0; index < 6; index += 1) {
				const r1 = pseudoRandom(seed + index * 7.13);
				const r2 = pseudoRandom(seed + index * 17.71 + 3.7);
				const top = r1 * 0.9 * height;
				const sliceHeight = ((3 + r2 * 12) / 100) * height;
				const offset = ((r2 - 0.5) * 14 * intensity * width) / 100;
				const gradient = ctx.createLinearGradient(0, 0, width, 0);
				if (index % 2 === 0) {
					gradient.addColorStop(0.08, "rgba(37,99,235,0)");
					gradient.addColorStop(0.3, "rgba(37,99,235,0.35)");
					gradient.addColorStop(0.68, "rgba(236,72,153,0.3)");
					gradient.addColorStop(0.92, "rgba(236,72,153,0)");
				} else {
					gradient.addColorStop(0.12, "rgba(34,211,238,0)");
					gradient.addColorStop(0.4, "rgba(34,211,238,0.3)");
					gradient.addColorStop(0.75, "rgba(250,204,21,0.22)");
					gradient.addColorStop(0.95, "rgba(250,204,21,0)");
				}
				ctx.globalAlpha = intensity;
				ctx.fillStyle = gradient;
				ctx.fillRect(offset, top, width, sliceHeight);
			}
			return;
		}
		case "film-burn": {
			if (region.overlayVideoPath) {
				const video = await pool.seekNormalized(
					region.overlayVideoPath,
					progress,
				);
				if (video) {
					if (region.greenScreen || region.blendMode === "chroma-key") {
						drawChromaKeyedVideo(
							ctx,
							video,
							0,
							0,
							width,
							height,
							region.chromaKeySimilarity ?? 0.35,
							"cover",
						);
					} else {
						ctx.globalCompositeOperation = "screen";
						drawVideoCover(ctx, video, 0, 0, width, height);
					}
				}
				return;
			}
			// Warm glow fallback when no burn overlay exists on disk.
			const gradient = ctx.createRadialGradient(
				width / 2,
				height / 2,
				0,
				width / 2,
				height / 2,
				Math.hypot(width, height) / 2,
			);
			gradient.addColorStop(0, "rgba(255,214,140,0.95)");
			gradient.addColorStop(0.6, "rgba(255,140,60,0.6)");
			gradient.addColorStop(1, "rgba(120,40,10,0.5)");
			ctx.globalCompositeOperation = "screen";
			ctx.globalAlpha = dip * 0.85;
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, width, height);
			return;
		}
		default:
			return;
	}
}
