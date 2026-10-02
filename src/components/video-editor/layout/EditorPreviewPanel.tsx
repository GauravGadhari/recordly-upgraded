import {
	CaretDown,
	Check,
	Crop,
	DeviceMobile,
	MagicWand,
	MagnifyingGlassMinus,
	MagnifyingGlassPlus,
	Monitor,
	Pause,
	Play,
	Plus,
	Scissors,
	SkipBack,
	SkipForward,
	Sparkle,
	SpeakerHigh,
	SpeakerLow,
	SpeakerX,
	Target,
} from "@phosphor-icons/react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { useI18n } from "@/contexts/I18nContext";
import { ASPECT_RATIOS, type AspectRatio, getAspectRatioLabel } from "@/utils/aspectRatioUtils";
import type { VerticalTrackingMode } from "../types";
import type { useVideoEditorAudio } from "../audio/useVideoEditorAudio";
import type { CaptionEditTarget } from "../captionEditing";
import type { useAnnotationRegionCommands } from "../hooks/useAnnotationRegionCommands";
import type { useEditorPlaybackControls } from "../hooks/useEditorPlaybackControls";
import type { useMemeRegionCommands } from "../hooks/useMemeRegionCommands";
import type { useTimelineProjection } from "../hooks/useTimelineProjection";
import type { useZoomRegionCommands } from "../hooks/useZoomRegionCommands";
import type { useAppearanceState } from "../state/useAppearanceState";
import type { useTimelineState } from "../state/useTimelineState";
import type { TimelineEditorHandle } from "../timeline/TimelineEditor";
import type { VideoPlaybackRef } from "../VideoPlayback";
import { EditorVideoPreview } from "./EditorVideoPreview";

type Props = {
	t: ReturnType<typeof useI18n>["t"];
	videoPath: string | null;
	previewVersion: number;
	aspectRatio: AspectRatio;
	setAspectRatio: Dispatch<SetStateAction<AspectRatio>>;
	verticalTrackingMode?: VerticalTrackingMode;
	setVerticalTrackingMode?: Dispatch<SetStateAction<VerticalTrackingMode>>;
	previewAspectRatioValue: number;
	videoPlaybackRef: RefObject<VideoPlaybackRef>;
	timelineRef: RefObject<TimelineEditorHandle>;
	currentTime: number;
	isPlaying: boolean;
	previewVolume: number;
	setPreviewVolume: Dispatch<SetStateAction<number>>;
	suspendRendering: boolean;
	appearance: ReturnType<typeof useAppearanceState>;
	timeline: ReturnType<typeof useTimelineState>;
	audio: ReturnType<typeof useVideoEditorAudio>;
	projection: ReturnType<typeof useTimelineProjection>;
	playback: ReturnType<typeof useEditorPlaybackControls>;
	zoomCommands: ReturnType<typeof useZoomRegionCommands>;
	annotationCommands: ReturnType<typeof useAnnotationRegionCommands>;
	memeCommands: ReturnType<typeof useMemeRegionCommands>;
	effectiveCursorTelemetry: ReturnType<typeof useTimelineState>["cursorTelemetry"];
	effectiveShowCursor: boolean;
	isCropped: boolean;
	handleOpenCropEditor: () => void;
	handleSaveAutoCaptionEdit: (target: CaptionEditTarget, text: string) => void;
	handleSelectAnnotation: (id: string | null) => void;
	setDuration: Dispatch<SetStateAction<number>>;
	setIsPreviewReady: Dispatch<SetStateAction<boolean>>;
	setCurrentTime: Dispatch<SetStateAction<number>>;
	setIsPlaying: Dispatch<SetStateAction<boolean>>;
	setError: Dispatch<SetStateAction<string | null>>;
};

