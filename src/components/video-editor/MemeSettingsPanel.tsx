import { ArrowsClockwise, Play, Plus, Smiley, UploadSimple } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useScopedT } from "@/contexts/I18nContext";
import { cn } from "@/lib/utils";
import type { MediaLibraryPanelProps } from "./mediaLibrary/mediaLibraryTypes";
import { useMediaPreviewUrl } from "./mediaLibrary/useMediaPreviewUrl";

type MemeItem = {
	id: string;
	name: string;
	filePath: string;
	category: "memes" | "green-screens" | "custom";
	isGreenScreen: boolean;
};

const CATEGORY_FILTERS = ["All", "Meme Clips", "Green Screen"] as const;
const MAX_VISIBLE_MEMES = 200;

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

function MemePreviewCard({
	item,
	isSelected,
	isPreviewing,
	onTogglePreview,
	onSelect,
}: {
	item: MemeItem;
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
				"relative overflow-hidden rounded-lg border bg-black/60 transition-colors",
				isSelected ? "border-[#2563EB]" : "border-foreground/10 hover:border-foreground/25",
			)}
		>
			<button
				type="button"
				onClick={onSelect}
				title={item.name}
				className="aspect-video w-full relative"
			>
				{isInView && url ? (
					<video
						src={url}
						autoPlay
						muted={!isPreviewing}
						loop
						playsInline
						className="h-full w-full object-cover"
					/>
				) : (
					<span className="flex h-full w-full items-center justify-center">
						<Smiley className="h-4 w-4 text-foreground/40" />
					</span>
				)}
			</button>
			<button
				type="button"
				onClick={onTogglePreview}
				title={isPreviewing ? "Mute audio" : "Unmute audio"}
				className={cn(
					"absolute bottom-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white/80 transition-colors hover:bg-[#2563EB]",
					isPreviewing && "bg-[#2563EB] text-white",
				)}
			>
				<Play className="h-2.5 w-2.5" weight="fill" />
			</button>
			{item.isGreenScreen ? (
				<span className="absolute left-1 top-1 rounded bg-emerald-600/90 px-1 py-px text-[8px] font-semibold uppercase tracking-wide text-white shadow-sm">
					Key
				</span>
			) : null}
			<p className="truncate px-1.5 py-1 text-[9px] text-foreground/80">{item.name}</p>
		</div>
	);
}

