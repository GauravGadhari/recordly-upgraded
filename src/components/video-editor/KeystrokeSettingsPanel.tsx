import {
	Eye,
	EyeSlash,
	Keyboard,
	MagnifyingGlass,
	Sparkle,
	SpeakerHigh,
	Trash,
} from "@phosphor-icons/react";
import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useScopedT } from "@/contexts/I18nContext";
import { cn } from "@/lib/utils";
import { SliderControl } from "./SliderControl";
import {
	DEFAULT_KEYSTROKE_SETTINGS,
	type KeystrokeEvent,
	type KeystrokePosition,
	type KeystrokeSize,
	type KeystrokeStyle,
	type KeystrokeVisualSettings,
} from "./types";

export interface KeystrokeSettingsPanelProps {
	settings: KeystrokeVisualSettings;
	onSettingsChange: (settings: KeystrokeVisualSettings) => void;
	keystrokes: KeystrokeEvent[];
	onUpdateKeystroke?: (id: string, updates: Partial<KeystrokeEvent>) => void;
	onDeleteKeystroke?: (id: string) => void;
	onToggleKeystrokeEnabled?: (id: string) => void;
	onSeekToTime?: (timeMs: number) => void;
	onResetSettings?: () => void;
	onGenerateKeystrokeSfx?: (options?: {
		style?: import("./timeline/sfxSuggestionUtils").KeystrokeSfxStyle;
		volume?: number;
		shortcutsOnly?: boolean;
	}) => number;
	onClearKeystrokeSfx?: () => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
	return (
		<p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
			{children}
		</p>
	);
}

function formatTimecode(ms: number): string {
	const safeMs = Math.max(0, Math.round(ms));
	const minutes = Math.floor(safeMs / 60_000);
	const seconds = Math.floor((safeMs % 60_000) / 1_000);
	const millis = Math.floor((safeMs % 1_000) / 100);
	return `${minutes}:${String(seconds).padStart(2, "0")}.${millis}`;
}

const POSITION_OPTIONS: Array<{ value: KeystrokePosition; label: string }> = [
	{ value: "top-left", label: "Top Left" },
	{ value: "top-center", label: "Top Center" },
	{ value: "top-right", label: "Top Right" },
	{ value: "center-left", label: "Center Left" },
	{ value: "center", label: "Center" },
	{ value: "center-right", label: "Center Right" },
	{ value: "bottom-left", label: "Bottom Left" },
	{ value: "bottom-center", label: "Bottom Center" },
	{ value: "bottom-right", label: "Bottom Right" },
];

const STYLE_OPTIONS: Array<{ value: KeystrokeStyle; label: string; previewClass: string }> = [
	{ value: "dark", label: "Dark", previewClass: "bg-neutral-900 text-white border-neutral-700" },
	{ value: "light", label: "Light", previewClass: "bg-white text-neutral-900 border-neutral-300" },
	{ value: "glass", label: "Glass", previewClass: "bg-black/40 text-white border-white/30 backdrop-blur-sm" },
	{ value: "accent", label: "Accent", previewClass: "bg-blue-950 text-blue-100 border-blue-400" },
];

const SIZE_OPTIONS: Array<{ value: KeystrokeSize; label: string }> = [
	{ value: "small", label: "S" },
	{ value: "medium", label: "M" },
	{ value: "large", label: "L" },
];

