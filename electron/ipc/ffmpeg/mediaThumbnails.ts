import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import { rememberApprovedLocalReadPath } from "../project/manager";
import { getFfmpegBinaryPath } from "./binary";

const MAX_CONCURRENT_GENERATIONS = 3;
let activeGenerations = 0;
const queue: (() => void)[] = [];
const inFlightPromises = new Map<string, Promise<string | null>>();

function getPreviewCacheDir(): string {
	const base = app.getPath("userData");
	return path.join(base, "media-preview-cache");
}

export function getPreviewCachePath(sourcePath: string): string {
	const hash = crypto.createHash("sha1").update(sourcePath).digest("hex");
	return path.join(getPreviewCacheDir(), `${hash}.mp4`);
}

export function getCachedPreviewVideoPath(sourcePath: string): string | null {
	try {
		const cachePath = getPreviewCachePath(sourcePath);
		return existsSync(cachePath) ? cachePath : null;
	} catch {
		return null;
	}
}

function schedule<T>(task: () => Promise<T>): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const run = () => {
			activeGenerations += 1;
			task()
				.then(resolve, reject)
				.finally(() => {
					activeGenerations -= 1;
					const next = queue.shift();
					if (next) next();
				});
		};

		if (activeGenerations < MAX_CONCURRENT_GENERATIONS) {
			run();
		} else {
			queue.push(run);
		}
	});
}

/**
 * Generate (or return existing) low-resolution (240p, 15fps, audio-free) MP4 thumbnail video
 * for smooth 60fps autoplay looping in the media library sidebar.
 */
export async function ensureMediaPreviewVideo(sourcePath: string): Promise<string | null> {
	if (!sourcePath || typeof sourcePath !== "string") return null;
	if (!existsSync(sourcePath)) return null;

	const cacheDir = getPreviewCacheDir();
	if (!existsSync(cacheDir)) {
		await fs.mkdir(cacheDir, { recursive: true }).catch(() => {});
	}

	const cachePath = getPreviewCachePath(sourcePath);

	// Check if already generated and non-empty
	if (existsSync(cachePath)) {
		try {
			const stat = await fs.stat(cachePath);
			if (stat.size > 1024) {
				void rememberApprovedLocalReadPath(cachePath);
				return cachePath;
			}
		} catch {
			// stat failed, recreate
		}
	}

	// Deduplicate in-flight requests for the same source
	const existing = inFlightPromises.get(sourcePath);
	if (existing) {
		return existing;
	}

	const promise = schedule(async () => {
		const ffmpegPath = getFfmpegBinaryPath();
		const tempPath = `${cachePath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;

		try {
			await new Promise<void>((resolve, reject) => {
				const args = [
					"-y",
					"-ss",
					"0",
					"-t",
					"4",
					"-i",
					sourcePath,
					"-vf",
					"scale=240:-2:flags=fast_bilinear,fps=15",
					"-c:v",
					"libx264",
					"-preset",
					"ultrafast",
					"-crf",
					"28",
					"-pix_fmt",
					"yuv420p",
					"-an",
					"-movflags",
					"+faststart",
					tempPath,
				];

				const proc = spawn(ffmpegPath, args, {
					stdio: ["ignore", "ignore", "pipe"],
					windowsHide: true,
				});

				let stderr = "";
				proc.stderr?.on("data", (chunk) => {
					stderr += chunk.toString();
				});

				proc.on("error", (err) => reject(err));
				proc.on("close", (code) => {
					if (code === 0) {
						resolve();
					} else {
						reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-200)}`));
					}
				});
			});

			await fs.rename(tempPath, cachePath);
			void rememberApprovedLocalReadPath(cachePath);
			return cachePath;
		} catch (err) {
			console.warn(`[mediaThumbnails] Failed to generate thumbnail for ${sourcePath}:`, err);
			await fs.unlink(tempPath).catch(() => {});
			return null;
		}
	}).finally(() => {
		inFlightPromises.delete(sourcePath);
	});

	inFlightPromises.set(sourcePath, promise);
	return promise;
}