function formatTime(seconds: number) {
	if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function EditorPreviewPanel(props: Props) {
	const {
		t,
		videoPath,
		previewVersion,
		aspectRatio,
		setAspectRatio,
		verticalTrackingMode = "auto-follow",
		setVerticalTrackingMode,
		previewAspectRatioValue,
		videoPlaybackRef,
		timelineRef,
		currentTime,
		isPlaying,
		previewVolume,
		setPreviewVolume,
		suspendRendering,
		appearance,
		timeline,
		audio,
		projection,
		playback,
		zoomCommands,
		annotationCommands,
		memeCommands,
		effectiveCursorTelemetry,
		effectiveShowCursor,
		isCropped,
		handleOpenCropEditor,
		handleSaveAutoCaptionEdit,
		handleSelectAnnotation,
		setDuration,
		setIsPreviewReady,
		setCurrentTime,
		setIsPlaying,
		setError,
	} = props;

	const isVertical = aspectRatio === "9:16" || previewAspectRatioValue < 0.999;
	const isAutoFollow = verticalTrackingMode === "auto-follow";

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3">
			<div className="flex min-h-0 flex-1 flex-col">
				<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
					<div className="flex flex-shrink-0 items-center justify-center gap-2 py-1.5">
						{/* Aspect Ratio segmented switcher */}
						<div className="flex items-center rounded-lg border border-foreground/10 bg-foreground/[0.04] p-0.5 shadow-sm">
							{/* Landscape 16:9 */}
							<button
								type="button"
								onClick={() => setAspectRatio("16:9")}
								title="Landscape 16:9 (Desktop / YouTube)"
								className={`flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-all ${
									aspectRatio === "16:9" || aspectRatio === "native"
										? "bg-foreground/15 text-foreground shadow-sm"
										: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
								}`}
							>
								<Monitor className="h-3.5 w-3.5" />
								<span>Landscape</span>
							</button>

							{/* Vertical 9:16 */}
							<button
								type="button"
								onClick={() => setAspectRatio("9:16")}
								title="Vertical 9:16 (Shorts / Reels / TikTok)"
								className={`flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-all ${
									aspectRatio === "9:16"
										? "bg-[#2563EB]/20 text-[#3b82f6] shadow-sm font-semibold"
										: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
								}`}
							>
								<DeviceMobile className="h-3.5 w-3.5" />
								<span>Vertical (9:16)</span>
							</button>

							{/* Secondary Ratios Dropdown */}
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button
										type="button"
										className={`flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground transition-all hover:bg-foreground/10 hover:text-foreground ${
											aspectRatio !== "16:9" &&
											aspectRatio !== "native" &&
											aspectRatio !== "9:16"
												? "bg-foreground/15 text-foreground font-medium"
												: ""
										}`}
										title="More Aspect Ratios"
									>
										{aspectRatio !== "16:9" &&
										aspectRatio !== "native" &&
										aspectRatio !== "9:16" ? (
											<span>{getAspectRatioLabel(aspectRatio)}</span>
										) : null}
										<CaretDown className="h-3 w-3" />
									</button>
								</DropdownMenuTrigger>
								<DropdownMenuContent
									align="center"
									className="border-foreground/10 bg-editor-surface-alt"
								>
									{ASPECT_RATIOS.map((ratio) => (
										<DropdownMenuItem
											key={ratio}
											onClick={() => setAspectRatio(ratio)}
											className="flex cursor-pointer items-center justify-between gap-3 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
										>
											<span>{getAspectRatioLabel(ratio)}</span>
											{aspectRatio === ratio ? (
												<Check className="h-3 w-3 text-[#2563EB]" />
											) : null}
										</DropdownMenuItem>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
						</div>

						{/* Auto Track Mouse Toggle (Vertical mode only) */}
						{isVertical && setVerticalTrackingMode ? (
							<Button
								variant="ghost"
								size="sm"
								onClick={() =>
									setVerticalTrackingMode((prev) =>
										prev === "fit" ? "auto-follow" : "fit",
									)
								}
								title={
									isAutoFollow
										? "Dynamic mouse tracking active: Video fills frame and follows your cursor smoothly"
										: "Fit mode: Video is letterboxed inside vertical frame with blank borders"
								}
								className={`h-7 gap-1.5 px-2.5 text-xs transition-all ${
									isAutoFollow
										? "border border-[#2563EB]/40 bg-[#2563EB]/15 text-[#3b82f6] shadow-[0_0_12px_rgba(37,99,235,0.25)] hover:bg-[#2563EB]/25"
										: "border border-foreground/15 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
								}`}
							>
								<Target
									className={`h-3.5 w-3.5 ${isAutoFollow ? "animate-pulse text-[#3b82f6]" : ""}`}
								/>
								<span className="font-medium">
									{isAutoFollow ? "Auto Track Mouse" : "Fit (Letterbox)"}
								</span>
								{isAutoFollow ? (
									<span className="h-1.5 w-1.5 rounded-full bg-[#3b82f6] shadow-[0_0_6px_#3b82f6]" />
								) : null}
							</Button>
						) : null}

						<div className="h-4 w-px bg-foreground/20" />
						<Button
							variant="ghost"
							size="sm"
							onClick={handleOpenCropEditor}
							className="h-7 gap-1.5 px-2 text-xs text-muted-foreground transition-all hover:bg-foreground/10 hover:text-foreground"
						>
							<Crop className="h-3.5 w-3.5" />
							<span className="font-medium">{t("settings.crop.title")}</span>
							{isCropped ? (
								<span className="h-1.5 w-1.5 rounded-full bg-[#2563EB]" />
							) : null}
						</Button>
					</div>
					<div
						className="flex min-h-0 w-full flex-1 items-stretch"
						style={{ flex: "1 1 auto", margin: "6px 0 0" }}
					>
						<div className="flex min-w-0 flex-1 items-center justify-center px-1">
							<div
								className="relative"
								style={{
									width: "auto",
									height: "100%",
									aspectRatio: previewAspectRatioValue,
									maxWidth: "100%",
									margin: "0 auto",
									boxSizing: "border-box",
								}}
							>
								<EditorVideoPreview
									videoPath={videoPath}
									previewVersion={previewVersion}
									aspectRatio={aspectRatio}
									verticalTrackingMode={verticalTrackingMode}
									playbackRef={videoPlaybackRef}
									currentTime={currentTime}
									isPlaying={isPlaying}
									previewVolume={previewVolume}
									suspendRendering={suspendRendering}
									appearance={appearance}
									timeline={timeline}
									audio={audio}
									effectiveZoomRegions={projection.effectiveZoomRegions}
									effectiveCursorTelemetry={effectiveCursorTelemetry}
									effectiveShowCursor={effectiveShowCursor}
									setDuration={setDuration}
									setIsPreviewReady={setIsPreviewReady}
									setCurrentTime={setCurrentTime}
									setIsPlaying={setIsPlaying}
									setError={setError}
									handlers={{
										onSelectZoom: zoomCommands.handleSelectZoom,
										onZoomFocusChange: zoomCommands.handleZoomFocusChange,
										onEditAutoCaption: handleSaveAutoCaptionEdit,
										onSelectAnnotation: handleSelectAnnotation,
										onAnnotationPositionChange:
											annotationCommands.handleAnnotationPositionChange,
										onAnnotationSizeChange:
											annotationCommands.handleAnnotationSizeChange,
										onSelectMeme: memeCommands.handleSelectMeme,
										onMemePositionChange:
											memeCommands.handleUpdateMemePosition,
										onMemeSizeChange: memeCommands.handleUpdateMemeSize,
									}}
								/>
							</div>
						</div>
					</div>
				</div>
			</div>

			<div className="relative flex flex-shrink-0 items-center px-1 py-1">
				<div className="z-10 flex min-w-0 flex-1 items-center gap-1.5">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="h-7 gap-1 rounded-full border border-foreground/[0.08] bg-foreground/[0.04] px-2.5 text-[11px] text-foreground/65 shadow-[inset_0_1px_0_hsl(var(--foreground)/0.06)] transition-all hover:bg-foreground/[0.08] hover:text-foreground"
							>
								<Plus className="h-3.5 w-3.5" />
								<span className="font-medium">{t("editor.toolbar.addLayer")}</span>
								<CaretDown className="h-3 w-3" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="start"
							className="border-foreground/10 bg-editor-surface-alt"
						>
							<DropdownMenuItem
								onClick={() => {
									const nextTrack =
										timeline.annotationRegions.length > 0
											? Math.max(
													...timeline.annotationRegions.map(
														(region) => region.trackIndex ?? 0,
													),
												) + 1
											: 0;
									timelineRef.current?.addAnnotation(nextTrack);
								}}
								className="cursor-pointer text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
							>
								{t("timeline.annotation.label")}
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => {
									const nextTrack =
										timeline.annotationRegions.length > 0
											? Math.max(
													...timeline.annotationRegions.map(
														(region) => region.trackIndex ?? 0,
													),
												) + 1
											: 0;
									timelineRef.current?.addHighlight?.(nextTrack);
								}}
								className="cursor-pointer text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
							>
								{t("editor.toolbar.addHighlight", "Highlight Area")}
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => {
									const nextTrack =
										timeline.audioRegions.length > 0
											? Math.max(
													...timeline.audioRegions.map(
														(region) => region.trackIndex ?? 0,
													),
												) + 1
											: 0;
									timelineRef.current?.addAudio(nextTrack);
								}}
								className="cursor-pointer text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
							>
								{t("timeline.audio.label")}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
					<div className="mx-1 h-4 w-px bg-foreground/10" />
					<Button
						onClick={() => timelineRef.current?.addZoom()}
						variant="ghost"
						size="icon"
						className="h-7 w-7 rounded-full text-muted-foreground transition-all hover:bg-[#2563EB]/10 hover:text-[#2563EB]"
						title={t("timeline.zoom.addZoom")}
					>
						<MagnifyingGlassPlus className="h-4 w-4" />
					</Button>
					{(aspectRatio === "9:16" || aspectRatio === "4:5") && (
						<Button
							onClick={() => timelineRef.current?.addZoomOut?.()}
							variant="ghost"
							size="icon"
							className="h-7 w-7 rounded-full text-muted-foreground transition-all hover:bg-cyan-500/10 hover:text-cyan-400"
							title="Zoom Out (Fit Full Window)"
						>
							<MagnifyingGlassMinus className="h-4 w-4" />
						</Button>
					)}
					<Button
						onClick={() => timelineRef.current?.suggestZooms()}
						variant="ghost"
						size="icon"
						className="h-7 w-7 rounded-full text-muted-foreground transition-all hover:bg-[#2563EB]/10 hover:text-[#2563EB]"
						title={t("timeline.zoom.suggestZooms")}
					>
						<MagicWand className="h-4 w-4" />
					</Button>
					<Button
						onClick={() => timelineRef.current?.suggestSfx?.()}
						variant="ghost"
						size="icon"
						className="h-7 w-7 rounded-full text-muted-foreground transition-all hover:bg-[#2563EB]/10 hover:text-[#2563EB]"
						title="Auto-Generate SFX (Clicks, Whooshes, Zooms)"
					>
						<Sparkle className="h-4 w-4" />
					</Button>
					<Button
						onClick={() => timelineRef.current?.splitClip()}
						variant="ghost"
						size="icon"
						className="h-7 w-7 rounded-full text-muted-foreground transition-all hover:bg-foreground/10 hover:text-foreground"
						title={t("editor.toolbar.splitClip")}
					>
						<Scissors className="h-4 w-4" />
					</Button>
				</div>

				<div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
					<div className="pointer-events-auto flex items-center gap-1.5">
						<span className="mr-1 text-[10px] font-medium tabular-nums text-muted-foreground">
							{formatTime(projection.timelinePlayheadTime)}
						</span>
						<Button
							variant="ghost"
							size="icon"
							className="h-7 w-7 rounded-full text-muted-foreground transition-all hover:bg-foreground/10 hover:text-foreground"
							title={t("editor.playback.skipBack")}
							onClick={playback.handlePreviewSkipBack}
						>
							<SkipBack className="h-3.5 w-3.5" weight="fill" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							className={`h-7 w-7 rounded-full border border-foreground/10 shadow-[0_8px_18px_rgba(0,0,0,0.18)] transition-all ${isPlaying ? "bg-foreground/10 text-foreground hover:bg-foreground/20" : "bg-neutral-800 text-white hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-white/90"}`}
							onClick={playback.togglePlayPause}
							title={isPlaying ? "Pause" : "Play"}
						>
							{isPlaying ? (
								<Pause className="h-3.5 w-3.5" weight="fill" />
							) : (
								<Play className="h-3.5 w-3.5" weight="fill" />
							)}
						</Button>
						<Button
							variant="ghost"
							size="icon"
							className="h-7 w-7 rounded-full text-muted-foreground transition-all hover:bg-foreground/10 hover:text-foreground"
							title={t("editor.playback.skipForward")}
							onClick={playback.handlePreviewSkipForward}
						>
							<SkipForward className="h-3.5 w-3.5" weight="fill" />
						</Button>
						<span className="ml-1 text-[10px] font-medium tabular-nums text-muted-foreground/70">
							{formatTime(projection.timelineDuration)}
						</span>
					</div>
				</div>

				<div className="z-10 ml-auto flex items-center gap-2">
					<div className="flex items-center gap-1.5">
						<button
							type="button"
							className="text-muted-foreground transition-colors hover:text-foreground"
							title={t("editor.playback.muteUnmute")}
							onClick={() => setPreviewVolume(previewVolume <= 0.001 ? 1 : 0)}
						>
							{previewVolume <= 0.001 ? (
								<SpeakerX className="h-3.5 w-3.5" />
							) : previewVolume < 0.5 ? (
								<SpeakerLow className="h-3.5 w-3.5" />
							) : (
								<SpeakerHigh className="h-3.5 w-3.5" />
							)}
						</button>
						<div className="relative flex h-7 w-24 select-none items-center overflow-hidden rounded-full border border-foreground/[0.06] bg-editor-bg/80 shadow-[inset_0_1px_0_hsl(var(--foreground)/0.06)]">
							<div
								className="absolute inset-y-[3px] left-[3px] right-auto rounded-[10px] bg-foreground/[0.08]"
								style={{
									width:
										previewVolume > 0
											? `max(calc(${previewVolume * 100}% - 6px), 1.2rem)`
											: 0,
								}}
							/>
							<div
								className="pointer-events-none absolute bottom-[18%] top-[18%] z-10 w-0.5 rounded-full bg-foreground/95 shadow-[0_0_10px_rgba(37,99,235,0.28)]"
								style={{ left: `calc(${previewVolume * 100}% - 8px)` }}
							/>
							<span className="pointer-events-none relative z-10 pl-2 text-[10px] font-medium text-muted-foreground">
								{Math.round(previewVolume * 100)}%
							</span>
							<input
								type="range"
								aria-label={t("editor.playback.volume", "Preview volume")}
								min="0"
								max="1"
								step="0.01"
								value={previewVolume}
								onChange={(event) => setPreviewVolume(Number(event.target.value))}
								className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
