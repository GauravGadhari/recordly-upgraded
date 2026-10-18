import { useTimelineContext } from "dnd-timeline";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CursorTelemetryPoint } from "@/components/video-editor/types";
import {
	evaluateCurveMultiplierAtTime,
	type WhooshCurvePoint,
} from "../../sfxSuggestionUtils";
import { ArrowsIn, ArrowUUpLeft, Sparkle } from "@phosphor-icons/react";

export interface WhooshCurveEditorProps {
	cursorTelemetry: CursorTelemetryPoint[];
	videoDurationMs: number;
	threshold?: number;
	onThresholdChange?: (newThreshold: number) => void;
	curvePoints?: WhooshCurvePoint[];
	onCurvePointsChange?: (newPoints: WhooshCurvePoint[]) => void;
	isOpen?: boolean;
	onToggleOpen?: (open: boolean) => void;
	currentTimeMs?: number;
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
 * Binary search to sample raw velocity curve at any timestamp t.
 */
function sampleRawVelocityAtTime(points: SmoothedVelocityPoint[], timeMs: number): number {
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

/**
 * Detects local velocity peaks in the smoothed curve to automatically place initial keyframe control points.
 */
function detectNaturalVelocityPeaks(
	smoothed: SmoothedVelocityPoint[],
	minPeakVelocity = 0.8,
	minDistanceMs = 600,
): WhooshCurvePoint[] {
	if (smoothed.length < 3) return [];
	const peaks: WhooshCurvePoint[] = [];
	let lastPeakTime = -99999;

	for (let i = 1; i < smoothed.length - 1; i++) {
		const prev = smoothed[i - 1].velocity;
		const curr = smoothed[i].velocity;
		const next = smoothed[i + 1].velocity;

		if (curr >= minPeakVelocity && curr >= prev && curr >= next) {
			const timeMs = Math.round(smoothed[i].timeMs);
			if (timeMs - lastPeakTime >= minDistanceMs) {
				peaks.push({
					id: `peak-${timeMs}`,
					timeMs,
					multiplier: 1.0,
				});
				lastPeakTime = timeMs;
			}
		}
	}

	return peaks;
}

export function WhooshCurveEditor({
	cursorTelemetry,
	videoDurationMs,
	threshold = 1.6,
	onThresholdChange,
	curvePoints,
	onCurvePointsChange,
	isOpen = false,
	onToggleOpen,
	currentTimeMs,
	className,
}: WhooshCurveEditorProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const { range } = useTimelineContext();
	const [activeThreshold, setActiveThreshold] = useState(threshold);
	const [isDraggingThreshold, setIsDraggingThreshold] = useState(false);
	const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
	const [draggingPointId, setDraggingPointId] = useState<string | null>(null);
	const [resizeKey, setResizeKey] = useState(0);

	// Synchronize threshold prop
	useEffect(() => {
		if (!isDraggingThreshold) {
			setActiveThreshold(threshold);
		}
	}, [threshold, isDraggingThreshold]);

	// Pre-calculate mathematically smoothed baseline velocity curve
	const baseCurve = useMemo(() => {
		return computeSmoothedVelocityCurve(cursorTelemetry, 45);
	}, [cursorTelemetry]);

	// Effective curve points: if none provided, detect natural peaks from mouse telemetry
	const naturalPeaks = useMemo(() => {
		return detectNaturalVelocityPeaks(baseCurve);
	}, [baseCurve]);

	const effectiveCurvePoints = useMemo(() => {
		if (curvePoints && curvePoints.length > 0) {
			return curvePoints;
		}
		return naturalPeaks;
	}, [curvePoints, naturalPeaks]);

	// Observe container size
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const ro = new ResizeObserver(() => setResizeKey((k) => k + 1));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	// Maximum scale velocity for Y mapping
	const maxScaleVelocity = useMemo(() => {
		let maxV = 2.4;
		for (const pt of baseCurve) {
			const mod = evaluateCurveMultiplierAtTime(effectiveCurvePoints, pt.timeMs);
			const effectiveV = pt.velocity * mod;
			if (effectiveV > maxV) maxV = effectiveV;
		}
		return Math.max(3.0, Math.min(6.5, maxV * 1.2));
	}, [baseCurve, effectiveCurvePoints]);

	// Canvas rendering of velocity curve and grid
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

		if (baseCurve.length === 0 || videoDurationMs <= 0) return;

		const visibleStartMs = range.start;
		const visibleEndMs = range.end;
		const visibleDurationMs = visibleEndMs - visibleStartMs;
		if (visibleDurationMs <= 0) return;

		const topPad = (isOpen ? 28 : 5) * dpr;
		const bottomPad = 4 * dpr;
		const usableHeight = height - topPad - bottomPad;
		const baselineY = height - bottomPad;

		// 1. In expanded mode, render subtle velocity grid guidelines
		if (isOpen) {
			ctx.save();
			ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
			ctx.lineWidth = 1 * dpr;
			ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
			ctx.font = `${Math.round(9 * dpr)}px sans-serif`;

			const gridSteps = [1.0, 2.0, 3.0];
			for (const stepVal of gridSteps) {
				if (stepVal > maxScaleVelocity) continue;
				const normStep = Math.max(0, Math.min(1, stepVal / maxScaleVelocity));
				const gridY = baselineY - Math.pow(normStep, 0.88) * usableHeight;

				ctx.beginPath();
				ctx.setLineDash([2 * dpr, 4 * dpr]);
				ctx.moveTo(0, gridY);
				ctx.lineTo(width, gridY);
				ctx.stroke();

				ctx.fillText(`${stepVal.toFixed(1)}x`, 6 * dpr, gridY - 2 * dpr);
			}
			ctx.restore();
		}

		// 2. Calculate modulated curve points
		const points: { x: number; y: number; v: number }[] = [];
		const step = Math.max(1, Math.round(dpr));

		for (let px = 0; px <= width; px += step) {
			const t = visibleStartMs + (px / width) * visibleDurationMs;
			let v = 0;
			if (t >= 0 && t <= videoDurationMs) {
				const baseV = sampleRawVelocityAtTime(baseCurve, t);
				const multiplier = evaluateCurveMultiplierAtTime(effectiveCurvePoints, t);
				v = baseV * multiplier;
			}

			const normalizedV = Math.max(0, Math.min(1, v / maxScaleVelocity));
			const curveH = Math.pow(normalizedV, 0.88) * usableHeight;
			const y = baselineY - curveH;
			points.push({ x: px, y, v });
		}

		if (points.length < 2) return;

		// 3. Render filled gradient area under curve
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
		gradient.addColorStop(0, isOpen ? "rgba(16, 185, 129, 0.48)" : "rgba(16, 185, 129, 0.38)");
		gradient.addColorStop(0.45, "rgba(6, 182, 212, 0.22)");
		gradient.addColorStop(0.85, "rgba(16, 185, 129, 0.08)");
		gradient.addColorStop(1, "rgba(16, 185, 129, 0.01)");
		ctx.fillStyle = gradient;
		ctx.fill();

		// 4. Render crisp glowing stroke line on top
		ctx.beginPath();
		ctx.moveTo(points[0].x, points[0].y);
		for (let i = 1; i < points.length; i++) {
			ctx.lineTo(points[i].x, points[i].y);
		}
		ctx.strokeStyle = isOpen ? "rgba(52, 211, 153, 0.98)" : "rgba(52, 211, 153, 0.85)";
		ctx.lineWidth = (isOpen ? 2.2 : 1.75) * dpr;
		ctx.shadowColor = "rgba(16, 185, 129, 0.75)";
		ctx.shadowBlur = (isOpen ? 6 : 4) * dpr;
		ctx.stroke();
		ctx.restore();

		// 5. Render horizontal threshold trigger guideline
		const normThresh = Math.max(0, Math.min(1, activeThreshold / maxScaleVelocity));
		const threshH = Math.pow(normThresh, 0.88) * usableHeight;
		const threshY = baselineY - threshH;

		ctx.save();
		ctx.beginPath();
		ctx.setLineDash([4 * dpr, 4 * dpr]);
		ctx.moveTo(0, threshY);
		ctx.lineTo(width, threshY);
		ctx.strokeStyle = isDraggingThreshold
			? "rgba(52, 211, 153, 0.9)"
			: "rgba(52, 211, 153, 0.42)";
		ctx.lineWidth = (isDraggingThreshold ? 1.75 : 1.2) * dpr;
		ctx.stroke();
		ctx.restore();

		// 6. Playhead needle line if currentTimeMs is in view
		if (currentTimeMs !== undefined && currentTimeMs >= visibleStartMs && currentTimeMs <= visibleEndMs) {
			const playheadX = ((currentTimeMs - visibleStartMs) / visibleDurationMs) * width;
			ctx.save();
			ctx.beginPath();
			ctx.moveTo(playheadX, 0);
			ctx.lineTo(playheadX, height);
			ctx.strokeStyle = "rgba(239, 68, 68, 0.65)";
			ctx.lineWidth = 1 * dpr;
			ctx.stroke();
			ctx.restore();
		}
	}, [
		baseCurve,
		effectiveCurvePoints,
		range.start,
		range.end,
		videoDurationMs,
		maxScaleVelocity,
		activeThreshold,
		isDraggingThreshold,
		isOpen,
		currentTimeMs,
		resizeKey,
	]);

