import {
	CaretLeft,
	Highlighter,
	Play,
	Plus,
	Trash,
} from "@phosphor-icons/react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { AnnotationSettingsPanel } from "./AnnotationSettingsPanel";
import type { AnnotationRegion, AnnotationType, FigureData, HighlightData } from "./types";

interface HighlightSettingsPanelProps {
	annotationRegions?: AnnotationRegion[];
	selectedAnnotationId?: string | null;
	onSelectAnnotation?: (id: string | null) => void;
	onAddHighlight?: () => void;
	onAnnotationDelete?: (id: string) => void;
	onAnnotationContentChange?: (id: string, content: string) => void;
	onAnnotationTypeChange?: (id: string, type: AnnotationType) => void;
	onAnnotationStyleChange?: (id: string, style: Partial<AnnotationRegion["style"]>) => void;
	onAnnotationFigureDataChange?: (id: string, figureData: FigureData) => void;
	onAnnotationBlurIntensityChange?: (id: string, intensity: number) => void;
	onAnnotationBlurColorChange?: (id: string, color: string) => void;
	onAnnotationHighlightDataChange?: (id: string, highlightData: HighlightData) => void;
	onSeekToTime?: (timeMs: number) => void;
}

const ANIMATION_LABELS: Record<string, { label: string; icon: string }> = {
	none: { label: "Static", icon: "⏹" },
	"marching-ants": { label: "Marching Ants", icon: "🐜" },
	blink: { label: "Blink Pulse", icon: "⚡" },
	glow: { label: "Neon Glow", icon: "✨" },
	shimmer: { label: "Light Shimmer", icon: "💫" },
};