export const KeystrokeSettingsPanel: React.FC<KeystrokeSettingsPanelProps> = ({
	settings,
	onSettingsChange,
	keystrokes = [],
	onDeleteKeystroke,
	onToggleKeystrokeEnabled,
	onSeekToTime,
	onResetSettings,
	onGenerateKeystrokeSfx,
	onClearKeystrokeSfx,
}) => {
	const tSettings = useScopedT("settings");
	const [searchQuery, setSearchQuery] = useState("");
	const [sfxStyle, setSfxStyle] = useState<"mechanical" | "thock" | "typewriter" | "soft">("mechanical");

	const filteredKeystrokes = useMemo(() => {
		if (!searchQuery.trim()) {
			return keystrokes;
		}
		const q = searchQuery.toLowerCase();
		return keystrokes.filter((evt) =>
			evt.displayText.toLowerCase().includes(q) ||
			evt.keys.some((k) => k.toLowerCase().includes(q)),
		);
	}, [keystrokes, searchQuery]);

	const updateSettings = (partial: Partial<KeystrokeVisualSettings>) => {
		onSettingsChange({
			...settings,
			...partial,
		});
	};

	const handleReset = () => {
		if (onResetSettings) {
			onResetSettings();
		} else {
			onSettingsChange({ ...DEFAULT_KEYSTROKE_SETTINGS });
		}
	};

	return (
		<section className="flex flex-col gap-3">
			{/* Header */}
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					<SectionLabel>{tSettings("sections.keystrokes", "Keystrokes")}</SectionLabel>
					<button
						type="button"
						onClick={handleReset}
						className="text-[10px] text-[#2563EB] transition-opacity hover:opacity-80"
					>
						{tSettings("actions.reset", "Reset")}
					</button>
				</div>
				<label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
					<span>{tSettings("effects.showKeystrokes", "Enable")}</span>
					<Switch
						checked={settings.enabled}
						onCheckedChange={(enabled) => updateSettings({ enabled })}
						className="scale-75 data-[state=checked]:bg-[#2563EB]"
					/>
				</label>
			</div>

			{settings.enabled ? (
				<div className="flex flex-col gap-3">
					{/* Filter Switch: Shortcuts Only */}
					<div className="flex items-center justify-between rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-2">
						<div className="flex flex-col gap-0.5">
							<span className="text-xs font-medium text-foreground">
								{tSettings("keystrokes.shortcutsOnly", "Shortcuts Only")}
							</span>
							<span className="text-[10px] text-muted-foreground">
								{tSettings(
									"keystrokes.shortcutsOnlyDesc",
									"Hide normal typing, show only hotkeys & combos",
								)}
							</span>
						</div>
						<Switch
							checked={settings.showShortcutsOnly}
							onCheckedChange={(showShortcutsOnly) => updateSettings({ showShortcutsOnly })}
							className="scale-75 data-[state=checked]:bg-[#2563EB]"
						/>
					</div>

					{/* Position Selector */}
					<div className="flex flex-col gap-1.5">
						<span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
							{tSettings("keystrokes.position", "Position")}
						</span>
						<ToggleGroup
							type="single"
							value={settings.position}
							onValueChange={(val) => {
								if (val) updateSettings({ position: val as KeystrokePosition });
							}}
							className="grid grid-cols-3 gap-1.5"
						>
							{POSITION_OPTIONS.map((pos) => (
								<ToggleGroupItem
									key={pos.value}
									value={pos.value}
									className="h-8 rounded-md border border-foreground/10 bg-foreground/[0.03] text-[11px] font-medium text-foreground/80 hover:bg-foreground/[0.06] data-[state=on]:border-[#2563EB] data-[state=on]:bg-[#2563EB]/15 data-[state=on]:text-[#2563EB]"
								>
									{pos.label}
								</ToggleGroupItem>
							))}
						</ToggleGroup>
					</div>

					{/* Theme / Style Selector */}
					<div className="flex flex-col gap-1.5">
						<span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
							{tSettings("keystrokes.style", "Theme")}
						</span>
						<ToggleGroup
							type="single"
							value={settings.style}
							onValueChange={(val) => {
								if (val) updateSettings({ style: val as KeystrokeStyle });
							}}
							className="grid grid-cols-4 gap-1.5"
						>
							{STYLE_OPTIONS.map((style) => (
								<ToggleGroupItem
									key={style.value}
									value={style.value}
									className="flex h-10 flex-col items-center justify-center gap-1 rounded-md border border-foreground/10 bg-foreground/[0.03] p-1 text-[11px] font-medium text-foreground/80 hover:bg-foreground/[0.06] data-[state=on]:border-[#2563EB] data-[state=on]:bg-[#2563EB]/15 data-[state=on]:text-[#2563EB]"
								>
									<span
										className={cn(
											"h-2.5 w-6 rounded border px-1",
											style.previewClass,
										)}
									/>
									<span className="text-[10px]">{style.label}</span>
								</ToggleGroupItem>
							))}
						</ToggleGroup>
					</div>

					{/* Size Selector */}
					<div className="flex flex-col gap-1.5">
						<span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
							{tSettings("keystrokes.size", "Size")}
						</span>
						<ToggleGroup
							type="single"
							value={settings.size}
							onValueChange={(val) => {
								if (val) updateSettings({ size: val as KeystrokeSize });
							}}
							className="grid grid-cols-3 gap-1.5"
						>
							{SIZE_OPTIONS.map((size) => (
								<ToggleGroupItem
									key={size.value}
									value={size.value}
									className="h-8 rounded-md border border-foreground/10 bg-foreground/[0.03] text-xs font-medium text-foreground/80 hover:bg-foreground/[0.06] data-[state=on]:border-[#2563EB] data-[state=on]:bg-[#2563EB]/15 data-[state=on]:text-[#2563EB]"
								>
									{size.label}
								</ToggleGroupItem>
							))}
						</ToggleGroup>
					</div>

					{/* Stack Layers Selector */}
					<div className="flex items-center justify-between rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-2">
						<div className="flex flex-col gap-0.5">
							<span className="text-xs font-medium text-foreground">
								{tSettings("keystrokes.layers", "Stack Layers")}
							</span>
							<span className="text-[11px] text-muted-foreground">
								{tSettings("keystrokes.layersDescription", "Show previous shortcut alongside active one")}
							</span>
						</div>
						<ToggleGroup
							type="single"
							value={String(settings.maxLayers ?? 2)}
							onValueChange={(val) => {
								if (val) updateSettings({ maxLayers: Number.parseInt(val, 10) as 1 | 2 });
							}}
							className="flex items-center gap-1"
						>
							<ToggleGroupItem
								value="1"
								className="h-7 px-2.5 rounded-md border border-foreground/10 bg-foreground/[0.03] text-[11px] font-medium text-foreground/80 hover:bg-foreground/[0.06] data-[state=on]:border-[#2563EB] data-[state=on]:bg-[#2563EB]/15 data-[state=on]:text-[#2563EB]"
							>
								1
							</ToggleGroupItem>
							<ToggleGroupItem
								value="2"
								className="h-7 px-2.5 rounded-md border border-foreground/10 bg-foreground/[0.03] text-[11px] font-medium text-foreground/80 hover:bg-foreground/[0.06] data-[state=on]:border-[#2563EB] data-[state=on]:bg-[#2563EB]/15 data-[state=on]:text-[#2563EB]"
							>
								2
							</ToggleGroupItem>
						</ToggleGroup>
					</div>

					{/* Linger Duration Slider */}
					<SliderControl
						label={tSettings("keystrokes.lingerDuration", "Display Duration")}
						value={settings.lingerDurationMs || 1500}
						defaultValue={1500}
						min={800}
						max={3000}
						step={100}
						onChange={(lingerDurationMs) => updateSettings({ lingerDurationMs })}
						formatValue={(v) => `${(v / 1000).toFixed(1)}s`}
						parseInput={(text) => {
							const parsed = parseFloat(text.replace("s", ""));
							return !isNaN(parsed) ? Math.round(parsed * 1000) : null;
						}}
					/>

					{/* Typing Sound Effects (SFX) */}
					<div className="flex flex-col gap-2 rounded-lg border border-foreground/10 bg-foreground/[0.03] p-3">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-1.5">
								<SpeakerHigh className="h-4 w-4 text-[#2563EB]" weight="fill" />
								<span className="text-xs font-semibold text-foreground">
									Typing Sound Effects (SFX)
								</span>
							</div>
							<span className="text-[10px] text-muted-foreground">
								Procedural Audio
							</span>
						</div>
						<p className="text-[11px] text-muted-foreground leading-relaxed">
							Add synchronized keyboard click & thock sound effects for each keystroke to the audio timeline.
						</p>
						<div className="flex flex-col gap-1.5 pt-1">
							<span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
								Sound Style
							</span>
							<ToggleGroup
								type="single"
								value={sfxStyle}
								onValueChange={(val) => {
									if (val) setSfxStyle(val as any);
								}}
								className="grid grid-cols-4 gap-1"
							>
								<ToggleGroupItem
									value="mechanical"
									className="h-7 text-[10px] data-[state=on]:bg-[#2563EB] data-[state=on]:text-white"
								>
									Mechanical
								</ToggleGroupItem>
								<ToggleGroupItem
									value="thock"
									className="h-7 text-[10px] data-[state=on]:bg-[#2563EB] data-[state=on]:text-white"
								>
									Thock
								</ToggleGroupItem>
								<ToggleGroupItem
									value="typewriter"
									className="h-7 text-[10px] data-[state=on]:bg-[#2563EB] data-[state=on]:text-white"
								>
									Typewriter
								</ToggleGroupItem>
								<ToggleGroupItem
									value="soft"
									className="h-7 text-[10px] data-[state=on]:bg-[#2563EB] data-[state=on]:text-white"
								>
									Soft
								</ToggleGroupItem>
							</ToggleGroup>
						</div>
						<div className="flex items-center gap-2 pt-1.5">
							<Button
								size="sm"
								onClick={() =>
									onGenerateKeystrokeSfx?.({
										style: sfxStyle,
										shortcutsOnly: settings.showShortcutsOnly,
									})
								}
								disabled={!onGenerateKeystrokeSfx || keystrokes.length === 0}
								className="h-7 flex-1 gap-1.5 bg-[#2563EB] hover:bg-[#1d4ed8] text-white text-[11px] font-medium"
							>
								<Sparkle className="h-3.5 w-3.5" />
								Generate Keys SFX
							</Button>
							{onClearKeystrokeSfx ? (
								<Button
									variant="outline"
									size="sm"
									onClick={onClearKeystrokeSfx}
									title="Clear keystroke audio from timeline"
									className="h-7 border-white/10 bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground text-[10px] px-2"
								>
									Clear
								</Button>
							) : null}
						</div>
					</div>

					{/* Keystrokes List Section */}
					<div className="mt-2 flex flex-col gap-2">
						<div className="flex items-center justify-between">
							<span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
								{tSettings("keystrokes.capturedList", "Captured Shortcuts")} ({filteredKeystrokes.length})
							</span>
						</div>

						{keystrokes.length > 5 ? (
							<div className="relative">
								<MagnifyingGlass className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
								<Input
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									placeholder={tSettings("keystrokes.searchPlaceholder", "Filter captured keys...")}
									className="h-7 bg-foreground/[0.03] pl-8 text-xs"
								/>
							</div>
						) : null}

						{filteredKeystrokes.length === 0 ? (
							<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-foreground/15 bg-foreground/[0.02] p-5 text-center">
								<Keyboard className="h-7 w-7 text-muted-foreground/60" />
								<span className="mt-1.5 text-xs font-medium text-foreground/80">
									{keystrokes.length === 0
										? tSettings("keystrokes.emptyStateTitle", "No Keystrokes Captured")
										: tSettings("keystrokes.noMatches", "No matching keystrokes")}
								</span>
								<p className="mt-0.5 text-[11px] text-muted-foreground">
									{keystrokes.length === 0
										? tSettings(
												"keystrokes.emptyStateDesc",
												"Press hotkeys or shortcuts while recording to display them here.",
											)
										: tSettings("keystrokes.tryDifferentSearch", "Try searching for a different key combination.")}
								</p>
							</div>
						) : (
							<div className="max-h-60 space-y-1.5 overflow-y-auto pr-1">
								{filteredKeystrokes.map((evt) => {
									const isEnabled = evt.enabled !== false;
									return (
										<div
											key={evt.id}
											className={cn(
												"group flex items-center justify-between gap-2 rounded-lg border border-foreground/10 bg-foreground/[0.02] px-2.5 py-1.5 transition-colors hover:bg-foreground/[0.05]",
												!isEnabled && "opacity-50",
											)}
										>
											<div className="flex min-w-0 items-center gap-2">
												<button
													type="button"
													onClick={() => onSeekToTime?.(evt.timeMs)}
													title="Seek to shortcut"
													className="rounded bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground transition hover:bg-[#2563EB]/20 hover:text-[#2563EB]"
												>
													{formatTimecode(evt.timeMs)}
												</button>

												<div className="flex flex-wrap items-center gap-1">
													{(evt.keys && evt.keys.length > 0
														? evt.keys
														: [evt.displayText]
													).map((key, kIdx) => (
														<React.Fragment key={`${evt.id}_${kIdx}`}>
															{kIdx > 0 && (
																<span className="text-[10px] text-muted-foreground">+</span>
															)}
															<span className="inline-flex rounded border border-foreground/15 bg-background/80 px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground shadow-sm">
																{key}
															</span>
														</React.Fragment>
													))}
												</div>
											</div>

											<div className="flex items-center gap-1">
												{onToggleKeystrokeEnabled ? (
													<Button
														type="button"
														variant="ghost"
														size="icon"
														onClick={() => onToggleKeystrokeEnabled(evt.id)}
														title={isEnabled ? "Hide in playback" : "Show in playback"}
														className="h-6 w-6 text-muted-foreground hover:text-foreground"
													>
														{isEnabled ? (
															<Eye className="h-3.5 w-3.5" />
														) : (
															<EyeSlash className="h-3.5 w-3.5 text-red-400" />
														)}
													</Button>
												) : null}

												{onDeleteKeystroke ? (
													<Button
														type="button"
														variant="ghost"
														size="icon"
														onClick={() => onDeleteKeystroke(evt.id)}
														title="Delete shortcut"
														className="h-6 w-6 text-muted-foreground hover:text-red-400"
													>
														<Trash className="h-3.5 w-3.5" />
													</Button>
												) : null}
											</div>
										</div>
									);
								})}
							</div>
						)}
					</div>
				</div>
			) : (
				<div className="rounded-lg bg-foreground/[0.03] px-3 py-6 text-center">
					<p className="text-[11px] text-muted-foreground">
						{tSettings(
							"keystrokes.disabledMessage",
							"Enable keystrokes to overlay keyboard shortcuts during video playback.",
						)}
					</p>
				</div>
			)}
		</section>
	);
};

export default KeystrokeSettingsPanel;
