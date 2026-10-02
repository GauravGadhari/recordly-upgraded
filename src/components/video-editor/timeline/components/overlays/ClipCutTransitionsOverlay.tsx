import { Plus, X } from "@phosphor-icons/react";
import { useTimelineContext } from "dnd-timeline";
import { memo, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { TransitionRegion, TransitionType } from "../../../types";
import type { TimelineRenderItem } from "../../core/timelineTypes";
import {
	getTransitionDisplayName,
	getTransitionIcon,
	TransitionPickerDialog,
} from "../dialogs/TransitionPickerDialog";

interface ClipCutTransitionsOverlayProps {
	clipItems: TimelineRenderItem[];
	transitionRegions: TransitionRegion[];
	onApplyTransition: (params: {
		type: TransitionType;
		durationMs: number;
		cutTimeMs: number;
		existingId?: string;
	}) => void;
	onRemoveTransition: (id: string) => void;
}

interface CutPoint {
	cutTimeMs: number;
	clipA: TimelineRenderItem;
	clipB: TimelineRenderItem;
	transition: TransitionRegion | null;
}

function ClipCutTransitionsOverlayComponent({
	clipItems,
	transitionRegions,
	onApplyTransition,
	onRemoveTransition,
}: ClipCutTransitionsOverlayProps) {
	const { direction, range, valueToPixels } = useTimelineContext();
	const sideProperty = direction === "rtl" ? "right" : "left";

	const [activeCut, setActiveCut] = useState<CutPoint | null>(null);

	// Detect all cut points between split adjacent clips
	const cuts: CutPoint[] = useMemo(() => {
		if (clipItems.length < 2) return [];

		const sorted = [...clipItems].sort((a, b) => a.span.start - b.span.start);
		const result: CutPoint[] = [];

		for (let i = 0; i < sorted.length - 1; i++) {
			const clipA = sorted[i];
			const clipB = sorted[i + 1];

			// Clips are considered split/adjacent if the gap is small (under 400ms)
			if (clipB.span.start - clipA.span.end <= 400) {
				const cutTimeMs = Math.round((clipA.span.end + clipB.span.start) / 2);

				// Find if a transition already covers this cut point
				const matchedTransition =
					transitionRegions.find(
						(t) =>
							(t.startMs <= cutTimeMs && t.endMs >= cutTimeMs) ||
							Math.abs((t.startMs + t.endMs) / 2 - cutTimeMs) < 600,
					) ?? null;

				result.push({
					cutTimeMs,
					clipA,
					clipB,
					transition: matchedTransition,
				});
			}
		}

		return result;
	}, [clipItems, transitionRegions]);

	return (
		<>
			<div className="pointer-events-none absolute inset-0 z-20 overflow-visible">
				{cuts.map((cut) => {
					const { cutTimeMs, transition } = cut;

					// Check visibility within visible range with generous margin
					if (cutTimeMs < range.start - 2000 || cutTimeMs > range.end + 2000) {
						return null;
					}

					const offsetPx = valueToPixels(cutTimeMs - range.start);

					if (transition) {
						const durationSec = ((transition.endMs - transition.startMs) / 1000).toFixed(1);
						const icon = getTransitionIcon(transition.type);
						const name = getTransitionDisplayName(transition.type);

						return (
							<div
								key={`cut-transition-${transition.id}`}
								style={{
									[sideProperty]: `${offsetPx}px`,
									top: "50%",
								}}
								className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#181b26]/95 hover:bg-[#202538] border border-blue-500/40 text-blue-200 shadow-xl backdrop-blur-md cursor-pointer transition-all hover:scale-105 group select-none"
								onClick={(e) => {
									e.stopPropagation();
									setActiveCut(cut);
								}}
								title={`Edit transition: ${name} (${durationSec}s)`}
							>
								<span className="flex items-center justify-center text-blue-400">
									{icon}
								</span>
								<span className="text-[10px] font-semibold tracking-tight text-white/90">
									{name}
								</span>
								<span className="text-[9px] font-mono text-blue-300/70 bg-blue-500/10 px-1 rounded">
									{durationSec}s
								</span>
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										onRemoveTransition(transition.id);
									}}
									className="ml-0.5 p-0.5 rounded text-white/40 hover:text-red-400 hover:bg-white/10 transition-colors"
									title="Remove transition"
								>
									<X className="w-2.5 h-2.5" />
								</button>
							</div>
						);
					}

					// No transition yet — render modern "+" split button
					return (
						<div
							key={`cut-add-${cutTimeMs}`}
							style={{
								[sideProperty]: `${offsetPx}px`,
								top: "50%",
							}}
							className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
						>
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									setActiveCut(cut);
								}}
								className={cn(
									"group flex items-center justify-center h-6 w-6 rounded-full",
									"bg-[#131622]/95 hover:bg-blue-600 text-white/70 hover:text-white",
									"border border-white/20 hover:border-blue-400 shadow-lg",
									"backdrop-blur-md transition-all duration-150 hover:scale-125 cursor-pointer",
								)}
								title="Add Transition between clips"
								aria-label="Add Transition"
							>
								<Plus className="h-3 w-3 stroke-[2.5] group-hover:rotate-90 transition-transform duration-200" />
							</button>
						</div>
					);
				})}
			</div>

			{/* Transition picker dialog */}
			{activeCut && (
				<TransitionPickerDialog
					isOpen={Boolean(activeCut)}
					onClose={() => setActiveCut(null)}
					cutTimeMs={activeCut.cutTimeMs}
					existingTransition={activeCut.transition}
					onApplyTransition={({ type, durationMs, existingId }) => {
						onApplyTransition({
							type,
							durationMs,
							cutTimeMs: activeCut.cutTimeMs,
							existingId,
						});
					}}
					onRemoveTransition={(id) => {
						onRemoveTransition(id);
					}}
				/>
			)}
		</>
	);
}

export default memo(ClipCutTransitionsOverlayComponent);