export function HighlightSettingsPanel({
	annotationRegions = [],
	selectedAnnotationId,
	onSelectAnnotation,
	onAddHighlight,
	onAnnotationDelete,
	onAnnotationContentChange,
	onAnnotationTypeChange,
	onAnnotationStyleChange,
	onAnnotationFigureDataChange,
	onAnnotationBlurIntensityChange,
	onAnnotationBlurColorChange,
	onAnnotationHighlightDataChange,
	onSeekToTime,
}: HighlightSettingsPanelProps) {
	const highlightRegions = useMemo(
		() => annotationRegions.filter((r) => r.type === "highlight"),
		[annotationRegions],
	);

	const selectedHighlight = useMemo(
		() =>
			selectedAnnotationId
				? highlightRegions.find((r) => r.id === selectedAnnotationId) ?? null
				: null,
		[highlightRegions, selectedAnnotationId],
	);

	// If a specific highlight region is selected, render the editor for it
	if (
		selectedHighlight &&
		onAnnotationContentChange &&
		onAnnotationTypeChange &&
		onAnnotationStyleChange &&
		onAnnotationDelete
	) {
		return (
			<div className="flex flex-col h-full overflow-hidden">
				<div className="flex items-center justify-between pb-3 mb-2 border-b border-border/40">
					<button
						type="button"
						onClick={() => onSelectAnnotation?.(null)}
						className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
					>
						<CaretLeft size={14} />
						All Highlights ({highlightRegions.length})
					</button>
					{onAddHighlight && (
						<Button
							size="sm"
							variant="outline"
							onClick={onAddHighlight}
							className="h-7 text-xs gap-1.5"
						>
							<Plus size={12} />
							Add Another
						</Button>
					)}
				</div>
				<div className="flex-1 min-h-0 overflow-y-auto">
					<AnnotationSettingsPanel
						annotation={selectedHighlight}
						onContentChange={(content) =>
							onAnnotationContentChange(selectedHighlight.id, content)
						}
						onTypeChange={(type) => onAnnotationTypeChange(selectedHighlight.id, type)}
						onStyleChange={(style) => onAnnotationStyleChange(selectedHighlight.id, style)}
						onFigureDataChange={
							onAnnotationFigureDataChange
								? (data) => onAnnotationFigureDataChange(selectedHighlight.id, data)
								: undefined
						}
						onBlurIntensityChange={
							onAnnotationBlurIntensityChange
								? (val) => onAnnotationBlurIntensityChange(selectedHighlight.id, val)
								: undefined
						}
						onBlurColorChange={
							onAnnotationBlurColorChange
								? (col) => onAnnotationBlurColorChange(selectedHighlight.id, col)
								: undefined
						}
						onHighlightDataChange={
							onAnnotationHighlightDataChange
								? (hl) => onAnnotationHighlightDataChange(selectedHighlight.id, hl)
								: undefined
						}
						onDelete={() => {
							onAnnotationDelete(selectedHighlight.id);
							onSelectAnnotation?.(null);
						}}
					/>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4 p-1">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-500">
						<Highlighter size={18} weight="fill" />
					</div>
					<div>
						<h3 className="text-sm font-semibold text-foreground">Highlighting Area</h3>
						<p className="text-[11px] text-muted-foreground">
							Spotlight, marching ants & animated focus
						</p>
					</div>
				</div>
			</div>

			{/* Primary Action Button */}
			{onAddHighlight && (
				<Button
					onClick={onAddHighlight}
					className="w-full gap-2 bg-[#2563EB] hover:bg-[#1d4ed8] text-white shadow-sm font-medium text-xs h-9 cursor-pointer"
				>
					<Plus size={15} weight="bold" />
					Add Highlight Area
				</Button>
			)}

			{/* Highlights List or Empty State */}
			{highlightRegions.length > 0 ? (
				<div className="flex flex-col gap-2 mt-1">
					<div className="flex items-center justify-between px-1">
						<span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
							Active Highlights ({highlightRegions.length})
						</span>
					</div>
					<div className="flex flex-col gap-1.5">
						{highlightRegions.map((region, idx) => {
							const startSec = (region.startMs / 1000).toFixed(1);
							const endSec = (region.endMs / 1000).toFixed(1);
							const anim = region.highlightData?.animation || "none";
							const animInfo = ANIMATION_LABELS[anim] ?? { label: "Custom", icon: "✨" };
							const isSpotlight = (region.highlightData?.spotlightDim ?? 0) > 0;

							return (
								<div
									key={region.id}
									onClick={() => {
										onSelectAnnotation?.(region.id);
										onSeekToTime?.(region.startMs);
									}}
									className="group flex items-center justify-between p-2.5 rounded-xl border border-border/50 bg-foreground/[0.02] hover:bg-foreground/[0.06] hover:border-border transition-all cursor-pointer"
								>
									<div className="flex items-center gap-2.5 min-w-0">
										<div
											className="w-4 h-4 rounded-md border flex-shrink-0"
											style={{
												backgroundColor: region.highlightData?.color || "#ffd700",
												borderColor: region.highlightData?.borderColor || "#ffaa00",
											}}
										/>
										<div className="min-w-0">
											<div className="flex items-center gap-1.5">
												<span className="text-xs font-medium text-foreground truncate">
													Highlight #{idx + 1}
												</span>
												<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-foreground/[0.06] text-muted-foreground">
													{animInfo.icon} {animInfo.label}
												</span>
												{isSpotlight && (
													<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-medium">
														Spotlight
													</span>
												)}
											</div>
											<span className="text-[10px] text-muted-foreground">
												{startSec}s → {endSec}s
											</span>
										</div>
									</div>

									<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
										{onSeekToTime && (
											<button
												type="button"
												title="Seek to highlight"
												onClick={(e) => {
													e.stopPropagation();
													onSeekToTime(region.startMs);
												}}
												className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.08]"
											>
												<Play size={12} weight="fill" />
											</button>
										)}
										{onAnnotationDelete && (
											<button
												type="button"
												title="Delete highlight"
												onClick={(e) => {
													e.stopPropagation();
													onAnnotationDelete(region.id);
												}}
												className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
											>
												<Trash size={12} />
											</button>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</div>
			) : (
				<div className="flex flex-col gap-3 rounded-xl border border-dashed border-border/70 p-4 mt-1 bg-foreground/[0.01]">
					<span className="text-xs font-semibold text-foreground">
						Features & Animations:
					</span>
					<div className="flex flex-col gap-2 text-xs text-muted-foreground">
						<div className="flex items-start gap-2">
							<span className="text-sm">💡</span>
							<div>
								<strong className="text-foreground font-medium">Theater Spotlight:</strong>
								<p className="text-[11px] text-muted-foreground">
									Dims the background video up to 90% to draw full focus to any area.
								</p>
							</div>
						</div>
						<div className="flex items-start gap-2">
							<span className="text-sm">🐜</span>
							<div>
								<strong className="text-foreground font-medium">Marching Ants:</strong>
								<p className="text-[11px] text-muted-foreground">
									Dynamic animated dashed border continuously rotating around the box.
								</p>
							</div>
						</div>
						<div className="flex items-start gap-2">
							<span className="text-sm">⚡</span>
							<div>
								<strong className="text-foreground font-medium">Neon Glow & Blink:</strong>
								<p className="text-[11px] text-muted-foreground">
									Vibrant glowing aura and pulsing alerts for maximum viewer retention.
								</p>
							</div>
						</div>
						<div className="flex items-start gap-2">
							<span className="text-sm">💫</span>
							<div>
								<strong className="text-foreground font-medium">Light Shimmer:</strong>
								<p className="text-[11px] text-muted-foreground">
									Sweeping reflective light effect across the highlight area.
								</p>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
