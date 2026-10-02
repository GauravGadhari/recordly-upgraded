import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFallbackDemuxerSource, resolveMediaElementSource } from "./localMediaSource";

const readLocalFile = vi.fn();
const getLocalMediaUrl = vi.fn(async (filePath: string) => ({
	success: true,
	url: `http://127.0.0.1:4321/video?path=${encodeURIComponent(filePath)}`,
}));

describe("resolveMediaElementSource", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		readLocalFile.mockReset();
		getLocalMediaUrl.mockReset();
		getLocalMediaUrl.mockImplementation(async (filePath: string) => ({
			success: true,
			url: `http://127.0.0.1:4321/video?path=${encodeURIComponent(filePath)}`,
		}));
		Object.assign(globalThis, {
			window: {
				electronAPI: {
					readLocalFile,
					getLocalMediaUrl,
				},
			},
		});
	});

	it("resolves file URLs through the local media server for media elements", async () => {
		const result = await resolveMediaElementSource("file:///tmp/example.mp4");

		expect(readLocalFile).not.toHaveBeenCalled();
		expect(getLocalMediaUrl).toHaveBeenCalledWith("/tmp/example.mp4");
		expect(result.src).toBe("http://127.0.0.1:4321/video?path=%2Ftmp%2Fexample.mp4");
	});

	it("resolves absolute local paths through the local media server without copying them into blobs", async () => {
		const result = await resolveMediaElementSource("/tmp/example.wav");

		expect(readLocalFile).not.toHaveBeenCalled();
		expect(getLocalMediaUrl).toHaveBeenCalledWith("/tmp/example.wav");
		expect(result.src).toBe("http://127.0.0.1:4321/video?path=%2Ftmp%2Fexample.wav");
	});

	it("preserves loopback media-server URLs instead of materializing them through IPC", async () => {
		const result = await resolveMediaElementSource(
			"http://127.0.0.1:43123/video?path=%2Ftmp%2Fexample%20clip.mp4",
		);

		expect(readLocalFile).not.toHaveBeenCalled();
		expect(getLocalMediaUrl).not.toHaveBeenCalled();
		expect(result.src).toBe("http://127.0.0.1:43123/video?path=%2Ftmp%2Fexample%20clip.mp4");
	});

	it("leaves remote URLs untouched", async () => {
		const result = await resolveMediaElementSource("https://example.com/video.mp4");

		expect(result.src).toBe("https://example.com/video.mp4");
		expect(readLocalFile).not.toHaveBeenCalled();
	});

	it("keeps local demuxer fallback on the range-streamed media URL", async () => {
		const source = await createFallbackDemuxerSource("/tmp/large-recording.mp4");

		expect(source).toBe("http://127.0.0.1:4321/video?path=%2Ftmp%2Flarge-recording.mp4");
		expect(readLocalFile).not.toHaveBeenCalled();
	});

	it("retains the readable File fallback for remote media", async () => {
		const fetchMock = vi.fn(async () => ({
			ok: true,
			blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: "video/mp4" }),
		}));
		vi.stubGlobal("fetch", fetchMock);

		try {
			const source = await createFallbackDemuxerSource("https://example.com/video.mp4");

			expect(source).toBeInstanceOf(File);
			expect(fetchMock).toHaveBeenCalledWith("https://example.com/video.mp4");
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("resolves bundled asset paths through getAssetPath", async () => {
		const getAssetBasePath = vi.fn(async () => "file:///opt/Recordly/resources/assets");
		Object.assign(globalThis, {
			window: {
				electronAPI: {
					readLocalFile,
					getLocalMediaUrl,
					getAssetBasePath,
				},
				location: { protocol: "file:" },
			},
		});

		const result = await resolveMediaElementSource("/sfx/click-crisp.mp3");
		expect(result.src).toBe("file:///opt/Recordly/resources/assets/sfx/click-crisp.mp3");
	});
});

describe("loadMediaArrayBuffer", () => {
	it("decodes data URLs directly to ArrayBuffer without fetch", async () => {
		const { loadMediaArrayBuffer } = await import("./localMediaSource");
		// Create a small base64 string
		const testBytes = new Uint8Array([10, 20, 30, 40, 50]);
		const binary = String.fromCharCode(...testBytes);
		const dataUrl = `data:audio/wav;base64,${btoa(binary)}`;

		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		try {
			const buffer = await loadMediaArrayBuffer(dataUrl);
			expect(fetchMock).not.toHaveBeenCalled();
			expect(new Uint8Array(buffer)).toEqual(testBytes);
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
