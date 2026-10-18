import { useTimelineContext } from "dnd-timeline";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CursorTelemetryPoint } from "@/components/video-editor/types";

interface WhooshMovementWaveformProps {
	cursorTelemetry: CursorTelemetryPoint[];
	videoDurationMs: number;
	threshold?: number;
	onThresholdChange?: (newThreshold: number) => void;
	className?: string;
}

interface SmoothedVelocityPoint {
	timeMs: number;
	velocity: number; // in screen-widths / second
}

/**
 * Mathematically calculates a continuous, smoothed mouse movement speed curve from cursor telemetry.
 * Applies Gaussian moving-window smoothing to guarantee C^1 continuity and eliminate sampling jitter.
 */
function computeSmoothedVelocityCurve(
	telemetry: CursorTelemetryPoint[],
	sigmaMs = 40,
): SmoothedVelocityPoint[] {
	if (telemetry.length < 2) return [];

	// 1. Calculate raw point-to-point velocities
	const rawPoints: { timeMs: number; v: number }[] = [];
	for (let i = 1; i < telemetry.length; i++) {
		const p0 = telemetry[i - 1];
		const p1 = telemetry[i];
		const dt = (p1.timeMs - p0.timeMs) / 1000;
		if (dt <= 0.002 || dt > 0.5) continue;

		const dist = Math.hypot(p1.cx - p0.cx, p1.cy - p0.cy);
		const v = dist / dt;
		const midTime = (p0.timeMs + p1.timeMs) / 2;
		rawPoints.push({ timeMs: midTime, v });
	}

	if (rawPoints.length === 0) return [];

	// 2. Gaussian kernel smoothing across a ±2.5*sigma window
	const smoothed: SmoothedVelocityPoint[] = [];
	const windowSizeMs = sigmaMs * 2.5;
	const twoSigmaSq = 2 * sigmaMs * sigmaMs;

	for (let i = 0; i < rawPoints.length; i++) {
		const targetTime = rawPoints[i].timeMs;
		let weightedSum = 0;
		let weightTotal = 0;

		// Expand backwards
		let j = i;
		while (j >= 0 && targetTime - rawPoints[j].timeMs <= windowSizeMs) {
			const diff = targetTime - rawPoints[j].timeMs;
			const weight = Math.exp(-(diff * diff) / twoSigmaSq);
			weightedSum += rawPoints[j].v * weight;
			weightTotal += weight;
			j--;
		}

		// Expand forwards
		j = i + 1;
		while (j < rawPoints.length && rawPoints[j].timeMs - targetTime <= windowSizeMs) {
			const diff = rawPoints[j].timeMs - targetTime;
			const weight = Math.exp(-(diff * diff) / twoSigmaSq);
			weightedSum += rawPoints[j].v * weight;
			weightTotal += weight;
			j++;
		}

		const smoothV = weightTotal > 0 ? weightedSum / weightTotal : rawPoints[i].v;
		smoothed.push({ timeMs: targetTime, velocity: smoothV });
	}

	return smoothed;
}

/**
 * Binary search to find interpolated velocity at any arbitrary timestamp t.
 */
function sampleVelocityAtTime(points: SmoothedVelocityPoint[], timeMs: number): number {
	if (points.length === 0) return 0;
	if (timeMs <= points[0].timeMs) return points[0].velocity;
	if (timeMs >= points[points.length - 1].timeMs) return points[points.length - 1].velocity;

	let low = 0;
	let high = points.length - 1;
	while (low <= high) {
		const mid = (low + high) >> 1;
		if (points[mid].timeMs < timeMs) {
			low = mid + 1;
		} else {
			high = mid - 1;
		}
	}

	const idx0 = Math.max(0, low - 1);
	const idx1 = Math.min(points.length - 1, low);
	if (idx0 === idx1) return points[idx0].velocity;

	const p0 = points[idx0];
	const p1 = points[idx1];
	const span = Math.max(1, p1.timeMs - p0.timeMs);
	const alpha = Math.max(0, Math.min(1, (timeMs - p0.timeMs) / span));

	// Smooth Hermite blend
	const smoothAlpha = alpha * alpha * (3 - 2 * alpha);
	return p0.velocity + (p1.velocity - p0.velocity) * smoothAlpha;
}

