import { describe, expect, it, vi } from "vitest";
import {
	renderAnnotations,
	renderAnnotationToCanvas,
} from "./annotationRenderer";
import type { AnnotationRegion } from "@/components/video-editor/types";
import { DEFAULT_HIGHLIGHT_DATA } from "@/components/video-editor/types";

describe("annotationRenderer - highlight regions", () => {
	function createMockContext(): CanvasRenderingContext2D {
		return {
			save: vi.fn(),
			restore: vi.fn(),
			beginPath: vi.fn(),
			roundRect: vi.fn(),
			rect: vi.fn(),
			fill: vi.fn(),
			stroke: vi.fn(),
			clip: vi.fn(),
			setLineDash: vi.fn(),
			lineDashOffset: 0,
			fillStyle: "",
			strokeStyle: "",
			lineWidth: 1,
			globalAlpha: 1,
			shadowColor: "",
			shadowBlur: 0,
			createLinearGradient: vi.fn(() => ({
				addColorStop: vi.fn(),
			})),
			fillRect: vi.fn(),
			drawImage: vi.fn(),
		} as unknown as CanvasRenderingContext2D;
	}

	const sampleHighlight: AnnotationRegion = {
		id: "hl-1",
		startMs: 1000,
		endMs: 5000,
		type: "highlight",
		content: "",
		position: { x: 20, y: 30 },
		size: { width: 40, height: 25 },
		style: {
			color: "#FFFFFF",
			backgroundColor: "transparent",
			fontSize: 16,
			fontFamily: "sans-serif",
			fontWeight: "normal",
			fontStyle: "normal",
			textDecoration: "none",
			textAlign: "center",
			borderRadius: 8,
		},
		zIndex: 1,
		highlightData: {
			color: "#FACC15",
			fillOpacity: 0.25,
			borderColor: "#FACC15",
			borderWidth: 3,
			borderRadius: 8,
			borderStyle: "dashed",
			animation: "border-line",
			animationSpeed: 1.2,
			glowIntensity: 0.6,
			spotlightDim: 0.5,
		},
	};

	it("renders active highlight annotation at currentTimeMs", async () => {
		const ctx = createMockContext();
		await renderAnnotations(ctx, [sampleHighlight], 1920, 1080, 2000, 1.0);

		// Verified spotlight dim was drawn with evenodd fill
		expect(ctx.fill).toHaveBeenCalledWith("evenodd");
		// Verified roundRect was called for bounding box
		expect(ctx.roundRect).toHaveBeenCalled();
		// Verified line dash was set for border-line animation
		expect(ctx.setLineDash).toHaveBeenCalled();
		// Verified stroke was called for border
		expect(ctx.stroke).toHaveBeenCalled();
	});

	it("does not render highlight when timestamp is outside its span", async () => {
		const ctx = createMockContext();
		await renderAnnotations(ctx, [sampleHighlight], 1920, 1080, 500, 1.0);

		expect(ctx.roundRect).not.toHaveBeenCalled();
		expect(ctx.stroke).not.toHaveBeenCalled();
	});

	it("handles blink animation modulation", async () => {
		const ctx = createMockContext();
		const blinkHighlight: AnnotationRegion = {
			...sampleHighlight,
			highlightData: {
				...DEFAULT_HIGHLIGHT_DATA,
				animation: "blink",
				animationSpeed: 1,
			},
		};

		await renderAnnotations(ctx, [blinkHighlight], 1920, 1080, 2000, 1.0);
		expect(ctx.roundRect).toHaveBeenCalled();
		expect(ctx.stroke).toHaveBeenCalled();
	});

	it("handles shimmer animation gradient sweep", async () => {
		const ctx = createMockContext();
		const shimmerHighlight: AnnotationRegion = {
			...sampleHighlight,
			highlightData: {
				...DEFAULT_HIGHLIGHT_DATA,
				animation: "shimmer",
			},
		};

		await renderAnnotations(ctx, [shimmerHighlight], 1920, 1080, 2000, 1.0);
		expect(ctx.createLinearGradient).toHaveBeenCalled();
		expect(ctx.fillRect).toHaveBeenCalled();
	});

	it("handles neon glow animation with shadowBlur", async () => {
		const ctx = createMockContext();
		const glowHighlight: AnnotationRegion = {
			...sampleHighlight,
			highlightData: {
				...DEFAULT_HIGHLIGHT_DATA,
				animation: "glow",
				glowIntensity: 0.8,
			},
		};

		await renderAnnotations(ctx, [glowHighlight], 1920, 1080, 2000, 1.0);
		expect(ctx.stroke).toHaveBeenCalled();
	});
});