	// Interactive handle position in CSS pixels for threshold line
	const containerRect = containerRef.current?.getBoundingClientRect();
	const cssHeight = containerRect?.height ?? (isOpen ? 175 : 40);
	const normThresh = Math.max(0, Math.min(1, activeThreshold / maxScaleVelocity));
	const topPadCss = isOpen ? 28 : 5;
	const bottomPadCss = 4;
	const usableCssHeight = Math.max(16, cssHeight - topPadCss - bottomPadCss);
	const threshCssY = cssHeight - bottomPadCss - Math.pow(normThresh, 0.88) * usableCssHeight;

	// Dragging threshold interaction
	const handleThresholdPointerDown = useCallback(
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
				const usableH = Math.max(10, rect.height - topPadCss - bottomPadCss);
				const relY = Math.max(topPadCss, Math.min(rect.height - bottomPadCss, e.clientY - rect.top));

				const normFromBottom = Math.max(0, Math.min(1, (rect.height - bottomPadCss - relY) / usableH));
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
		[activeThreshold, maxScaleVelocity, onThresholdChange, topPadCss, bottomPadCss],
	);

	// Keyframe node positions in CSS coordinates
	const visibleDurationMs = range.end - range.start;
	const containerWidth = containerRect?.width ?? 800;

	const keyframeNodes = useMemo(() => {
		if (visibleDurationMs <= 0 || containerWidth <= 0) return [];

		return effectiveCurvePoints.map((pt) => {
			const relX = ((pt.timeMs - range.start) / visibleDurationMs) * containerWidth;
			const baseV = sampleRawVelocityAtTime(baseCurve, pt.timeMs);
			const effectiveV = baseV * pt.multiplier;
			const normV = Math.max(0, Math.min(1, effectiveV / maxScaleVelocity));
			const y = cssHeight - bottomPadCss - Math.pow(normV, 0.88) * usableCssHeight;

			return {
				...pt,
				cssX: relX,
				cssY: y,
				baseV,
				effectiveV,
			};
		});
	}, [
		effectiveCurvePoints,
		baseCurve,
		range.start,
		visibleDurationMs,
		containerWidth,
		maxScaleVelocity,
		cssHeight,
		bottomPadCss,
		usableCssHeight,
	]);