export function WhooshMovementWaveform({
	cursorTelemetry,
	videoDurationMs,
	threshold = 1.6,
	onThresholdChange,
	className,
}: WhooshMovementWaveformProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const { range } = useTimelineContext();
	const [activeThreshold, setActiveThreshold] = useState(threshold);
	const [isDraggingThreshold, setIsDraggingThreshold] = useState(false);
	const [resizeKey, setResizeKey] = useState(0);

	// Synchronize incoming threshold prop when not actively dragging
	useEffect(() => {
		if (!isDraggingThreshold) {
			setActiveThreshold(threshold);
		}
	}, [threshold, isDraggingThreshold]);

	// Pre-calculate mathematically smoothed continuous curve
	const smoothedCurve = useMemo(() => {
		return computeSmoothedVelocityCurve(cursorTelemetry, 45);
	}, [cursorTelemetry]);

	// Observe container size
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const ro = new ResizeObserver(() => setResizeKey((k) => k + 1));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	// Maximum scale velocity
	const maxScaleVelocity = useMemo(() => {
		let maxV = 2.4;
		for (const pt of smoothedCurve) {
			if (pt.velocity > maxV) maxV = pt.velocity;
		}
		return Math.max(2.8, Math.min(6.0, maxV * 1.15));
	}, [smoothedCurve]);

	// Draw high-DPI waveform curve
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const rect = canvas.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;
		const width = Math.round(rect.width * dpr);
		const height = Math.round(rect.height * dpr);
		if (width === 0 || height === 0) return;

		canvas.width = width;
		canvas.height = height;
		ctx.clearRect(0, 0, width, height);

		if (smoothedCurve.length === 0 || videoDurationMs <= 0) return;

		const visibleStartMs = range.start;
		const visibleEndMs = range.end;
		const visibleDurationMs = visibleEndMs - visibleStartMs;
		if (visibleDurationMs <= 0) return;

		const topPad = 5 * dpr;
		const bottomPad = 4 * dpr;
		const usableHeight = height - topPad - bottomPad;
		const baselineY = height - bottomPad;

		// 1. Calculate Y coordinates across all pixel columns
		const points: { x: number; y: number; v: number }[] = [];
		const step = Math.max(1, Math.round(dpr));

		for (let px = 0; px <= width; px += step) {
			const t = visibleStartMs + (px / width) * visibleDurationMs;
			let v = 0;
			if (t >= 0 && t <= videoDurationMs) {
				v = sampleVelocityAtTime(smoothedCurve, t);
			}

			const normalizedV = Math.max(0, Math.min(1, v / maxScaleVelocity));
			// Exponential curve mapping for natural tactile feel
			const curveH = Math.pow(normalizedV, 0.88) * usableHeight;
			const y = baselineY - curveH;
			points.push({ x: px, y, v });
		}

		if (points.length < 2) return;

		// 2. Render filled gradient area under curve
		ctx.save();
		ctx.beginPath();
		ctx.moveTo(points[0].x, baselineY);
		ctx.lineTo(points[0].x, points[0].y);

		for (let i = 1; i < points.length; i++) {
			ctx.lineTo(points[i].x, points[i].y);
		}
		ctx.lineTo(points[points.length - 1].x, baselineY);
		ctx.closePath();

		const gradient = ctx.createLinearGradient(0, topPad, 0, baselineY);
		gradient.addColorStop(0, "rgba(16, 185, 129, 0.42)");
		gradient.addColorStop(0.45, "rgba(6, 182, 212, 0.22)");
		gradient.addColorStop(0.85, "rgba(16, 185, 129, 0.08)");
		gradient.addColorStop(1, "rgba(16, 185, 129, 0.01)");
		ctx.fillStyle = gradient;
		ctx.fill();

		// 3. Render crisp glowing stroke line on top
		ctx.beginPath();
		ctx.moveTo(points[0].x, points[0].y);
		for (let i = 1; i < points.length; i++) {
			ctx.lineTo(points[i].x, points[i].y);
		}
		ctx.strokeStyle = "rgba(52, 211, 153, 0.95)";
		ctx.lineWidth = 1.75 * dpr;
		ctx.shadowColor = "rgba(16, 185, 129, 0.65)";
		ctx.shadowBlur = 4 * dpr;
		ctx.stroke();
		ctx.restore();

		// 4. Render horizontal threshold trigger guideline
		const normThresh = Math.max(0, Math.min(1, activeThreshold / maxScaleVelocity));
		const threshH = Math.pow(normThresh, 0.88) * usableHeight;
		const threshY = baselineY - threshH;

		ctx.save();
		ctx.beginPath();
		ctx.setLineDash([4 * dpr, 4 * dpr]);
		ctx.moveTo(0, threshY);
		ctx.lineTo(width, threshY);
		ctx.strokeStyle = isDraggingThreshold
			? "rgba(52, 211, 153, 0.85)"
			: "rgba(52, 211, 153, 0.38)";
		ctx.lineWidth = (isDraggingThreshold ? 1.5 : 1) * dpr;
		ctx.stroke();
		ctx.restore();
	}, [
		smoothedCurve,
		range.start,
		range.end,
		videoDurationMs,
		maxScaleVelocity,
		activeThreshold,
		isDraggingThreshold,
		resizeKey,
	]);

	// Interactive handle position in CSS pixels
	const containerRect = containerRef.current?.getBoundingClientRect();
	const cssHeight = containerRect?.height ?? 40;
	const normThresh = Math.max(0, Math.min(1, activeThreshold / maxScaleVelocity));
	const usableCssHeight = Math.max(16, cssHeight - 9);
	const threshCssY = cssHeight - 4 - Math.pow(normThresh, 0.88) * usableCssHeight;

	// Dragging threshold interaction
	const handlePointerDown = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			event.stopPropagation();
			event.preventDefault();
			const target = event.currentTarget;
			target.setPointerCapture(event.pointerId);
			setIsDraggingThreshold(true);

			const container = containerRef.current;
			if (!container) return;

			let currentVal = activeThreshold;

			const onPointerMove = (e: PointerEvent) => {
				const rect = container.getBoundingClientRect();
				const topPad = 5;
				const bottomPad = 4;
				const usableH = Math.max(10, rect.height - topPad - bottomPad);
				const relY = Math.max(topPad, Math.min(rect.height - bottomPad, e.clientY - rect.top));

				// Invert Y: bottom is 0, top is maxScaleVelocity
				const normFromBottom = Math.max(0, Math.min(1, (rect.height - bottomPad - relY) / usableH));
				const linearNorm = Math.pow(normFromBottom, 1 / 0.88);
				const newThreshold = Math.max(0.4, Math.min(3.8, linearNorm * maxScaleVelocity));
				const rounded = Math.round(newThreshold * 10) / 10;
				currentVal = rounded;
				setActiveThreshold(rounded);
			};

			const onPointerUp = (e: PointerEvent) => {
				try {
					target.releasePointerCapture(e.pointerId);
				} catch {}
				window.removeEventListener("pointermove", onPointerMove);
				window.removeEventListener("pointerup", onPointerUp);
				setIsDraggingThreshold(false);
				onThresholdChange?.(currentVal);
			};

			window.addEventListener("pointermove", onPointerMove);
			window.addEventListener("pointerup", onPointerUp);
		},
		[activeThreshold, maxScaleVelocity, onThresholdChange],
	);

	if (cursorTelemetry.length < 2) return null;

	return (
		<div
			ref={containerRef}
			className={`absolute inset-0 pointer-events-none select-none overflow-hidden ${className ?? ""}`}
		>
			{/* Canvas wave curve */}
			<canvas ref={canvasRef} className="w-full h-full block" />

			{/* Draggable Threshold Handle & Pill */}
			<div
				className="absolute left-3 z-30 flex items-center gap-1.5 cursor-ns-resize select-none pointer-events-auto transition-transform duration-75"
				style={{
					top: `${Math.round(threshCssY)}px`,
					transform: "translateY(-50%)",
				}}
				onPointerDown={handlePointerDown}
				title="Drag vertically to customize whoosh movement sensitivity"
			>
				<div
					className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border shadow-md backdrop-blur-md transition-all ${
						isDraggingThreshold
							? "bg-emerald-500/35 border-emerald-400 text-emerald-200 scale-105 shadow-emerald-500/25 ring-2 ring-emerald-500/30"
							: "bg-emerald-950/70 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/80 hover:border-emerald-400"
					}`}
				>
					<span
						className={`w-1.5 h-1.5 rounded-full bg-emerald-400 ${
							isDraggingThreshold ? "animate-ping" : "animate-pulse"
						}`}
					/>
					<span className="text-[10px] font-semibold tracking-wide">
						Whoosh Speed: {activeThreshold.toFixed(1)}x
					</span>
					<span className="text-[9px] opacity-70">↕</span>
				</div>
			</div>
		</div>
	);
}
