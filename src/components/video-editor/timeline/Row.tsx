import { Eye, EyeSlash } from "@phosphor-icons/react";
import type { RowDefinition } from "dnd-timeline";
import { useRow } from "dnd-timeline";
import { useCallback } from "react";
import { cn } from "@/lib/utils";

interface RowProps extends RowDefinition {
	children: React.ReactNode;
	label?: string;
	hint?: string;
	isEmpty?: boolean;
	height?: number;
	onHeightChange?: (height: number) => void;
	isMuted?: boolean;
	onToggleMute?: () => void;
	isSolo?: boolean;
	onToggleSolo?: () => void;
	isHidden?: boolean;
	onToggleHide?: () => void;
	showMute?: boolean;
	showSolo?: boolean;
	showVisibility?: boolean;
	onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
	onMouseMove?: React.MouseEventHandler<HTMLDivElement>;
	onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
	onMouseDown?: React.MouseEventHandler<HTMLDivElement>;
	onClick?: React.MouseEventHandler<HTMLDivElement>;
}

export default function Row({
	id,
	children,
	label,
	hint,
	isEmpty,
	height,
	onHeightChange,
	isMuted,
	onToggleMute,
	isSolo,
	onToggleSolo,
	isHidden,
	onToggleHide,
	showMute,
	showSolo,
	showVisibility = true,
	onMouseEnter,
	onMouseMove,
	onMouseLeave,
	onMouseDown,
	onClick,
}: RowProps) {
	const { setNodeRef, setSidebarRef, rowWrapperStyle, rowStyle, rowSidebarStyle } = useRow({ id });

	const handleResizePointerDown = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			event.stopPropagation();
			event.preventDefault();
			const startY = event.clientY;
			const initialHeight = height ?? 38;
			const target = event.currentTarget;
			target.setPointerCapture(event.pointerId);

			const onPointerMove = (e: PointerEvent) => {
				const deltaY = e.clientY - startY;
				const nextHeight = Math.max(26, Math.min(120, initialHeight + deltaY));
				onHeightChange?.(nextHeight);
			};

			const onPointerUp = (e: PointerEvent) => {
				try {
					target.releasePointerCapture(e.pointerId);
				} catch {}
				window.removeEventListener("pointermove", onPointerMove);
				window.removeEventListener("pointerup", onPointerUp);
			};

			window.addEventListener("pointermove", onPointerMove);
			window.addEventListener("pointerup", onPointerUp);
		},
		[height, onHeightChange],
	);

	return (
		<div
			className="bg-transparent relative w-full flex min-h-[34px] group/row transition-opacity duration-150"
			style={{
				...rowWrapperStyle,
				marginBottom: 2,
				height: height ? `${height}px` : undefined,
				opacity: isHidden ? 0.35 : 1,
			}}
		>
			{label ? (
				<div
					ref={setSidebarRef}
					className="flex-shrink-0 w-36 bg-editor-surface/90 backdrop-blur-sm border-r border-foreground/10 flex items-center justify-between px-2 select-none z-20 relative group/header transition-colors hover:bg-editor-surface"
					style={rowSidebarStyle}
				>
					<span
						className="text-[10px] font-medium text-foreground/80 truncate pr-1"
						title={label}
					>
						{label}
					</span>
					<div className="flex items-center gap-1 flex-shrink-0">
						{showVisibility && onToggleHide ? (
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									onToggleHide();
								}}
								title={isHidden ? "Show track" : "Hide track"}
								className={cn(
									"h-4 w-4 flex items-center justify-center rounded transition-colors",
									isHidden
										? "text-amber-400 bg-amber-400/15"
										: "text-muted-foreground/60 hover:text-foreground hover:bg-foreground/5",
								)}
							>
								{isHidden ? (
									<EyeSlash className="h-2.5 w-2.5" />
								) : (
									<Eye className="h-2.5 w-2.5" />
								)}
							</button>
						) : null}
						{showMute && onToggleMute ? (
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									onToggleMute();
								}}
								title={isMuted ? "Unmute track" : "Mute track"}
								className={cn(
									"h-4 w-4 flex items-center justify-center rounded text-[9px] font-bold transition-colors",
									isMuted
										? "bg-red-500/20 text-red-400 border border-red-500/40"
										: "text-muted-foreground/60 hover:text-foreground hover:bg-foreground/5",
								)}
							>
								M
							</button>
						) : null}
						{showSolo && onToggleSolo ? (
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									onToggleSolo();
								}}
								title={isSolo ? "Unsolo track" : "Solo track"}
								className={cn(
									"h-4 w-4 flex items-center justify-center rounded text-[9px] font-bold transition-colors",
									isSolo
										? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
										: "text-muted-foreground/60 hover:text-foreground hover:bg-foreground/5",
								)}
							>
								S
							</button>
						) : null}
					</div>
					{/* Height resize bottom border */}
					{onHeightChange ? (
						<div
							className="absolute -bottom-1 left-0 right-0 h-2 cursor-row-resize z-30 hover:bg-[#2563EB]/40 transition-colors"
							onPointerDown={handleResizePointerDown}
							title="Drag to resize track height"
						/>
					) : null}
				</div>
			) : null}

			<div
				ref={setNodeRef}
				className="relative flex-1 h-full min-h-[34px] overflow-hidden"
				style={rowStyle}
				onMouseEnter={onMouseEnter}
				onMouseMove={onMouseMove}
				onMouseLeave={onMouseLeave}
				onMouseDown={onMouseDown}
				onClick={onClick}
			>
				{isEmpty && hint && (
					<div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-10">
						<span className="text-[11px] text-foreground/15 font-medium">{hint}</span>
					</div>
				)}
				{children}
			</div>
		</div>
	);
}
