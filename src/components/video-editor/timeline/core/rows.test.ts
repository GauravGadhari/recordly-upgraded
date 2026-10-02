import { describe, expect, it } from "vitest";
import {
	getAnnotationTrackIndex,
	getAnnotationTrackRowId,
	getAudioTrackIndex,
	getAudioTrackRowId,
	getKeystrokeTrackIndex,
	getKeystrokeTrackRowId,
	getMemeTrackIndex,
	getMemeTrackRowId,
	getTransitionTrackIndex,
	getTransitionTrackRowId,
	isAnnotationTrackRowId,
	isAudioTrackRowId,
	isKeystrokeTrackRowId,
	isMemeTrackRowId,
	isTransitionTrackRowId,
} from "./rows";

describe("timeline core/rows", () => {
	it("builds and parses annotation rows", () => {
		expect(getAnnotationTrackRowId(2.9)).toBe("row-annotation-2");
		expect(getAnnotationTrackRowId(-5)).toBe("row-annotation-0");
		expect(getAnnotationTrackIndex("row-annotation-4")).toBe(4);
		expect(getAnnotationTrackIndex("row-annotation")).toBe(0);
		expect(isAnnotationTrackRowId("row-annotation")).toBe(true);
		expect(isAnnotationTrackRowId("row-annotation-1")).toBe(true);
	});

	it("handles invalid annotation row IDs safely", () => {
		expect(getAnnotationTrackIndex("row-annotation-foo")).toBe(0);
		expect(getAnnotationTrackIndex("other")).toBe(0);
		expect(isAnnotationTrackRowId("row-audio-1")).toBe(false);
	});

	it("builds and parses audio rows", () => {
		expect(getAudioTrackRowId(1.2)).toBe("row-audio-1");
		expect(getAudioTrackRowId(-3)).toBe("row-audio-0");
		expect(getAudioTrackIndex("row-audio-3")).toBe(3);
		expect(getAudioTrackIndex("row-audio")).toBe(0);
		expect(isAudioTrackRowId("row-audio")).toBe(true);
		expect(isAudioTrackRowId("row-audio-1")).toBe(true);
	});

	it("handles invalid audio row IDs safely", () => {
		expect(getAudioTrackIndex("row-audio-foo")).toBe(0);
		expect(getAudioTrackIndex("other")).toBe(0);
		expect(isAudioTrackRowId("row-annotation-1")).toBe(false);
	});

	it("builds and parses keystroke rows", () => {
		expect(getKeystrokeTrackRowId(0)).toBe("row-keystrokes");
		expect(getKeystrokeTrackRowId(1.2)).toBe("row-keystrokes-1");
		expect(getKeystrokeTrackRowId(-3)).toBe("row-keystrokes");
		expect(getKeystrokeTrackIndex("row-keystrokes-2")).toBe(2);
		expect(getKeystrokeTrackIndex("row-keystrokes")).toBe(0);
		expect(isKeystrokeTrackRowId("row-keystrokes")).toBe(true);
		expect(isKeystrokeTrackRowId("row-keystrokes-1")).toBe(true);
		expect(isKeystrokeTrackRowId("row-annotation-1")).toBe(false);
		expect(getKeystrokeTrackIndex("row-keystrokes-foo")).toBe(0);
	});

	it("builds and parses transition rows", () => {
		expect(getTransitionTrackRowId(0)).toBe("row-transitions");
		expect(getTransitionTrackRowId(1.5)).toBe("row-transitions-1");
		expect(getTransitionTrackIndex("row-transitions-2")).toBe(2);
		expect(getTransitionTrackIndex("row-transitions")).toBe(0);
		expect(isTransitionTrackRowId("row-transitions")).toBe(true);
		expect(isTransitionTrackRowId("row-transitions-1")).toBe(true);
		expect(isTransitionTrackRowId("row-audio")).toBe(false);
	});

	it("builds and parses meme rows", () => {
		expect(getMemeTrackRowId(0)).toBe("row-memes");
		expect(getMemeTrackRowId(1)).toBe("row-memes-1");
		expect(getMemeTrackIndex("row-memes-3")).toBe(3);
		expect(getMemeTrackIndex("row-memes")).toBe(0);
		expect(isMemeTrackRowId("row-memes")).toBe(true);
		expect(isMemeTrackRowId("row-memes-1")).toBe(true);
		expect(isMemeTrackRowId("row-clip")).toBe(false);
	});
});