	// Keyframe dragging handler
	const handleKeyframePointerDown = useCallback(
		(pt: WhooshCurvePoint, event: React.PointerEvent<HTMLDivElement>) => {
			event.stopPropagation();
			event.preventDefault();
			const target = event.currentTarget;
			target.setPointerCapture(event.pointerId);
			setSelectedPointId(pt.id);
			setDraggingPointId(pt.id);

			const container = containerRef.current;
			if (!container) return;

			let latestPoints = [...effectiveCurvePoints];

			const onPointerMove = (e: PointerEvent) => {
				const rect = container.getBoundingClientRect();
				const relX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
				const relY = Math.max(topPadCss, Math.min(rect.height - bottomPadCss, e.clientY - rect.top));

				// 1. Calculate new timeMs
				const newTimeMs = Math.round(range.start + (relX / rect.width) * visibleDurationMs);
				const clampedTime = Math.max(0, Math.min(videoDurationMs, newTimeMs));

				// 2. Calculate new multiplier from vertical drag
				const usableH = Math.max(10, rect.height - topPadCss - bottomPadCss);
				const normFromBottom = Math.max(0, Math.min(1, (rect.height - bottomPadCss - relY) / usableH));
				const linearNorm = Math.pow(normFromBottom, 1 / 0.88);
				const targetV = linearNorm * maxScaleVelocity;

				const baseV = Math.max(0.2, sampleRawVelocityAtTime(baseCurve, clampedTime));
				const newMultiplier = Math.max(0.1, Math.min(3.5, Math.round((targetV / baseV) * 100) / 100));

				latestPoints = latestPoints.map((item) => {
					if (item.id === pt.id) {
						return { ...item, timeMs: clampedTime, multiplier: newMultiplier };
					}
					return item;
				});

				onCurvePointsChange?.(latestPoints);
			};

			const onPointerUp = (e: PointerEvent) => {
				try {
					target.releasePointerCapture(e.pointerId);
				} catch {}
				window.removeEventListener("pointermove", onPointerMove);
				window.removeEventListener("pointerup", onPointerUp);
				setDraggingPointId(null);
				onCurvePointsChange?.(latestPoints);
			};

			window.addEventListener("pointermove", onPointerMove);
			window.addEventListener("pointerup", onPointerUp);
		},
		[
			effectiveCurvePoints,
			topPadCss,
			bottomPadCss,
			range.start,
			visibleDurationMs,
			videoDurationMs,
			maxScaleVelocity,
			baseCurve,
			onCurvePointsChange,
		],
	);