function SelectedMemeEditor({
	region,
	onMemeUpdate,
	onMemeDelete,
	onSeekToTime,
}: Pick<
	MediaLibraryPanelProps,
	"memeRegions" | "selectedMemeId" | "onMemeUpdate" | "onMemeDelete" | "onSeekToTime"
> & { region: MediaLibraryPanelProps["memeRegions"][number] }) {
	const t = useScopedT("settings");
	const slider = (
		label: string,
		value: number,
		min: number,
		max: number,
		step: number,
		onChange: (next: number) => void,
	) => (
		<label className="flex items-center gap-2 text-[10px] text-muted-foreground">
			<span className="w-14 flex-shrink-0">{label}</span>
			<input
				type="range"
				min={min}
				max={max}
				step={step}
				value={value}
				onChange={(event) => onChange(Number(event.target.value))}
				className="h-1 w-full cursor-ew-resize accent-[#2563EB]"
			/>
			<span className="w-9 flex-shrink-0 text-right tabular-nums">{Math.round(value)}</span>
		</label>
	);

	return (
		<div className="flex flex-col gap-2.5 rounded-lg border border-foreground/10 bg-foreground/[0.03] p-2.5">
			<div className="flex items-center justify-between gap-2">
				<p className="min-w-0 truncate text-[11px] font-medium text-foreground">
					{region.name}
				</p>
				<button
					type="button"
					onClick={() => onSeekToTime?.(region.startMs)}
					className="flex flex-shrink-0 items-center gap-1 text-[10px] text-[#2563EB] hover:opacity-80"
				>
					<ArrowsClockwise className="h-3 w-3" />
					{t("memes.goto", "Go")}
				</button>
			</div>

			<div className="flex flex-col gap-1">
				<span className="text-[10px] font-medium text-muted-foreground">Preset Position</span>
				<div className="grid grid-cols-3 gap-1">
					<button
						type="button"
						onClick={() => onMemeUpdate(region.id, { position: { x: 5, y: 5 } })}
						className="rounded border border-foreground/10 bg-foreground/[0.03] py-1 text-[9px] text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground"
					>
						Top Left
					</button>
					<button
						type="button"
						onClick={() => onMemeUpdate(region.id, { position: { x: 30, y: 30 } })}
						className="rounded border border-foreground/10 bg-foreground/[0.03] py-1 text-[9px] text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground"
					>
						Center
					</button>
					<button
						type="button"
						onClick={() => onMemeUpdate(region.id, { position: { x: 60, y: 5 } })}
						className="rounded border border-foreground/10 bg-foreground/[0.03] py-1 text-[9px] text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground"
					>
						Top Right
					</button>
					<button
						type="button"
						onClick={() => onMemeUpdate(region.id, { position: { x: 5, y: 60 } })}
						className="rounded border border-foreground/10 bg-foreground/[0.03] py-1 text-[9px] text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground"
					>
						Bottom Left
					</button>
					<button
						type="button"
						onClick={() => onMemeUpdate(region.id, { position: { x: 60, y: 60 } })}
						className="rounded border border-foreground/10 bg-foreground/[0.03] py-1 text-[9px] text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground"
					>
						Bottom Right
					</button>
					<button
						type="button"
						onClick={() =>
							onMemeUpdate(region.id, {
								position: { x: 0, y: 0 },
								size: { width: 100, height: 100 },
							})
						}
						className="rounded border border-foreground/10 bg-foreground/[0.03] py-1 text-[9px] text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground"
					>
						Fullscreen
					</button>
				</div>
			</div>

			<div className="flex flex-col gap-1">
				<span className="text-[10px] font-medium text-muted-foreground">Preset Size</span>
				<div className="grid grid-cols-4 gap-1">
					<button
						type="button"
						onClick={() => onMemeUpdate(region.id, { size: { width: 25, height: 25 } })}
						className="rounded border border-foreground/10 bg-foreground/[0.03] py-1 text-[9px] text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground"
					>
						25%
					</button>
					<button
						type="button"
						onClick={() => onMemeUpdate(region.id, { size: { width: 40, height: 40 } })}
						className="rounded border border-foreground/10 bg-foreground/[0.03] py-1 text-[9px] text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground"
					>
						40%
					</button>
					<button
						type="button"
						onClick={() => onMemeUpdate(region.id, { size: { width: 60, height: 60 } })}
						className="rounded border border-foreground/10 bg-foreground/[0.03] py-1 text-[9px] text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground"
					>
						60%
					</button>
					<button
						type="button"
						onClick={() =>
							onMemeUpdate(region.id, { size: { width: 100, height: 100 } })
						}
						className="rounded border border-foreground/10 bg-foreground/[0.03] py-1 text-[9px] text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground"
					>
						100%
					</button>
				</div>
			</div>

			{slider(t("memes.positionX", "X"), region.position.x, 0, 95, 1, (x) =>
				onMemeUpdate(region.id, { position: { ...region.position, x } }),
			)}
			{slider(t("memes.positionY", "Y"), region.position.y, 0, 95, 1, (y) =>
				onMemeUpdate(region.id, { position: { ...region.position, y } }),
			)}
			{slider(t("memes.sizeWidth", "Width"), region.size.width, 5, 100, 1, (width) =>
				onMemeUpdate(region.id, { size: { ...region.size, width } }),
			)}
			{slider(t("memes.sizeHeight", "Height"), region.size.height, 5, 100, 1, (height) =>
				onMemeUpdate(region.id, { size: { ...region.size, height } }),
			)}
			{slider(t("memes.volume", "Volume"), region.volume * 100, 0, 100, 1, (volume) =>
				onMemeUpdate(region.id, { volume: volume / 100 }),
			)}
			<div className="flex items-center justify-between gap-2">
				<span className="text-[10px] text-muted-foreground">
					{t("memes.greenScreen", "Green screen keying")}
				</span>
				<Switch
					checked={Boolean(region.greenScreen)}
					onCheckedChange={(greenScreen) =>
						onMemeUpdate(region.id, {
							greenScreen,
							...(greenScreen && region.chromaKeySimilarity === undefined
								? { chromaKeySimilarity: 0.3 }
								: {}),
						})
					}
					className="data-[state=checked]:bg-[#2563EB] scale-75"
				/>
			</div>
			{region.greenScreen ? (
				<div>
					{slider(
						t("memes.chromaTolerance", "Key tolerance"),
						(region.chromaKeySimilarity ?? 0.3) * 100,
						5,
						60,
						1,
						(similarity) =>
							onMemeUpdate(region.id, { chromaKeySimilarity: similarity / 100 }),
					)}
					<p className="mt-0.5 text-[9px] text-muted-foreground/70">
						{t(
							"memes.chromaHint",
							"Drag over the video preview to reposition; resize from the timeline.",
						)}
					</p>
				</div>
			) : null}
			{onMemeDelete ? (
				<Button
					variant="outline"
					size="sm"
					onClick={() => onMemeDelete(region.id)}
					className="h-7 w-full gap-1.5 border-red-500/20 bg-red-500/10 text-[10px] text-red-400 hover:bg-red-500/20 hover:text-red-300"
				>
					{t("memes.delete", "Delete Meme")}
				</Button>
			) : null}
		</div>
	);
}

