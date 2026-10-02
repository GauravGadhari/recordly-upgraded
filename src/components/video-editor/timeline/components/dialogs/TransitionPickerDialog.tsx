import {
	ArrowLeft,
	ArrowRight,
	ArrowsClockwise,
	Check,
	FilmStrip,
	Lightning,
	MagnifyingGlassMinus,
	MagnifyingGlassPlus,
	Moon,
	Sparkle,
	SquaresFour,
	Sun,
	Trash,
} from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { TransitionRegion, TransitionType } from "../../../types";

export interface TransitionPreset {
	type: TransitionType;
	name: string;
	description: string;
	category: "basic" | "dynamic" | "stylized";
}

export const TRANSITION_PRESETS: TransitionPreset[] = [
	{
		type: "cross-dissolve",
		name: "Cross Dissolve",
		description: "Smooth blend between consecutive clips",
		category: "basic",
	},
	{
		type: "fade-black",
		name: "Fade to Black",
		description: "Classic dip to black and back",
		category: "basic",
	},
	{
		type: "dip-white",
		name: "Dip to White",
		description: "Bright flash / flashbulb transition",
		category: "basic",
	},
	{
		type: "zoom-in",
		name: "Zoom In",
		description: "Dramatic zoom rush into the next clip",
		category: "dynamic",
	},
	{
		type: "zoom-out",
		name: "Zoom Out",
		description: "Wide pullback transition",
		category: "dynamic",
	},
	{
		type: "slide-left",
		name: "Slide Left",
		description: "Whip push towards the left",
		category: "dynamic",
	},
	{
		type: "slide-right",
		name: "Slide Right",
		description: "Whip push towards the right",
		category: "dynamic",
	},
	{
		type: "glitch",
		name: "Glitch",
		description: "Digital chromatic RGB scanline glitch",
		category: "stylized",
	},
	{
		type: "film-burn",
		name: "Film Burn",
		description: "Warm vintage optical light leak",
		category: "stylized",
	},
];

const DURATION_PRESETS = [300, 500, 1000, 1500, 2000];

export function getTransitionIcon(type: TransitionType) {
	switch (type) {
		case "fade-black":
			return <Moon className="h-4 w-4 text-zinc-400" />;
		case "dip-white":
			return <Sun className="h-4 w-4 text-amber-300" />;
		case "cross-dissolve":
			return <SquaresFour className="h-4 w-4 text-blue-400" />;
		case "zoom-in":
			return <MagnifyingGlassPlus className="h-4 w-4 text-emerald-400" />;
		case "zoom-out":
			return <MagnifyingGlassMinus className="h-4 w-4 text-emerald-400" />;
		case "slide-left":
			return <ArrowLeft className="h-4 w-4 text-violet-400" />;
		case "slide-right":
			return <ArrowRight className="h-4 w-4 text-violet-400" />;
		case "glitch":
			return <Lightning className="h-4 w-4 text-cyan-400" />;
		case "film-burn":
			return <FilmStrip className="h-4 w-4 text-orange-400" />;
		default:
			return <Sparkle className="h-4 w-4 text-blue-400" />;
	}
}

export function getTransitionDisplayName(type: TransitionType): string {
	const found = TRANSITION_PRESETS.find((p) => p.type === type);
	if (found) return found.name;
	return type
		.split("-")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}

/**
 * Animated micro-preview representing how the transition behaves in real time.
 */
function TransitionPreview({ type }: { type: TransitionType }) {
	return (
		<div className="relative aspect-video w-full overflow-hidden rounded-md bg-zinc-950 flex items-center justify-center border border-white/5 shadow-inner">
			{/* Simulated background footage */}
			<div className="absolute inset-0 bg-gradient-to-tr from-blue-950/70 via-slate-900 to-indigo-950/70 opacity-90" />
			<div className="absolute h-5 w-5 rounded-full bg-blue-500/20 blur-sm" />

			{/* Transition animation */}
			{type === "fade-black" && (
				<div className="absolute inset-0 bg-black animate-[fadeBlackPreview_2.4s_ease-in-out_infinite]" />
			)}
			{type === "dip-white" && (
				<div className="absolute inset-0 bg-white animate-[dipWhitePreview_2.4s_ease-in-out_infinite]" />
			)}
			{type === "cross-dissolve" && (
				<div className="absolute inset-0 bg-gradient-to-br from-amber-700/80 via-rose-900/80 to-purple-900/80 animate-[crossDissolvePreview_2.4s_ease-in-out_infinite]" />
			)}
			{type === "zoom-in" && (
				<div className="absolute inset-0 flex items-center justify-center animate-[zoomInPreview_2.4s_ease-in-out_infinite]">
					<div className="h-6 w-6 rounded border border-emerald-400/60 bg-emerald-500/20" />
				</div>
			)}
			{type === "zoom-out" && (
				<div className="absolute inset-0 flex items-center justify-center animate-[zoomOutPreview_2.4s_ease-in-out_infinite]">
					<div className="h-6 w-6 rounded border border-emerald-400/60 bg-emerald-500/20" />
				</div>
			)}
			{type === "slide-left" && (
				<div className="absolute inset-y-0 w-full animate-[slideLeftPreview_2.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-slate-900/95 to-transparent border-r border-blue-400/80 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
			)}
			{type === "slide-right" && (
				<div className="absolute inset-y-0 w-full animate-[slideRightPreview_2.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-slate-900/95 to-transparent border-l border-violet-400/80 shadow-[0_0_8px_rgba(139,92,246,0.5)]" />
			)}
			{type === "glitch" && (
				<div className="absolute inset-0 flex flex-col justify-around pointer-events-none animate-[glitchPreview_2.4s_steps(2,start)_infinite]">
					<div className="h-0.5 w-full bg-cyan-400/50 translate-x-1" />
					<div className="h-1 w-full bg-pink-500/50 -translate-x-1" />
					<div className="h-0.5 w-full bg-yellow-400/40 translate-x-1" />
				</div>
			)}
			{type === "film-burn" && (
				<div className="absolute inset-0 bg-gradient-to-tr from-amber-600/30 via-orange-500/40 to-yellow-300/30 mix-blend-screen animate-pulse" />
			)}

			<span className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 backdrop-blur-sm border border-white/10 shadow">
				{getTransitionIcon(type)}
			</span>
		</div>
	);
}