	// Add keyframe by double-clicking or clicking on curve in expanded mode
	const handleCanvasDoubleClick = useCallback(
		(event: React.MouseEvent<HTMLDivElement>) => {
			if (!isOpen) {
				onToggleOpen?.(true);
				return;
			}

			const container = containerRef.current;
			if (!container) return;
			const rect = container.getBoundingClientRect();
			const relX = event.clientX - rect.left;
			const timeMs = Math.round(range.start + (relX / rect.width) * visibleDurationMs);
			if (timeMs < 0 || timeMs > videoDurationMs) return;

			const newPoint: WhooshCurvePoint = {
				id: `custom-${Date.now()}`,
				timeMs,
				multiplier: 1.0,
			};

			const next = [...effectiveCurvePoints, newPoint].sort((a, b) => a.timeMs - b.timeMs);
			onCurvePointsChange?.(next);
			setSelectedPointId(newPoint.id);
		},
		[isOpen, range.start, visibleDurationMs, videoDurationMs, effectiveCurvePoints, onCurvePointsChange, onToggleOpen],
	);

	// Presets
	const applyPreset = useCallback(
		(preset: "raw" | "dramatic" | "subtle" | "punchy") => {
			let mult = 1.0;
			if (preset === "dramatic") mult = 1.45;
			if (preset === "subtle") mult = 0.65;
			if (preset === "punchy") mult = 1.8;

			const updated = effectiveCurvePoints.map((pt) => ({
				...pt,
				multiplier: mult,
			}));
			onCurvePointsChange?.(updated);
		},
		[effectiveCurvePoints, onCurvePointsChange],
	);

