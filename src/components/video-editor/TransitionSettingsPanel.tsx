import {
	ArrowLeft,
	ArrowRight,
	ArrowsClockwise,
	FilmStrip,
	Lightning,
	MagnifyingGlassMinus,
	MagnifyingGlassPlus,
	Moon,
	Play,
	Plus,
	Sparkle,
	SquaresFour,
	Sun,
	Trash,
	UploadSimple,
	Waveform,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useScopedT } from "@/contexts/I18nContext";
import { cn } from "@/lib/utils";
import type { MediaLibraryPanelProps } from "./mediaLibrary/mediaLibraryTypes";
import { useMediaPreviewUrl } from "./mediaLibrary/useMediaPreviewUrl";
import type { TransitionRegion, TransitionType } from "./types";

type BuiltInTransition = {
	id: string;
	name: string;
	type: string;
	description?: string;
};

type VideoTransitionItem = {
	id: string;
	name: string;
	filePath: string;
	type: "film-burn" | "green-screen";
	isGreenScreen?: boolean;
};

type SfxOption = {
	id: string;
	name: string;
	filePath: string;
};

const DURATION_OPTIONS_MS = [500, 1000, 1500, 2000];
const NONE_VALUE = "__none__";

function useInView(ref: React.RefObject<HTMLElement | null>, rootMargin = "120px") {
	const [isInView, setIsInView] = useState(false);

	useEffect(() => {
		const element = ref.current;
		if (!element || typeof IntersectionObserver === "undefined") {
			setIsInView(true);
			return;
		}
		const observer = new IntersectionObserver(
			([entry]) => {
				setIsInView(entry.isIntersecting);
			},
			{ rootMargin },
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, [ref, rootMargin]);

	return isInView;
}

function getBuiltInIcon(type: string) {
	switch (type) {
		case "fade-black":
			return <Moon className="h-3.5 w-3.5 text-zinc-400" />;
		case "dip-white":
			return <Sun className="h-3.5 w-3.5 text-amber-300" />;
		case "cross-dissolve":
			return <SquaresFour className="h-3.5 w-3.5 text-blue-400" />;
		case "zoom-in":
			return <MagnifyingGlassPlus className="h-3.5 w-3.5 text-emerald-400" />;
		case "zoom-out":
			return <MagnifyingGlassMinus className="h-3.5 w-3.5 text-emerald-400" />;
		case "slide-left":
			return <ArrowLeft className="h-3.5 w-3.5 text-violet-400" />;
		case "slide-right":
			return <ArrowRight className="h-3.5 w-3.5 text-violet-400" />;
		case "glitch":
			return <Lightning className="h-3.5 w-3.5 text-cyan-400" />;
		default:
			return <Sparkle className="h-3.5 w-3.5 text-muted-foreground" />;
	}
}

/**
 * Autoplaying animated micro-preview for built-in transitions.
 */
function AnimatedTransitionThumbnail({ type }: { type: string }) {
	return (
		<div className="relative aspect-video w-full overflow-hidden rounded bg-zinc-950 flex items-center justify-center">
			{/* Simulated background footage scene */}
			<div className="absolute inset-0 bg-gradient-to-tr from-blue-950 via-slate-900 to-indigo-950 opacity-90" />
			<div className="absolute h-6 w-6 rounded-full bg-blue-500/30 blur-sm" />

			{/* Animated transition effect preview */}
			{type === "fade-black" && (
				<div className="absolute inset-0 bg-black animate-[fadeBlackPreview_2.4s_ease-in-out_infinite]" />
			)}
			{type === "dip-white" && (
				<div className="absolute inset-0 bg-white animate-[dipWhitePreview_2.4s_ease-in-out_infinite]" />
			)}
			{type === "cross-dissolve" && (
				<div className="absolute inset-0 bg-gradient-to-br from-amber-700 via-rose-900 to-purple-900 animate-[crossDissolvePreview_2.4s_ease-in-out_infinite]" />
			)}
			{type === "zoom-in" && (
				<div className="absolute inset-0 flex items-center justify-center animate-[zoomInPreview_2.4s_ease-in-out_infinite]">
					<div className="h-7 w-7 rounded-lg border border-emerald-400/60 bg-emerald-500/20" />
				</div>
			)}
			{type === "zoom-out" && (
				<div className="absolute inset-0 flex items-center justify-center animate-[zoomOutPreview_2.4s_ease-in-out_infinite]">
					<div className="h-7 w-7 rounded-lg border border-emerald-400/60 bg-emerald-500/20" />
				</div>
			)}
			{type === "slide-left" && (
				<div className="absolute inset-y-0 w-full animate-[slideLeftPreview_2.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-slate-900/95 to-transparent border-r border-blue-400/80 shadow-[0_0_12px_rgba(59,130,246,0.5)]" />
			)}
			{type === "slide-right" && (
				<div className="absolute inset-y-0 w-full animate-[slideRightPreview_2.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-slate-900/95 to-transparent border-l border-violet-400/80 shadow-[0_0_12px_rgba(139,92,246,0.5)]" />
			)}
			{type === "glitch" && (
				<div className="absolute inset-0 flex flex-col justify-around pointer-events-none animate-[glitchPreview_2.4s_steps(2,start)_infinite]">
					<div className="h-1 w-full bg-cyan-400/40 translate-x-1" />
					<div className="h-1.5 w-full bg-pink-500/40 -translate-x-1" />
					<div className="h-1 w-full bg-yellow-400/30 translate-x-1.5" />
				</div>
			)}

			<span className="relative z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 shadow-sm">
				{getBuiltInIcon(type)}
			</span>
		</div>
	);
}

function VideoTransitionPreviewCard({
	item,
	isSelected,
	isPreviewing,
	onTogglePreview,
	onSelect,
}: {
	item: VideoTransitionItem;
	isSelected: boolean;
	isPreviewing: boolean;
	onTogglePreview: () => void;
	onSelect: () => void;
}) {
	const cardRef = useRef<HTMLDivElement | null>(null);
	const isInView = useInView(cardRef);
	const [isHovered, setIsHovered] = useState(false);
	const shouldLoadVideo = isInView || isPreviewing || isHovered;
	const url = useMediaPreviewUrl(shouldLoadVideo ? item.filePath : null);

	return (
		<div
			ref={cardRef}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			className={cn(
				"relative overflow-hidden rounded-lg border bg-black/70 transition-colors",
				isSelected ? "border-[#2563EB]" : "border-foreground/10 hover:border-foreground/25",
			)}
		>
			<button
				type="button"
				onClick={onSelect}
				title={item.name}
				className="aspect-video w-full relative block"
			>
				{isInView && url ? (
					<video
						src={url}
						autoPlay
						muted
						loop
						playsInline
						className={cn(
							"h-full w-full object-cover",
							item.isGreenScreen ? "" : "mix-blend-screen",
						)}
					/>
				) : (
					<span className="flex h-full w-full items-center justify-center">
						<FilmStrip className="h-4 w-4 text-foreground/40" />
					</span>
				)}
			</button>
			<button
				type="button"
				onClick={onTogglePreview}
				title={isPreviewing ? "Stop preview" : "Play preview"}
				className={cn(
					"absolute bottom-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white/80 transition-colors hover:bg-[#2563EB]",
					isPreviewing && "bg-[#2563EB] text-white",
				)}
			>
				<Play className="h-2.5 w-2.5" weight="fill" />
			</button>
			{item.isGreenScreen ? (
				<span className="absolute left-1 top-1 rounded bg-emerald-600/90 px-1 py-px text-[8px] font-semibold uppercase tracking-wide text-white shadow-sm">
					Green Screen
				</span>
			) : (
				<span className="absolute left-1 top-1 rounded bg-zinc-800/80 px-1 py-px text-[8px] font-semibold uppercase tracking-wide text-zinc-300 shadow-sm">
					Black Screen
				</span>
			)}
			<p className="truncate px-1.5 py-1 text-[9px] text-foreground/80">{item.name}</p>
		</div>
	);
}

function SelectedTransitionEditor({
	region,
	onTransitionUpdate,
	onTransitionDelete,
	onSeekToTime,
}: {
	region: TransitionRegion;
	onTransitionUpdate?: (id: string, updates: Partial<Omit<TransitionRegion, "id">>) => void;
	onTransitionDelete?: (id: string) => void;
	onSeekToTime?: (timeMs: number) => void;
}) {
	const t = useScopedT("settings");
	const durationMs = region.endMs - region.startMs;
	const isOverlay = Boolean(region.overlayVideoPath);
	const isGreenScreen = region.greenScreen || region.blendMode === "chroma-key";

	const handleDurationChange = (newDurationMs: number) => {
		if (!onTransitionUpdate || newDurationMs <= 0) return;
		onTransitionUpdate(region.id, {
			endMs: region.startMs + newDurationMs,
		});
	};

	const handleModeChange = (mode: "screen" | "chroma-key") => {
		if (!onTransitionUpdate) return;
		if (mode === "chroma-key") {
			onTransitionUpdate(region.id, {
				greenScreen: true,
				blendMode: "chroma-key",
				chromaKeySimilarity: region.chromaKeySimilarity ?? 0.35,
			});
		} else {
			onTransitionUpdate(region.id, {
				greenScreen: false,
				blendMode: "screen",
			});
		}
	};

	return (
		<div className="flex flex-col gap-2.5 rounded-lg border border-foreground/10 bg-foreground/[0.03] p-2.5">
			<div className="flex items-center justify-between gap-2">
				<div className="min-w-0 flex items-center gap-1.5">
					<span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded bg-foreground/[0.08]">
						{getBuiltInIcon(region.type)}
					</span>
					<p className="min-w-0 truncate text-[11px] font-medium text-foreground">
						{region.name || region.type}
					</p>
				</div>
				<div className="flex items-center gap-1">
					{onSeekToTime && (
						<button
							type="button"
							onClick={() => onSeekToTime(region.startMs)}
							className="flex items-center gap-1 text-[10px] text-[#2563EB] hover:opacity-80"
						>
							<ArrowsClockwise className="h-3 w-3" />
							{t("transitions.goto", "Go")}
						</button>
					)}
					{onTransitionDelete && (
						<button
							type="button"
							onClick={() => onTransitionDelete(region.id)}
							title="Delete transition"
							className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
						>
							<Trash className="h-3 w-3" />
						</button>
					)}
				</div>
			</div>

			<div>
				<p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
					{t("transitions.duration", "Duration")}
				</p>
				<ToggleGroup
					type="single"
					value={String(durationMs)}
					onValueChange={(val) => {
						if (val) handleDurationChange(Number(val));
					}}
					className="grid grid-cols-4 gap-1"
				>
					{DURATION_OPTIONS_MS.map((ms) => (
						<ToggleGroupItem
							key={ms}
							value={String(ms)}
							className="h-6 border-foreground/10 bg-foreground/[0.03] text-[9px] data-[state=on]:border-[#2563EB] data-[state=on]:bg-[#2563EB]/10 data-[state=on]:text-[#2563EB]"
						>
							{ms < 1000 ? `${ms}ms` : `${ms / 1000}s`}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</div>

			{isOverlay && (
				<div className="flex flex-col gap-2 rounded border border-foreground/10 bg-foreground/[0.02] p-2">
					<p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
						Background Mode
					</p>
					<div className="grid grid-cols-2 gap-1">
						<button
							type="button"
							onClick={() => handleModeChange("screen")}
							className={cn(
								"rounded border py-1 px-2 text-[9px] font-medium transition-colors text-center",
								!isGreenScreen
									? "border-[#2563EB] bg-[#2563EB]/10 text-[#2563EB]"
									: "border-foreground/10 bg-foreground/[0.03] text-muted-foreground hover:bg-foreground/[0.06]",
							)}
						>
							Black Screen (Screen)
						</button>
						<button
							type="button"
							onClick={() => handleModeChange("chroma-key")}
							className={cn(
								"rounded border py-1 px-2 text-[9px] font-medium transition-colors text-center",
								isGreenScreen
									? "border-emerald-600 bg-emerald-600/10 text-emerald-400"
									: "border-foreground/10 bg-foreground/[0.03] text-muted-foreground hover:bg-foreground/[0.06]",
							)}
						>
							Green Screen (Chroma)
						</button>
					</div>

					{isGreenScreen && onTransitionUpdate && (
						<label className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
							<span className="w-16 flex-shrink-0">Key Similarity</span>
							<input
								type="range"
								min={0.1}
								max={0.6}
								step={0.01}
								value={region.chromaKeySimilarity ?? 0.35}
								onChange={(e) =>
									onTransitionUpdate(region.id, {
										chromaKeySimilarity: Number(e.target.value),
									})
								}
								className="h-1 w-full cursor-ew-resize accent-emerald-500"
							/>
							<span className="w-8 flex-shrink-0 text-right tabular-nums">
								{Math.round((region.chromaKeySimilarity ?? 0.35) * 100)}%
							</span>
						</label>
					)}
				</div>
			)}
		</div>
	);
}

export function TransitionSettingsPanel({
	onAddTransition,
	transitionRegions = [],
	selectedTransitionId = null,
	onTransitionUpdate,
	onTransitionDelete,
	onSeekToTime,
}: Partial<MediaLibraryPanelProps> & Pick<MediaLibraryPanelProps, "onAddTransition">) {
	const t = useScopedT("settings");
	const [builtIns, setBuiltIns] = useState<BuiltInTransition[]>([]);
	const [filmBurns, setFilmBurns] = useState<VideoTransitionItem[]>([]);
	const [greenScreens, setGreenScreens] = useState<VideoTransitionItem[]>([]);
	const [sfxOptions, setSfxOptions] = useState<SfxOption[]>([]);
	const [loading, setLoading] = useState(true);
	const [failed, setFailed] = useState(false);

	const [activeCategory, setActiveCategory] = useState<"all" | "builtin" | "black-screen" | "green-screen">("all");
	const [selectedKind, setSelectedKind] = useState<"builtin" | "film-burn" | "green-screen" | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [durationMs, setDurationMs] = useState(1000);
	const [sfxValue, setSfxValue] = useState<string>(NONE_VALUE);
	const [previewVideoId, setPreviewVideoId] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		const api = window.electronAPI;
		if (!api?.listMediaTransitions) {
			setLoading(false);
			setFailed(true);
			return;
		}
		void Promise.all([
			api.listMediaTransitions(),
			api.listMediaSounds({ category: "Transition SFX" }).catch(() => null),
			api.listMediaMemes({ category: "Green Screen" }).catch(() => null),
		])
			.then(([transitions, sounds, greenMemes]) => {
				if (cancelled) return;
				if (transitions.success) {
					setBuiltIns(transitions.builtIn as BuiltInTransition[]);
					setFilmBurns(
						(transitions.filmBurns || []).map((b) => ({
							id: b.id,
							name: b.name,
							filePath: b.filePath,
							type: "film-burn" as const,
							isGreenScreen: false,
						})),
					);
				} else {
					setFailed(true);
				}
				if (sounds?.success) {
					setSfxOptions(
						sounds.items.map((item, index) => ({
							id: `sfx-${index}`,
							name: item.name,
							filePath: item.filePath,
						})),
					);
				}
				if (greenMemes?.success) {
					setGreenScreens(
						greenMemes.items.slice(0, 30).map((item) => ({
							id: `green-trans-${item.id}`,
							name: item.name,
							filePath: item.filePath,
							type: "green-screen" as const,
							isGreenScreen: true,
						})),
					);
				}
			})
			.catch(() => {
				if (!cancelled) setFailed(true);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const selectedBuiltIn = builtIns.find((item) => item.id === selectedId);
	const selectedBurn = filmBurns.find((item) => item.id === selectedId);
	const selectedGreen = greenScreens.find((item) => item.id === selectedId);
	const canAdd = selectedKind !== null && selectedId !== null;

	const handleAdd = useCallback(() => {
		if (!canAdd) return;
		const sfxPath = sfxValue !== NONE_VALUE ? sfxOptions.find((s) => s.id === sfxValue)?.filePath : undefined;

		if (selectedKind === "film-burn" && selectedBurn) {
			onAddTransition({
				type: "film-burn",
				durationMs,
				overlayVideoPath: selectedBurn.filePath,
				sfxAudioPath: sfxPath,
				name: selectedBurn.name,
				greenScreen: false,
				blendMode: "screen",
			});
			toast.success(`Added film burn "${selectedBurn.name}" at the playhead`);
			return;
		}

		if (selectedKind === "green-screen" && selectedGreen) {
			onAddTransition({
				type: "film-burn",
				durationMs,
				overlayVideoPath: selectedGreen.filePath,
				sfxAudioPath: sfxPath,
				name: selectedGreen.name,
				greenScreen: true,
				chromaKeySimilarity: 0.35,
				blendMode: "chroma-key",
			});
			toast.success(`Added green-screen transition "${selectedGreen.name}" at the playhead`);
			return;
		}

		if (selectedBuiltIn) {
			onAddTransition({
				type: selectedBuiltIn.type as TransitionType,
				durationMs,
				sfxAudioPath: sfxPath,
				name: selectedBuiltIn.name,
			});
			toast.success(`Added ${selectedBuiltIn.name} at the playhead`);
		}
	}, [
		canAdd,
		durationMs,
		onAddTransition,
		selectedBurn,
		selectedGreen,
		selectedBuiltIn,
		selectedKind,
		sfxOptions,
		sfxValue,
	]);

	const handleImportCustom = useCallback(async () => {
		const api = window.electronAPI;
		if (!api?.pickMediaFile) return;
		const result = await api.pickMediaFile("transition");
		if (result.success && result.filePath) {
			const isGreen = /green|greenscreen|key/i.test(result.name || result.filePath);
			onAddTransition({
				type: "film-burn",
				durationMs,
				overlayVideoPath: result.filePath,
				name: result.name || "Custom Transition",
				greenScreen: isGreen,
				chromaKeySimilarity: isGreen ? 0.35 : undefined,
				blendMode: isGreen ? "chroma-key" : "screen",
			});
			toast.success(`Imported transition "${result.name}" at the playhead`);
		}
	}, [durationMs, onAddTransition]);

	const selectedTransitionRegion = transitionRegions.find(
		(r) => r.id === selectedTransitionId,
	);

	if (loading) {
		return (
			<section className="py-8 text-center text-xs text-muted-foreground">
				{t("transitions.loading", "Loading transition presets…")}
			</section>
		);
	}

	if (failed) {
		return (
			<section className="rounded-lg bg-foreground/[0.03] px-2.5 py-6 text-center">
				<p className="text-[11px] text-muted-foreground">
					{t(
						"transitions.libraryUnavailable",
						"Transitions library unavailable. Check that the asset drive is mounted.",
					)}
				</p>
			</section>
		);
	}

	return (
		<section className="flex flex-col gap-3">
			<div className="flex items-center justify-between">
				<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{t("sections.transitions", "Transitions")}
				</h3>
				<button
					type="button"
					onClick={handleImportCustom}
					className="flex items-center gap-1 text-[10px] text-[#2563EB] hover:opacity-80"
				>
					<UploadSimple className="h-3 w-3" />
					Import Video
				</button>
			</div>

			{/* Selected Transition Inspector */}
			{selectedTransitionRegion && (
				<SelectedTransitionEditor
					region={selectedTransitionRegion}
					onTransitionUpdate={onTransitionUpdate}
					onTransitionDelete={onTransitionDelete}
					onSeekToTime={onSeekToTime}
				/>
			)}

			{/* Category Filter Tabs */}
			<div className="flex gap-1 overflow-x-auto pb-1 text-[10px]">
				{(
					[
						{ id: "all", label: "All" },
						{ id: "builtin", label: "Built-in" },
						{ id: "black-screen", label: "Black Screen" },
						{ id: "green-screen", label: "Green Screen" },
					] as const
				).map((tab) => (
					<button
						key={tab.id}
						type="button"
						onClick={() => setActiveCategory(tab.id)}
						className={cn(
							"rounded px-2 py-0.5 whitespace-nowrap transition-colors",
							activeCategory === tab.id
								? "bg-[#2563EB] text-white"
								: "bg-foreground/[0.04] text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground",
						)}
					>
						{tab.label}
					</button>
				))}
			</div>

			{/* Built-in Transitions with Autoplaying Animated Micro-Previews */}
			{(activeCategory === "all" || activeCategory === "builtin") && (
				<div>
					<p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
						<Sparkle className="h-3 w-3" />
						{t("transitions.builtIn", "Built-in")}
					</p>
					<div className="grid grid-cols-2 gap-1.5">
						{builtIns.map((item) => (
							<button
								key={item.id}
								type="button"
								onClick={() => {
									setSelectedKind("builtin");
									setSelectedId(item.id);
								}}
								title={item.description}
								className={cn(
									"flex flex-col gap-1.5 rounded-lg border p-1.5 text-left transition-colors",
									selectedId === item.id
										? "border-[#2563EB] bg-[#2563EB]/10 text-[#2563EB]"
										: "border-foreground/10 bg-foreground/[0.03] text-foreground hover:bg-foreground/[0.07]",
								)}
							>
								<AnimatedTransitionThumbnail type={item.type} />
								<span className="truncate text-[10px] font-medium px-0.5">
									{item.name}
								</span>
							</button>
						))}
					</div>
				</div>
			)}

			{/* Black Screen: Film Burns & Light Leaks with Autoplaying Video */}
			{(activeCategory === "all" || activeCategory === "black-screen") && (
				<div>
					<p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
						<FilmStrip className="h-3 w-3" />
						{t("transitions.filmBurns", "Film Burns (Black Screen)")}
						<span className="text-muted-foreground/60">({filmBurns.length})</span>
					</p>
					{filmBurns.length === 0 ? (
						<p className="text-[11px] text-muted-foreground">
							{t("transitions.noBurns", "No film burn overlays found on the asset drive.")}
						</p>
					) : (
						<div className="grid grid-cols-3 gap-1.5">
							{filmBurns.slice(0, 36).map((item) => (
								<VideoTransitionPreviewCard
									key={item.id}
									item={item}
									isSelected={selectedId === item.id}
									isPreviewing={previewVideoId === item.id}
									onTogglePreview={() =>
										setPreviewVideoId(previewVideoId === item.id ? null : item.id)
									}
									onSelect={() => {
										setSelectedKind("film-burn");
										setSelectedId(item.id);
									}}
								/>
							))}
						</div>
					)}
				</div>
			)}

			{/* Green Screen Transitions with Autoplaying Video */}
			{(activeCategory === "all" || activeCategory === "green-screen") && greenScreens.length > 0 && (
				<div>
					<p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
						<FilmStrip className="h-3 w-3 text-emerald-400" />
						Green Screen Transitions
						<span className="text-muted-foreground/60">({greenScreens.length})</span>
					</p>
					<div className="grid grid-cols-3 gap-1.5">
						{greenScreens.map((item) => (
							<VideoTransitionPreviewCard
								key={item.id}
								item={item}
								isSelected={selectedId === item.id}
								isPreviewing={previewVideoId === item.id}
								onTogglePreview={() =>
									setPreviewVideoId(previewVideoId === item.id ? null : item.id)
								}
								onSelect={() => {
									setSelectedKind("green-screen");
									setSelectedId(item.id);
								}}
							/>
						))}
					</div>
				</div>
			)}

			<div>
				<p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
					{t("transitions.duration", "Duration")}
				</p>
				<ToggleGroup
					type="single"
					value={String(durationMs)}
					onValueChange={(value) => {
						if (value) setDurationMs(Number(value));
					}}
					className="grid grid-cols-4 gap-1.5"
					aria-label={t("transitions.duration", "Duration")}
				>
					{DURATION_OPTIONS_MS.map((ms) => (
						<ToggleGroupItem
							key={ms}
							value={String(ms)}
							className="h-7 border-foreground/10 bg-foreground/[0.03] text-[10px] data-[state=on]:border-[#2563EB] data-[state=on]:bg-[#2563EB]/10 data-[state=on]:text-[#2563EB]"
						>
							{ms < 1000 ? `${ms}ms` : `${ms / 1000}s`}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</div>

			<div>
				<p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
					<Waveform className="h-3 w-3" />
					{t("transitions.attachSfx", "Whoosh / impact SFX")}
				</p>
				<Select value={sfxValue} onValueChange={setSfxValue}>
					<SelectTrigger className="h-7 border-foreground/10 bg-editor-bg text-[11px]">
						<SelectValue />
					</SelectTrigger>
					<SelectContent className="max-h-60 border-foreground/10 bg-editor-surface-alt">
						<SelectItem value={NONE_VALUE} className="text-[11px]">
							{t("transitions.noSfx", "None")}
						</SelectItem>
						{sfxOptions.map((option) => (
							<SelectItem
								key={option.id}
								value={option.id}
								className="text-[11px]"
							>
								{option.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<Button
				size="sm"
				onClick={handleAdd}
				disabled={!canAdd}
				className="h-8 w-full gap-2 bg-[#2563EB] text-xs text-white hover:bg-[#1d4ed8] disabled:opacity-40"
			>
				<Plus className="h-3.5 w-3.5" />
				{t("transitions.add", "Add Transition at Playhead")}
			</Button>
		</section>
	);
}

