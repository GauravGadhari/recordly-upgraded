import { describe, expect, it } from "vitest";
import { buildMediaOverlayAudioRegions } from "./mediaOverlayRenderer";

describe("buildMediaOverlayAudioRegions", () => {
	it("includes meme-video audio and transition SFX in the offline mix", () => {
		const regions = buildMediaOverlayAudioRegions(
			[
				{
					id: "meme-1",
					startMs: 1_000,
					endMs: 3_000,
					videoPath: "/media/meme.mp4",
					name: "Reaction",
					position: { x: 10, y: 10 },
					size: { width: 30, height: 30 },
					volume: 0.65,
				},
			],
			[
				{
					id: "transition-1",
					startMs: 4_000,
					endMs: 4_800,
					type: "fade-black",
					sfxAudioPath: "/media/whoosh.wav",
				},
			],
		);

		expect(regions).toEqual([
			expect.objectContaining({
				id: "meme-audio:meme-1",
				audioPath: "/media/meme.mp4",
				volume: 0.65,
			}),
			expect.objectContaining({
				id: "transition-sfx:transition-1",
				audioPath: "/media/whoosh.wav",
				volume: 0.9,
			}),
		]);
	});
});