	// Reset curve points
	const handleResetCurve = useCallback(() => {
		onCurvePointsChange?.(naturalPeaks);
	}, [naturalPeaks, onCurvePointsChange]);

	if (cursorTelemetry.length < 2) {
		return (
			<div
				ref={containerRef}
				className={`absolute inset-0 flex items-center justify-center select-none pointer-events-none text-muted-foreground/30 text-xs ${className ?? ""}`}
			>
				<span>No mouse movement tracking available for curve</span>
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			className={`absolute inset-0 select-none overflow-hidden transition-all duration-200 ${
				isOpen
					? "bg-emerald-950/20 backdrop-blur-[2px] border-y border-emerald-500/20"
					: "bg-transparent cursor-pointer"
			} ${className ?? ""}`}
			onDoubleClick={handleCanvasDoubleClick}
			onClick={!isOpen ? () => onToggleOpen?.(true) : undefined}
		>
			{/* High-DPI Waveform and Graph Canvas */}
			<canvas ref={canvasRef} className="w-full h-full block pointer-events-none" />

			{/* Top HUD Toolbar (Visible in Expanded Mode) */}
			{isOpen && (
				<div className="absolute top-1.5 left-2 right-2 z-30 flex items-center justify-between pointer-events-auto">
					<div className="flex items-center gap-2">
						<span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30 shadow-sm">
							<Sparkle className="w-3 h-3 text-emerald-400 animate-pulse" />
							<span>Whoosh Curve Editor</span>
						</span>
						<span className="text-[10px] text-muted-foreground/80 hidden sm:inline">
							Drag nodes vertically to scale speed • Click curve to add keyframe
						</span>
					</div>

					<div className="flex items-center gap-1.5 bg-black/70 backdrop-blur-md px-1.5 py-0.5 rounded-md border border-foreground/10 text-[10px]">
						<span className="text-muted-foreground/60 px-1 font-medium">Preset:</span>
						<button
							type="button"
							onClick={() => applyPreset("raw")}
							className="px-1.5 py-0.5 rounded hover:bg-emerald-500/20 text-foreground/80 hover:text-emerald-300 transition-colors"
							title="Reset multipliers to 1.0 (Raw Mouse Math)"
						>
							Raw
						</button>
						<button
							type="button"
							onClick={() => applyPreset("dramatic")}
							className="px-1.5 py-0.5 rounded hover:bg-emerald-500/20 text-foreground/80 hover:text-emerald-300 transition-colors"
							title="Boost whooshes (+45%)"
						>
							Dramatic
						</button>
						<button
							type="button"
							onClick={() => applyPreset("subtle")}
							className="px-1.5 py-0.5 rounded hover:bg-emerald-500/20 text-foreground/80 hover:text-emerald-300 transition-colors"
							title="Soft whooshes (-35%)"
						>
							Subtle
						</button>
						<button
							type="button"
							onClick={handleResetCurve}
							className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition-colors ml-1 border-l border-foreground/10 pl-2"
							title="Reset all control points"
						>
							<ArrowUUpLeft className="w-2.5 h-2.5" />
							<span>Reset</span>
						</button>
						<button
							type="button"
							onClick={() => onToggleOpen?.(false)}
							className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/40 transition-colors ml-1 font-semibold"
							title="Collapse Curve Editor"
						>
							<ArrowsIn className="w-3 h-3" />
							<span>Done</span>
						</button>
					</div>
				</div>
			)}

			{/* Collapsed Mode: Clickable Indicator Badge */}
			{!isOpen && (
				<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
					<div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-500/30 text-emerald-300/90 text-[10px] font-semibold tracking-wide shadow-sm backdrop-blur-sm pointer-events-auto cursor-pointer transition-transform hover:scale-105">
						<span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
						<span>Whoosh Curve Editor</span>
						<span className="text-[9px] text-emerald-400/70 font-normal">
							(Click to open speed graph)
						</span>
					</div>
				</div>
			)}

			{/* Draggable Threshold Handle & Guide */}
			<div
				className="absolute left-3 z-30 flex items-center gap-1.5 cursor-ns-resize select-none pointer-events-auto transition-transform duration-75"
				style={{
					top: `${Math.round(threshCssY)}px`,
					transform: "translateY(-50%)",
				}}
				onPointerDown={handleThresholdPointerDown}
				title="Drag vertically to customize whoosh speed trigger threshold"
			>
				<div
					className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border shadow-md backdrop-blur-md transition-all ${
						isDraggingThreshold
							? "bg-emerald-500/40 border-emerald-400 text-emerald-100 scale-105 shadow-emerald-500/30 ring-2 ring-emerald-500/40"
							: "bg-emerald-950/80 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/90 hover:border-emerald-400"
					}`}
				>
					<span
						className={`w-1.5 h-1.5 rounded-full bg-emerald-400 ${
							isDraggingThreshold ? "animate-ping" : "animate-pulse"
						}`}
					/>
					<span className="text-[10px] font-semibold tracking-wide">
						Trigger: {activeThreshold.toFixed(1)}x
					</span>
					<span className="text-[9px] opacity-70">↕</span>
				</div>
			</div>

			{/* Interactive Keyframe Nodes (Visible in Expanded Mode) */}
			{isOpen &&
				keyframeNodes.map((node) => {
					if (node.cssX < -20 || node.cssX > containerWidth + 20) return null;
					const isSelected = selectedPointId === node.id;
					const isDragging = draggingPointId === node.id;

					return (
						<div
							key={node.id}
							className="absolute z-40 cursor-grab active:cursor-grabbing pointer-events-auto select-none group"
							style={{
								left: `${Math.round(node.cssX)}px`,
								top: `${Math.round(node.cssY)}px`,
								transform: "translate(-50%, -50%)",
							}}
							onPointerDown={(e) => handleKeyframePointerDown(node, e)}
							onContextMenu={(e) => {
								e.preventDefault();
								e.stopPropagation();
								const filtered = effectiveCurvePoints.filter((p) => p.id !== node.id);
								onCurvePointsChange?.(filtered);
							}}
							onDoubleClick={(e) => {
								e.stopPropagation();
								const filtered = effectiveCurvePoints.filter((p) => p.id !== node.id);
								onCurvePointsChange?.(filtered);
							}}
							title={`Time: ${(node.timeMs / 1000).toFixed(2)}s | Speed Multiplier: ${node.multiplier.toFixed(2)}x (Drag to adjust, right-click to delete)`}
						>
							{/* Node Glow Halo */}
							<div
								className={`w-4 h-4 rounded-full flex items-center justify-center transition-all ${
									isSelected || isDragging
										? "ring-4 ring-emerald-400/40 bg-emerald-400/30 scale-125"
										: "group-hover:scale-125 group-hover:ring-2 group-hover:ring-emerald-400/30"
								}`}
							>
								{/* Center Diamond Marker */}
								<div
									className={`w-2.5 h-2.5 rotate-45 border transition-all ${
										isSelected || isDragging
											? "bg-white border-emerald-300 shadow-md shadow-emerald-400/60"
											: "bg-emerald-300 border-emerald-500 group-hover:bg-white"
									}`}
								/>
							</div>

							{/* Tooltip on Hover / Drag */}
							<div
								className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-1.5 py-0.5 rounded bg-black/90 border border-emerald-500/40 text-[9px] font-mono text-emerald-200 pointer-events-none whitespace-nowrap shadow-lg transition-opacity ${
									isDragging ? "opacity-100" : "opacity-0 group-hover:opacity-100"
								}`}
							>
								<span>{(node.timeMs / 1000).toFixed(2)}s</span>
								<span className="mx-1 text-emerald-400/60">•</span>
								<span className="font-bold text-white">
									{node.multiplier.toFixed(2)}x
								</span>
							</div>
						</div>
					);
				})}
		</div>
	);
}