interface TransitionPickerDialogProps {
	isOpen: boolean;
	onClose: () => void;
	cutTimeMs: number;
	existingTransition?: TransitionRegion | null;
	onApplyTransition: (params: {
		type: TransitionType;
		durationMs: number;
		existingId?: string;
	}) => void;
	onRemoveTransition?: (id: string) => void;
}

export function TransitionPickerDialog({
	isOpen,
	onClose,
	cutTimeMs,
	existingTransition,
	onApplyTransition,
	onRemoveTransition,
}: TransitionPickerDialogProps) {
	const [selectedType, setSelectedType] = useState<TransitionType>(
		existingTransition?.type ?? "cross-dissolve",
	);
	const initialDuration = existingTransition
		? existingTransition.endMs - existingTransition.startMs
		: 1000;
	const [durationMs, setDurationMs] = useState<number>(initialDuration);

	const handleApply = useCallback(() => {
		onApplyTransition({
			type: selectedType,
			durationMs,
			existingId: existingTransition?.id,
		});
		onClose();
	}, [selectedType, durationMs, existingTransition, onApplyTransition, onClose]);

	const handleRemove = useCallback(() => {
		if (existingTransition && onRemoveTransition) {
			onRemoveTransition(existingTransition.id);
		}
		onClose();
	}, [existingTransition, onRemoveTransition, onClose]);

	const formatTime = (ms: number) => {
		const totalSec = Math.floor(ms / 1000);
		const mins = Math.floor(totalSec / 60);
		const secs = totalSec % 60;
		const centis = Math.floor((ms % 1000) / 10);
		return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
	};

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-w-2xl bg-[#12141c]/95 border-white/10 text-white backdrop-blur-2xl shadow-2xl p-6 sm:rounded-2xl">
				<DialogHeader className="gap-1">
					<div className="flex items-center justify-between">
						<DialogTitle className="text-base font-semibold text-white flex items-center gap-2">
							<ArrowsClockwise className="w-4 h-4 text-blue-400" />
							{existingTransition ? "Edit Cut Transition" : "Add Cut Transition"}
						</DialogTitle>
						<span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 font-mono">
							Split at {formatTime(cutTimeMs)}
						</span>
					</div>
					<DialogDescription className="text-xs text-muted-foreground">
						Select a transition to blend between the two split clips at this cut point.
					</DialogDescription>
				</DialogHeader>

				{/* Duration selector */}
				<div className="flex items-center justify-between py-2 border-y border-white/5">
					<span className="text-xs font-medium text-white/80">Duration</span>
					<div className="flex items-center gap-1.5">
						{DURATION_PRESETS.map((d) => (
							<button
								key={d}
								type="button"
								onClick={() => setDurationMs(d)}
								className={cn(
									"px-2.5 py-1 text-[11px] font-medium rounded-md transition-all",
									durationMs === d
										? "bg-blue-600 text-white shadow-sm shadow-blue-500/30"
										: "bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white border border-white/5",
								)}
							>
								{(d / 1000).toFixed(1)}s
							</button>
						))}
					</div>
				</div>

				{/* Transition presets grid */}
				<div className="grid grid-cols-3 gap-2.5 max-h-[300px] overflow-y-auto pr-1 py-1">
					{TRANSITION_PRESETS.map((preset) => {
						const isSelected = selectedType === preset.type;
						return (
							<button
								key={preset.type}
								type="button"
								onClick={() => setSelectedType(preset.type)}
								className={cn(
									"flex flex-col gap-1.5 p-2 rounded-xl text-left transition-all border group relative",
									isSelected
										? "bg-blue-600/15 border-blue-500/80 shadow-md shadow-blue-500/10"
										: "bg-white/[0.02] hover:bg-white/[0.06] border-white/5 hover:border-white/15",
								)}
							>
								{isSelected && (
									<span className="absolute top-3 right-3 z-20 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-white shadow-sm">
										<Check className="h-2.5 w-2.5 stroke-[3]" />
									</span>
								)}
								<TransitionPreview type={preset.type} />
								<div className="flex flex-col min-w-0">
									<span className="text-xs font-semibold text-white/90 group-hover:text-white truncate">
										{preset.name}
									</span>
									<span className="text-[10px] text-muted-foreground line-clamp-1 leading-tight">
										{preset.description}
									</span>
								</div>
							</button>
						);
					})}
				</div>

				{/* Footer buttons */}
				<DialogFooter className="flex sm:justify-between items-center gap-2 pt-2 border-t border-white/5">
					<div>
						{existingTransition && (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={handleRemove}
								className="h-8 gap-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
							>
								<Trash className="w-3.5 h-3.5" />
								Remove Transition
							</Button>
						)}
					</div>
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={onClose}
							className="h-8 text-xs border-white/10 text-white/70 hover:text-white hover:bg-white/[0.05]"
						>
							Cancel
						</Button>
						<Button
							type="button"
							size="sm"
							onClick={handleApply}
							className="h-8 gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-md shadow-blue-600/30"
						>
							<Check className="w-3.5 h-3.5" />
							{existingTransition ? "Update Transition" : "Apply Transition"}
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
