import { useRef } from "react";
import { Rnd } from "react-rnd";
import { cn } from "@/lib/utils";
import { getArrowComponent } from "./ArrowSvgs";
import {
	type AnnotationRegion,
	BASE_PREVIEW_WIDTH,
	BLUR_ANNOTATION_STRENGTH,
	DEFAULT_HIGHLIGHT_DATA,
} from "./types";

export function hexToRgba(color: string, opacity: number): string {
	if (!color) return `rgba(250, 204, 21, ${opacity})`;
	if (color.startsWith("rgba")) {
		return color.replace(/[\d.]+\)$/g, `${opacity})`);
	}
	if (color.startsWith("rgb")) {
		return color.replace("rgb", "rgba").replace(")", `, ${opacity})`);
	}
	let hex = color.replace("#", "");
	if (hex.length === 3) {
		hex = hex
			.split("")
			.map((c) => c + c)
			.join("");
	}
	if (hex.length >= 6) {
		const r = parseInt(hex.substring(0, 2), 16) || 0;
		const g = parseInt(hex.substring(2, 4), 16) || 0;
		const b = parseInt(hex.substring(4, 6), 16) || 0;
		return `rgba(${r}, ${g}, ${b}, ${opacity})`;
	}
	return color;
}

type Rect = {
	x: number;
	y: number;
	width: number;
	height: number;
};

type SceneTransform = {
	scale: number;
	x: number;
	y: number;
};

interface AnnotationOverlayProps {
	annotation: AnnotationRegion;
	isSelected: boolean;
	containerWidth: number;
	containerHeight: number;
	recordingRect: Rect;
	sceneTransform: SceneTransform;
	interactionScale?: number;
	onPositionChange: (id: string, position: { x: number; y: number }) => void;
	onSizeChange: (id: string, size: { width: number; height: number }) => void;
	onClick: (id: string) => void;
	zIndex: number;
	isSelectedBoost: boolean; // Boost z-index when selected for easy editing
}

function clampPercent(value: number) {
	if (!Number.isFinite(value)) {
		return 0;
	}

	return Math.min(100, Math.max(0, value));
}