export function MemeSettingsPanel({
	onAddMeme,
	memeRegions,
	selectedMemeId,
	onMemeUpdate,
	onMemeDelete,
	onSeekToTime,
}: MediaLibraryPanelProps) {
	const t = useScopedT("settings");
	const [items, setItems] = useState<MemeItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [failed, setFailed] = useState(false);
	const [category, setCategory] = useState<(typeof CATEGORY_FILTERS)[number]>("All");
	const [search, setSearch] = useState("");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [previewId, setPreviewId] = useState<string | null>(null);
	const [chromaOverride, setChromaOverride] = useState<boolean | null>(null);
	const [chromaSimilarity, setChromaSimilarity] = useState(0.3);

	const selectedMeme = memeRegions.find((region) => region.id === selectedMemeId) ?? null;

	useEffect(() => {
		let cancelled = false;
		const api = window.electronAPI;
		if (!api?.listMediaMemes) {
			setLoading(false);
			setFailed(true);
			return;
		}
		void api
			.listMediaMemes()
			.then((result) => {
				if (cancelled) return;
				if (result.success) {
					setItems(result.items as MemeItem[]);
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

	const filtered = useMemo(() => {
		const query = search.trim().toLowerCase();
		return items
			.filter((item) => {
				if (category === "Green Screen" && !item.isGreenScreen) return false;
				if (category === "Meme Clips" && item.isGreenScreen) return false;
				if (query && !item.name.toLowerCase().includes(query)) return false;
				return true;
			})
			.slice(0, MAX_VISIBLE_MEMES);
	}, [category, items, search]);

	const selectedItem = items.find((item) => item.id === selectedId) ?? null;

	const handleAdd = useCallback(
		(item: MemeItem) => {
			onAddMeme({
				videoPath: item.filePath,
				name: item.name,
				greenScreen: chromaOverride ?? item.isGreenScreen,
				chromaKeySimilarity: chromaSimilarity,
			});
			toast.success(`Added meme "${item.name}" at the playhead`);
		},
		[chromaOverride, chromaSimilarity, onAddMeme],
	);

	const handleImport = useCallback(async () => {
		const result = await window.electronAPI?.pickMediaFile?.("meme");
		if (!result?.success || !result.filePath) return;
		onAddMeme({
			videoPath: result.filePath,
			name: result.name ?? "Imported meme",
			greenScreen: chromaOverride ?? false,
			chromaKeySimilarity: chromaSimilarity,
		});
	}, [chromaOverride, chromaSimilarity, onAddMeme]);

	return (
		<section className="flex flex-col gap-3">
			<div className="flex items-center justify-between gap-2">
				<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{t("sections.memes", "Memes")}
				</h3>
				<Button
					variant="outline"
					size="sm"
					onClick={() => void handleImport()}
					className="h-7 gap-1.5 border-foreground/10 bg-foreground/5 px-2 text-[10px] text-foreground hover:bg-foreground/10"
				>
					<UploadSimple className="h-3 w-3" />
					{t("memes.import", "Import Video…")}
				</Button>
			</div>

			{selectedMeme ? (
				<SelectedMemeEditor
					region={selectedMeme}
					memeRegions={memeRegions}
					selectedMemeId={selectedMemeId}
					onMemeUpdate={onMemeUpdate}
					onMemeDelete={onMemeDelete}
					onSeekToTime={onSeekToTime}
				/>
			) : null}

			{selectedMeme ? null : (
				<>
					<Input
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder={t("memes.searchPlaceholder", "Search memes…")}
						className="h-7 border-foreground/10 bg-editor-bg text-xs placeholder:text-muted-foreground/60"
					/>
					<div className="flex gap-1">
						{CATEGORY_FILTERS.map((option) => (
							<button
								key={option}
								type="button"
								onClick={() => setCategory(option)}
								className={cn(
									"rounded-full border px-2 py-0.5 text-[10px] transition-colors",
									category === option
										? "border-[#2563EB] bg-[#2563EB]/15 text-[#2563EB]"
										: "border-foreground/10 bg-foreground/[0.03] text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground",
								)}
							>
								{option}
							</button>
						))}
					</div>

					<div className="flex items-center justify-between gap-2 rounded-lg bg-foreground/[0.03] px-2.5 py-2">
						<div className="min-w-0">
							<p className="text-[11px] font-medium text-foreground">
								{t("memes.greenScreen", "Green screen keying")}
							</p>
							<p className="text-[10px] text-muted-foreground">
								{t(
									"memes.chromaOverrideHint",
									"Force chroma keying on newly added memes.",
								)}
							</p>
						</div>
						<Switch
							checked={chromaOverride ?? false}
							onCheckedChange={(checked) =>
								setChromaOverride(checked ? true : false)
							}
							className="data-[state=checked]:bg-[#2563EB] scale-75"
						/>
					</div>
					<label className="flex items-center gap-2 text-[10px] text-muted-foreground">
						<span className="w-20 flex-shrink-0">
							{t("memes.chromaTolerance", "Key tolerance")}
						</span>
						<input
							type="range"
							min={10}
							max={60}
							step={1}
							value={Math.round(chromaSimilarity * 100)}
							onChange={(event) =>
								setChromaSimilarity(Number(event.target.value) / 100)
							}
							className="h-1 w-full cursor-ew-resize accent-[#2563EB]"
						/>
						<span className="w-9 text-right tabular-nums">
							{Math.round(chromaSimilarity * 100)}
						</span>
					</label>

					{loading ? (
						<div className="py-8 text-center text-xs text-muted-foreground">
							{t("memes.loading", "Scanning the meme library…")}
						</div>
					) : failed ? (
						<div className="rounded-lg bg-foreground/[0.03] px-2.5 py-6 text-center">
							<p className="text-[11px] text-muted-foreground">
								{t(
									"memes.libraryUnavailable",
									"Meme library unavailable. Check that the asset drive is mounted.",
								)}
							</p>
						</div>
					) : (
						<div className="grid grid-cols-2 gap-1.5">
							{filtered.length === 0 ? (
								<p className="col-span-2 py-6 text-center text-[11px] text-muted-foreground">
									{t("memes.noResults", "No memes match this filter.")}
								</p>
							) : null}
							{filtered.map((item) => (
								<MemePreviewCard
									key={item.id}
									item={item}
									isSelected={selectedId === item.id}
									isPreviewing={previewId === item.id}
									onSelect={() => setSelectedId(item.id)}
									onTogglePreview={() =>
										setPreviewId(previewId === item.id ? null : item.id)
									}
								/>
							))}
						</div>
					)}

					<Button
						size="sm"
						onClick={() => {
							if (selectedItem) handleAdd(selectedItem);
						}}
						disabled={!selectedItem}
						className="h-8 w-full gap-2 bg-[#2563EB] text-xs text-white hover:bg-[#1d4ed8] disabled:opacity-40"
					>
						<Plus className="h-3.5 w-3.5" />
						{t("memes.add", "Add Meme to Timeline")}
					</Button>
				</>
			)}
		</section>
	);
}
