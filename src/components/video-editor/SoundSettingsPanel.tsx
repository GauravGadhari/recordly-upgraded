import {
	Pause,
	Play,
	Plus,
	Sparkle,
	SpeakerHigh,
	UploadSimple,
	X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useScopedT } from "@/contexts/I18nContext";
import { cn } from "@/lib/utils";
import { probeAudioDurationMs } from "./mediaLibrary/audioDuration";
import type { MediaLibraryPanelProps } from "./mediaLibrary/mediaLibraryTypes";
import { useResolvedMediaUrl } from "./mediaLibrary/useResolvedMediaUrl";

type SoundItem = {
	id: string;
	name: string;
	filePath: string;
	category: string;
};

const MAX_VISIBLE_SOUNDS = 400;

export function SoundSettingsPanel({
	onAddSound,
	onGenerateCursorSfx,
	onClearCursorSfx,
	onGenerateKeystrokeSfx,
}: Pick<
	MediaLibraryPanelProps,
	"onAddSound" | "onGenerateCursorSfx" | "onClearCursorSfx" | "onGenerateKeystrokeSfx"
>) {
	const t = useScopedT("settings");
	const [items, setItems] = useState<SoundItem[]>([]);
	const [categories, setCategories] = useState<string[]>(["All"]);
	const [activeCategory, setActiveCategory] = useState("All");
	const [search, setSearch] = useState("");
	const [loading, setLoading] = useState(true);
	const [failed, setFailed] = useState(false);
	const [playingId, setPlayingId] = useState<string | null>(null);
	const [previewVolume, setPreviewVolume] = useState(1);
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const [previewPath, setPreviewPath] = useState<string | null>(null);
	const previewUrl = useResolvedMediaUrl(previewPath);

	useEffect(() => {
		let cancelled = false;
		const api = window.electronAPI;
		if (!api?.listMediaSounds) {
			setLoading(false);
			setFailed(true);
			return;
		}
		void api
			.listMediaSounds()
			.then((result) => {
				if (cancelled) return;
				if (result.success) {
					setItems(result.items as SoundItem[]);
					setCategories(result.categories.length > 0 ? result.categories : ["All"]);
				} else {
					setFailed(true);
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

	// Stop preview playback when leaving the panel.
	useEffect(
		() => () => {
			audioRef.current?.pause();
			audioRef.current = null;
		},
		[],
	);

	// Wire the resolved preview URL into the shared audio element.
	useEffect(() => {
		if (!previewUrl || !playingId) return;
		if (!audioRef.current) {
			const element = new Audio();
			element.addEventListener("ended", () => setPlayingId(null));
			audioRef.current = element;
		}
		const element = audioRef.current;
		element.src = previewUrl;
		element.volume = previewVolume;
		void element.play().catch(() => setPlayingId(null));
	}, [previewUrl, playingId, previewVolume]);

	useEffect(() => {
		if (audioRef.current) audioRef.current.volume = previewVolume;
	}, [previewVolume]);

	const togglePreview = useCallback(
		(item: SoundItem) => {
			if (playingId === item.id) {
				audioRef.current?.pause();
				setPlayingId(null);
				return;
			}
			setPlayingId(item.id);
			setPreviewPath(item.filePath);
		},
		[playingId],
	);

	const handleAdd = useCallback(
		async (item: SoundItem) => {
			try {
				const url = await window.electronAPI?.getLocalMediaUrl?.(item.filePath);
				const probeUrl = url?.success ? url.url : item.filePath;
				const durationMs = (await probeAudioDurationMs(probeUrl)) ?? undefined;
				onAddSound({
					filePath: item.filePath,
					name: item.name,
					category: item.category,
					durationMs,
				});
				toast.success(`Added "${item.name}" to the timeline`);
			} catch {
				onAddSound({ filePath: item.filePath, name: item.name, category: item.category });
			}
		},
		[onAddSound],
	);

	const handleImport = useCallback(async () => {
		const result = await window.electronAPI?.pickMediaFile?.("sound");
		if (!result?.success || !result.filePath) return;
		const url = await window.electronAPI?.getLocalMediaUrl?.(result.filePath);
		const probeUrl = url?.success ? url.url : result.filePath;
		const durationMs = (await probeAudioDurationMs(probeUrl)) ?? undefined;
		onAddSound({
			filePath: result.filePath,
			name: result.name,
			category: "Imported",
			durationMs,
		});
	}, [onAddSound]);

	const categoryCounts = useMemo(() => {
		const counts: Record<string, number> = { All: items.length };
		for (const item of items) {
			counts[item.category] = (counts[item.category] ?? 0) + 1;
		}
		return counts;
	}, [items]);

	const filtered = useMemo(() => {
		const query = search.trim().toLowerCase();
		return items
			.filter((item) => {
				if (activeCategory !== "All" && item.category !== activeCategory) return false;
				if (query && !item.name.toLowerCase().includes(query)) return false;
				return true;
			})
			.slice(0, MAX_VISIBLE_SOUNDS);
	}, [activeCategory, items, search]);

	return (
		<section className="flex flex-col gap-3">
			<div className="flex items-center justify-between gap-2">
				<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{t("sections.sounds", "Sounds")}
				</h3>
				<Button
					variant="outline"
					size="sm"
					onClick={() => void handleImport()}
					className="h-7 gap-1.5 border-foreground/10 bg-foreground/5 px-2 text-[10px] text-foreground hover:bg-foreground/10"
				>
					<UploadSimple className="h-3 w-3" />
					{t("sounds.import", "Import Sound…")}
				</Button>
			</div>

			{onGenerateCursorSfx ? (
				<div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 backdrop-blur-sm flex flex-col gap-2.5">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-1.5">
							<Sparkle className="h-4 w-4 text-[#2563EB]" weight="fill" />
							<span className="text-xs font-semibold text-foreground">
								Auto Interaction, Keys, Scroll & Zoom SFX
							</span>
						</div>
						<span className="text-[10px] text-muted-foreground">
							From telemetry
						</span>
					</div>
					<p className="text-[11px] text-muted-foreground leading-relaxed">
						Automatically detect clicks, mouse scrolling, keystrokes, drags, whoosh sweeps, and zoom transitions to populate dedicated audio tracks.
					</p>
					<div className="flex flex-wrap items-center gap-2 pt-0.5">
						<Button
							size="sm"
							onClick={() => onGenerateCursorSfx()}
							className="h-7 flex-1 min-w-[120px] gap-1.5 bg-[#2563EB] hover:bg-[#1d4ed8] text-white text-[11px] font-medium"
						>
							<Sparkle className="h-3.5 w-3.5" />
							Generate All SFX
						</Button>
						{onGenerateKeystrokeSfx ? (
							<Button
								variant="outline"
								size="sm"
								onClick={() => onGenerateKeystrokeSfx()}
								title="Generate only keystroke typing sounds"
								className="h-7 border-white/10 bg-white/5 hover:bg-white/10 text-foreground text-[10px] px-2.5"
							>
								Keys Only
							</Button>
						) : null}
						{onClearCursorSfx ? (
							<Button
								variant="outline"
								size="sm"
								onClick={onClearCursorSfx}
								title="Clear all generated SFX from timeline"
								className="h-7 border-white/10 bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground text-[10px] px-2"
							>
								Clear
							</Button>
						) : null}
					</div>
				</div>
			) : null}

			<div className="relative flex items-center">
				<Input
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					placeholder={t("sounds.searchPlaceholder", "Search sounds…")}
					className="h-7 pr-7 border-foreground/10 bg-editor-bg text-xs placeholder:text-muted-foreground/60"
				/>
				{search ? (
					<button
						type="button"
						onClick={() => setSearch("")}
						className="absolute right-2 text-muted-foreground hover:text-foreground"
						title="Clear search"
					>
						<X className="h-3 w-3" />
					</button>
				) : null}
			</div>

			<div className="flex flex-wrap gap-1">
				{categories.map((category) => {
					const count = categoryCounts[category];
					return (
						<button
							key={category}
							type="button"
							onClick={() => setActiveCategory(category)}
							className={cn(
								"rounded-full border px-2 py-0.5 text-[10px] transition-colors flex items-center gap-1",
								activeCategory === category
									? "border-[#2563EB] bg-[#2563EB]/15 text-[#2563EB]"
									: "border-foreground/10 bg-foreground/[0.03] text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground",
							)}
						>
							<span>{category}</span>
							{count !== undefined ? (
								<span className="text-[9px] opacity-60">({count})</span>
							) : null}
						</button>
					);
				})}
			</div>

			<div className="flex items-center gap-2">
				<SpeakerHigh className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
				<input
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={previewVolume}
					onChange={(event) => setPreviewVolume(Number(event.target.value))}
					className="h-1 w-full cursor-ew-resize accent-[#2563EB]"
					aria-label={t("sounds.previewVolume", "Preview volume")}
				/>
				<span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">
					{Math.round(previewVolume * 100)}%
				</span>
			</div>

			{loading ? (
				<div className="py-8 text-center text-xs text-muted-foreground">
					{t("sounds.loading", "Scanning the sound library…")}
				</div>
			) : failed ? (
				<div className="rounded-lg bg-foreground/[0.03] px-2.5 py-6 text-center">
					<p className="text-[11px] text-muted-foreground">
						{t(
							"sounds.libraryUnavailable",
							"Sound library unavailable. Check that the asset drive is mounted.",
						)}
					</p>
				</div>
			) : (
				<div className="flex flex-col gap-1">
					{filtered.length === 0 ? (
						<p className="py-6 text-center text-[11px] text-muted-foreground">
							{t("sounds.noResults", "No sounds match this filter.")}
						</p>
					) : null}
					{filtered.map((item) => {
						const isPlaying = playingId === item.id;
						return (
							<div
								key={item.id}
								className="group flex items-center gap-2 rounded-lg border border-transparent bg-foreground/[0.02] px-2 py-1.5 transition-colors hover:bg-foreground/[0.05]"
							>
								<button
									type="button"
									onClick={() => togglePreview(item)}
									title={
										isPlaying
											? t("sounds.pause", "Pause preview")
											: t("sounds.preview", "Preview sound")
									}
									className={cn(
										"flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full transition-colors",
										isPlaying
											? "bg-[#2563EB] text-white"
											: "bg-foreground/[0.06] text-foreground/70 hover:bg-[#2563EB]/20 hover:text-[#2563EB]",
									)}
								>
									{isPlaying ? (
										<Pause className="h-3 w-3" weight="fill" />
									) : (
										<Play className="h-3 w-3" weight="fill" />
									)}
								</button>
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-1.5">
										<p className="truncate text-[11px] font-medium text-foreground">
											{item.name}
										</p>
										{isPlaying ? (
											<span className="flex items-end gap-0.5 h-3 flex-shrink-0">
												<span className="h-1.5 w-0.5 animate-pulse rounded-full bg-[#2563EB]" />
												<span className="h-3 w-0.5 animate-pulse rounded-full bg-[#2563EB]" style={{ animationDelay: "150ms" }} />
												<span className="h-2 w-0.5 animate-pulse rounded-full bg-[#2563EB]" style={{ animationDelay: "300ms" }} />
											</span>
										) : null}
									</div>
									<p className="truncate text-[10px] text-muted-foreground">
										{item.category}
									</p>
								</div>
								<Button
									variant="ghost"
									size="icon"
									onClick={() => void handleAdd(item)}
									title={t("sounds.addToTimeline", "Add to timeline at playhead")}
									className="h-6 w-6 flex-shrink-0 rounded-full text-muted-foreground opacity-0 transition-all hover:bg-[#2563EB]/10 hover:text-[#2563EB] focus:opacity-100 group-hover:opacity-100"
								>
									<Plus className="h-3.5 w-3.5" />
								</Button>
							</div>
						);
					})}
				</div>
			)}
		</section>
	);
}