/** Render an annotation in preview space with editor drag and resize controls. */
export function AnnotationOverlay({
	annotation,
	isSelected,
	containerWidth,
	containerHeight,
	recordingRect,
	sceneTransform,
	interactionScale = 1,
	onPositionChange,
	onSizeChange,
	onClick,
	zIndex,
	isSelectedBoost,
}: AnnotationOverlayProps) {
	const safeRecordingRect =
		recordingRect.width > 0 && recordingRect.height > 0
			? recordingRect
			: { x: 0, y: 0, width: containerWidth, height: containerHeight };
	const sceneX = safeRecordingRect.x + (annotation.position.x / 100) * safeRecordingRect.width;
	const sceneY = safeRecordingRect.y + (annotation.position.y / 100) * safeRecordingRect.height;
	const sceneWidth = (annotation.size.width / 100) * safeRecordingRect.width;
	const sceneHeight = (annotation.size.height / 100) * safeRecordingRect.height;
	const x = sceneX * sceneTransform.scale + sceneTransform.x;
	const y = sceneY * sceneTransform.scale + sceneTransform.y;
	const width = sceneWidth * sceneTransform.scale;
	const height = sceneHeight * sceneTransform.scale;
	const sizeScale = safeRecordingRect.width / BASE_PREVIEW_WIDTH;
	const blurScaleFactor = sizeScale * sceneTransform.scale;

	const isDraggingRef = useRef(false);

	const screenRectToRecordingPercent = (rect: Rect) => {
		const nextSceneX = (rect.x - sceneTransform.x) / sceneTransform.scale;
		const nextSceneY = (rect.y - sceneTransform.y) / sceneTransform.scale;
		const nextSceneWidth = rect.width / sceneTransform.scale;
		const nextSceneHeight = rect.height / sceneTransform.scale;

		return {
			position: {
				x: clampPercent(
					((nextSceneX - safeRecordingRect.x) / Math.max(1, safeRecordingRect.width)) *
						100,
				),
				y: clampPercent(
					((nextSceneY - safeRecordingRect.y) / Math.max(1, safeRecordingRect.height)) *
						100,
				),
			},
			size: {
				width: clampPercent((nextSceneWidth / Math.max(1, safeRecordingRect.width)) * 100),
				height: clampPercent(
					(nextSceneHeight / Math.max(1, safeRecordingRect.height)) * 100,
				),
			},
		};
	};

	const renderArrow = () => {
		const direction = annotation.figureData?.arrowDirection || "right";
		const color = annotation.figureData?.color || "#2563EB";
		const strokeWidth = annotation.figureData?.strokeWidth || 4;

		const ArrowComponent = getArrowComponent(direction);
		return <ArrowComponent color={color} strokeWidth={strokeWidth} />;
	};

	const renderContent = () => {
		switch (annotation.type) {
			case "text":
				return (
					<div
						className="w-full h-full flex items-center overflow-hidden"
						style={{
							justifyContent:
								annotation.style.textAlign === "left"
									? "flex-start"
									: annotation.style.textAlign === "right"
										? "flex-end"
										: "center",
							alignItems: "center",
							padding: `${8 * sizeScale}px`,
						}}
					>
						<span
							style={{
								color: annotation.style.color,
								backgroundColor: annotation.style.backgroundColor,
								fontSize: `${annotation.style.fontSize * sizeScale}px`,
								fontFamily: annotation.style.fontFamily,
								fontWeight: annotation.style.fontWeight,
								fontStyle: annotation.style.fontStyle,
								textDecoration: annotation.style.textDecoration,
								textAlign: annotation.style.textAlign,
								wordBreak: "break-word",
								whiteSpace: "pre-wrap",
								boxDecorationBreak: "clone",
								WebkitBoxDecorationBreak: "clone",
								padding: "0.1em 0.2em",
								borderRadius: `${4 * sizeScale}px`,
								lineHeight: "1.4",
							}}
						>
							{annotation.content}
						</span>
					</div>
				);

			case "image":
				if (annotation.content && annotation.content.startsWith("data:image")) {
					return (
						<img
							src={annotation.content}
							alt="Annotation"
							className="w-full h-full object-contain"
							draggable={false}
						/>
					);
				}
				return (
					<div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
						No image
					</div>
				);

			case "figure":
				if (!annotation.figureData) {
					return (
						<div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
							No arrow data
						</div>
					);
				}

				return (
					<div
						className="w-full h-full flex items-center justify-center"
						style={{ padding: `${8 * sizeScale}px` }}
					>
						{renderArrow()}
					</div>
				);

			case "blur": {
				const currentBlurStrength = annotation.blurIntensity ?? BLUR_ANNOTATION_STRENGTH;
				const blurPx = currentBlurStrength * blurScaleFactor;
				const blurStyle = `blur(${blurPx}px)`;

				return (
					<div
						className="h-full w-full bg-slate-400/10"
						style={{
							backdropFilter: blurStyle,
							WebkitBackdropFilter: blurStyle,
							backgroundColor: annotation.blurColor || "transparent",
							borderRadius: `${(annotation.style.borderRadius ?? 0) * blurScaleFactor}px`,
						}}
					/>
				);
			}

			case "highlight": {
				const data = annotation.highlightData ?? DEFAULT_HIGHLIGHT_DATA;
				const scaledBorderRadius = (data.borderRadius ?? 8) * blurScaleFactor;
				const scaledBorderWidth = (data.borderWidth ?? 2) * blurScaleFactor;
				const speed = Math.max(0.1, data.animationSpeed || 1);
				const anim = data.animation || "none";
				const glow = data.glowIntensity ?? 0.6;
				const dim = data.spotlightDim ?? 0;

				const fillColor = hexToRgba(data.color || "#FACC15", data.fillOpacity ?? 0.2);
				const borderColor = data.borderColor || "#FACC15";

				const shadows: string[] = [];
				if (dim > 0) {
					shadows.push(`0 0 0 9999px rgba(0, 0, 0, ${dim})`);
				}
				if ((anim === "glow" || glow > 0) && (data.borderWidth > 0 || anim === "glow")) {
					const glowSpread = Math.max(1, Math.round(18 * glow * blurScaleFactor));
					shadows.push(
						`0 0 ${glowSpread}px ${Math.round(3 * glow * blurScaleFactor)}px ${borderColor}`,
					);
				}

				return (
					<div
						className={cn(
							"relative w-full h-full overflow-hidden transition-all",
							anim === "blink" && "animate-[recordly-highlight-pulse_1.2s_ease-in-out_infinite]",
							anim === "glow" && "animate-[recordly-highlight-glow_1.5s_ease-in-out_infinite]",
						)}
						style={{
							borderRadius: `${scaledBorderRadius}px`,
							backgroundColor: fillColor,
							border:
								anim === "border-line"
									? "none"
									: `${scaledBorderWidth}px ${data.borderStyle || "solid"} ${borderColor}`,
							boxShadow: shadows.length > 0 ? shadows.join(", ") : undefined,
							animationDuration:
								anim === "blink"
									? `${(1.2 / speed).toFixed(2)}s`
									: anim === "glow"
										? `${(1.5 / speed).toFixed(2)}s`
										: undefined,
							["--highlight-glow-color" as string]: borderColor,
						}}
					>
						{/* Animated marching dash border */}
						{anim === "border-line" && scaledBorderWidth > 0 && (
							<svg
								className="absolute inset-0 w-full h-full pointer-events-none"
								style={{ overflow: "visible" }}
							>
								<rect
									x={scaledBorderWidth / 2}
									y={scaledBorderWidth / 2}
									width={`calc(100% - ${scaledBorderWidth}px)`}
									height={`calc(100% - ${scaledBorderWidth}px)`}
									rx={scaledBorderRadius}
									ry={scaledBorderRadius}
									fill="none"
									stroke={borderColor}
									strokeWidth={scaledBorderWidth}
									strokeDasharray={`${12 * blurScaleFactor} ${6 * blurScaleFactor}`}
									className="recordly-highlight-marching-dash"
									style={{
										animationDuration: `${(1.2 / speed).toFixed(2)}s`,
									}}
								/>
							</svg>
						)}

						{/* Animated shimmer light sweep */}
						{anim === "shimmer" && (
							<div
								className="pointer-events-none absolute inset-0 w-[60%] h-full opacity-60"
								style={{
									background:
										"linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.6) 50%, transparent 100%)",
									animation: `recordly-highlight-shimmer ${(1.8 / speed).toFixed(2)}s cubic-bezier(0.4, 0, 0.2, 1) infinite`,
								}}
							/>
						)}
					</div>
				);
			}

			default:
				return null;
		}
	};

	return (
		<Rnd
			position={{ x, y }}
			size={{ width, height }}
			scale={interactionScale}
			onDragStart={() => {
				isDraggingRef.current = true;
			}}
			onDragStop={(_e, d) => {
				const next = screenRectToRecordingPercent({ x: d.x, y: d.y, width, height });
				onPositionChange(annotation.id, next.position);

				// Reset dragging flag after a short delay to prevent click event
				setTimeout(() => {
					isDraggingRef.current = false;
				}, 100);
			}}
			onResizeStop={(_e, _direction, ref, _delta, position) => {
				const next = screenRectToRecordingPercent({
					x: position.x,
					y: position.y,
					width: ref.offsetWidth,
					height: ref.offsetHeight,
				});
				onPositionChange(annotation.id, next.position);
				onSizeChange(annotation.id, next.size);
			}}
			onClick={() => {
				if (isDraggingRef.current) return;
				onClick(annotation.id);
			}}
			bounds="parent"
			className={cn(
				"cursor-move transition-all",
				isSelected && "ring-2 ring-[#2563EB] ring-offset-2 ring-offset-transparent",
			)}
			style={{
				zIndex: isSelectedBoost ? zIndex + 1000 : zIndex, // Boost selected annotation to ensure it's on top
				pointerEvents: "auto",
				border: isSelected
					? annotation.type === "highlight"
						? "1px dashed rgba(37, 99, 235, 0.9)"
						: "2px solid rgba(37, 99, 235, 0.8)"
					: "none",
				backgroundColor:
					isSelected && annotation.type !== "highlight"
						? "rgba(37, 99, 235, 0.1)"
						: "transparent",
				boxShadow:
					isSelected && annotation.type !== "highlight"
						? "0 0 0 1px rgba(37, 99, 235, 0.35)"
						: "none",
			}}
			enableResizing={isSelected}
			disableDragging={!isSelected}
			resizeHandleStyles={{
				topLeft: {
					width: "12px",
					height: "12px",
					backgroundColor: isSelected ? "white" : "transparent",
					border: isSelected ? "2px solid #2563EB" : "none",
					borderRadius: "50%",
					left: "-6px",
					top: "-6px",
					cursor: "nwse-resize",
				},
				topRight: {
					width: "12px",
					height: "12px",
					backgroundColor: isSelected ? "white" : "transparent",
					border: isSelected ? "2px solid #2563EB" : "none",
					borderRadius: "50%",
					right: "-6px",
					top: "-6px",
					cursor: "nesw-resize",
				},
				bottomLeft: {
					width: "12px",
					height: "12px",
					backgroundColor: isSelected ? "white" : "transparent",
					border: isSelected ? "2px solid #2563EB" : "none",
					borderRadius: "50%",
					left: "-6px",
					bottom: "-6px",
					cursor: "nesw-resize",
				},
				bottomRight: {
					width: "12px",
					height: "12px",
					backgroundColor: isSelected ? "white" : "transparent",
					border: isSelected ? "2px solid #2563EB" : "none",
					borderRadius: "50%",
					right: "-6px",
					bottom: "-6px",
					cursor: "nwse-resize",
				},
			}}
		>
			<div
				className={cn(
					"w-full h-full rounded-lg",
					annotation.type === "text" && "bg-transparent",
					annotation.type === "image" && "bg-transparent",
					annotation.type === "figure" && "bg-transparent",
					annotation.type === "highlight" && "bg-transparent",
					isSelected && annotation.type !== "highlight" && "shadow-lg",
				)}
			>
				{renderContent()}
			</div>
		</Rnd>
	);
}
