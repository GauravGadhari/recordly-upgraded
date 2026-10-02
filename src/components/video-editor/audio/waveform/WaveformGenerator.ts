import { WAVEFORM_DEFAULT_PEAK_COUNT } from "../../timeline/core/constants";
import type { AudioPeaksData } from "../../timeline/core/timelineTypes";
import { getAudioResourceCacheScope, getAudioResourceVersionKey } from "../audioResourceVersion";
import { loadMediaArrayBuffer } from "@/lib/exporter/localMediaSource";
import WorkerConstructor from "./waveform.worker?worker";
import { VersionedWaveformCache } from "./waveformCache";

const MAX_WAVEFORM_PEAKS = 200_000;
const MAX_WAVEFORM_CACHE_ENTRIES = 256;

export class WaveformGenerator {
	private worker: Worker | null = null;
	private peaksCache = new VersionedWaveformCache<AudioPeaksData>(MAX_WAVEFORM_CACHE_ENTRIES);
	private pending = new Map<string, Promise<AudioPeaksData>>();
	private workerRequestSeq = 0;
	private workerResolvers = new Map<
		number,
		{ resolve: (peaks: Float32Array) => void; reject: (err: Error) => void }
	>();

	constructor() {
		try {
			this.worker = new WorkerConstructor();

			this.worker.addEventListener(
				"message",
				(event: MessageEvent<{ requestId: number; peaks?: Float32Array; error?: string }>) => {
					const { requestId, peaks, error } = event.data;
					const resolver = this.workerResolvers.get(requestId);
					if (!resolver) return;

					this.workerResolvers.delete(requestId);
					if (error) {
						resolver.reject(new Error(error));
					} else if (peaks) {
						resolver.resolve(peaks);
					}
				},
			);

			this.worker.addEventListener("error", (error: ErrorEvent) => {
				console.error("[WaveformGenerator] Worker fatal error:", error);
				const fatalError = error.error ?? new Error(error.message || "Worker crashed");

				// Reject all pending requests if the worker itself crashes
				for (const resolver of this.workerResolvers.values()) {
					resolver.reject(fatalError);
				}
				this.workerResolvers.clear();
			});
		} catch (err) {
			console.warn("[WaveformGenerator] Failed to initialize worker, using direct computation:", err);
			this.worker = null;
		}
	}

	private computePeaksWithWorker(
		channels: Float32Array[],
		samples: number,
	): Promise<Float32Array> {
		if (!this.worker) {
			return Promise.reject(new Error("Worker not initialized"));
		}

		return new Promise((resolve, reject) => {
			const requestId = ++this.workerRequestSeq;
			this.workerResolvers.set(requestId, { resolve, reject });

			// Transfer copies to worker so original channels stay valid for direct fallback if worker fails
			this.worker!.postMessage(
				{
					requestId,
					channels: channels.map((c) => c.slice()),
					samples,
				},
				channels.map((c) => c.slice().buffer),
			);
		});
	}

	private computePeaksDirect(channels: Float32Array[], samples: number): Float32Array {
		const firstChannel = channels[0];
		if (!firstChannel || channels.length === 0 || samples <= 0) {
			return new Float32Array(samples > 0 ? samples : 0);
		}
		const result = new Float32Array(samples);
		const total = firstChannel.length;
		const blockSize = total / samples;

		for (let i = 0; i < samples; i++) {
			const start = Math.floor(i * blockSize);
			const end = Math.min(total, Math.floor((i + 1) * blockSize));

			let max = 0;
			const actualEnd = Math.max(start + 1, end);

			for (let j = start; j < actualEnd && j < total; j++) {
				for (let c = 0; c < channels.length; c++) {
					const val = Math.abs(channels[c][j]);
					if (val > max) max = val;
				}
			}
			result[i] = max;
		}

		return result;
	}

	private async computePeaks(channels: Float32Array[], samples: number): Promise<Float32Array> {
		if (!this.worker) {
			return this.computePeaksDirect(channels, samples);
		}

		try {
			return await Promise.race([
				this.computePeaksWithWorker(channels, samples),
				new Promise<Float32Array>((_, reject) =>
					setTimeout(() => reject(new Error("Worker peak generation timed out")), 2000),
				),
			]);
		} catch (error) {
			console.warn("[WaveformGenerator] Worker peak computation failed, using direct computation:", error);
			return this.computePeaksDirect(channels, samples);
		}
	}

	public async generate(
		url: string,
		peakCount = WAVEFORM_DEFAULT_PEAK_COUNT,
		resourceVersion = 0,
	): Promise<AudioPeaksData> {
		const cacheScope = `${getAudioResourceCacheScope(url)}::${peakCount}`;
		const cacheKey = getAudioResourceVersionKey(cacheScope, resourceVersion);
		this.peaksCache.activate(cacheScope, cacheKey);
		const cached = this.peaksCache.get(cacheKey);
		if (cached) return cached;

		const inflight = this.pending.get(cacheKey);
		if (inflight) return inflight;

		const request = (async () => {
			const arrayBuffer = await loadMediaArrayBuffer(url);

			// OfflineAudioContext is never suspended by autoplay policy and requires no audio output device
			const decodeCtx = new OfflineAudioContext(1, 1, 44100);
			const decoded = await decodeCtx.decodeAudioData(arrayBuffer);

			const adaptivePeakCount = Math.max(peakCount, Math.floor(decoded.duration * 500));
			const boundedPeakCount = Math.min(adaptivePeakCount, MAX_WAVEFORM_PEAKS);
			const channels: Float32Array[] = [];
			for (let i = 0; i < decoded.numberOfChannels; i++) {
				channels.push(decoded.getChannelData(i).slice());
			}

			const peaks = await this.computePeaks(channels, boundedPeakCount);

			// Robust Normalization: For short audio (< 10s such as clicks, whooshes, SFX),
			// normalize to absolute peak so transients are vivid and not squashed.
			let max = 0;
			for (let i = 0; i < peaks.length; i++) {
				if (peaks[i] > max) max = peaks[i];
			}

			if (decoded.duration >= 10 && max > 0) {
				const sortedPeaks = [...peaks].sort((a, b) => a - b);
				const percentileIndex = Math.floor(sortedPeaks.length * 0.995);
				const robustMax = sortedPeaks[percentileIndex] || 0;
				if (robustMax > 0) {
					max = robustMax;
				}
			}

			if (max > 0) {
				for (let i = 0; i < peaks.length; i++) {
					peaks[i] = Math.min(1.0, peaks[i] / max);
				}
			}

			const result: AudioPeaksData = {
				peaks,
				durationMs: decoded.duration * 1000,
			};
			this.peaksCache.setIfCurrent(cacheScope, cacheKey, result);
			this.pending.delete(cacheKey);
			return result;
		})().catch((error) => {
			this.pending.delete(cacheKey);
			this.peaksCache.deactivateIfCurrent(cacheScope, cacheKey);
			throw error;
		});

		this.pending.set(cacheKey, request);
		return request;
	}
}

export const waveformGenerator = new WaveformGenerator();
