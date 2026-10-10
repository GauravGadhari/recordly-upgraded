import { Pause, Play, SpeakerHigh as Volume2, SpeakerX as VolumeX } from "@phosphor-icons/react";
import { useScopedT } from "@/contexts/I18nContext";
import { cn } from "@/lib/utils";
import { formatSMPTETimecode } from "./timeline/core/time";
import { Button } from "../ui/button";

interface PlaybackControlsProps {
	isPlaying: boolean;
	currentTime: number;
	duration: number;
	onTogglePlayPause: () => void;
	onSeek: (time: number) => void;
	volume: number;
	onVolumeChange: (volume: number) => void;
}

export default function PlaybackControls({
	isPlaying,
	currentTime,
	duration,
	onTogglePlayPause,
	onSeek,
	volume,
	onVolumeChange,
}: PlaybackControlsProps) {
	const t = useScopedT("editor");

	function handleSeekChange(e: React.ChangeEvent<HTMLInputElement>) {
		onSeek(parseFloat(e.target.value));
	}

	function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
		onVolumeChange(Number(e.target.value));
	}

	const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

	return (
		<div className="flex items-center gap-2 px-1.5 pr-3 py-0.5 rounded-full bg-black/75 backdrop-blur-md border border-white/10 transition-colors duration-300 hover:bg-black/80 hover:border-white/20">
			<Button
				onClick={onTogglePlayPause}
				size="icon"
				className={cn(
					"w-8 h-8 rounded-full transition-all duration-200 border border-foreground/10",
					isPlaying
						? "bg-foreground/10 text-foreground hover:bg-foreground/20"
						: "bg-foreground text-background hover:bg-foreground/90",
				)}
				aria-label={isPlaying ? t("playback.pause") : t("playback.play")}
			>
				{isPlaying ? (
					<Pause className="w-3.5 h-3.5" weight="fill" />
				) : (
					<Play className="w-3.5 h-3.5" weight="fill" />
				)}
			</Button>

			<span className="text-[10px] font-mono font-semibold text-muted-foreground tabular-nums tracking-wider px-1">
				{formatSMPTETimecode(currentTime * 1000)}
			</span>

			<div className="flex-1 relative h-6 flex items-center group">
				{/* Custom Track Background */}
				<div className="absolute left-0 right-0 h-0.5 bg-foreground/10 rounded-full overflow-hidden">
					<div
						className="h-full bg-[#2563EB] rounded-full"
						style={{ width: `${progress}%` }}
					/>
				</div>

				{/* Interactive Input */}
				<input
					type="range"
					min="0"
					max={duration || 100}
					value={currentTime}
					onChange={handleSeekChange}
					step="0.01"
					className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
				/>

				{/* Custom Thumb (visual only, follows progress) */}
				<div
					className="absolute w-2.5 h-2.5 bg-foreground rounded-full pointer-events-none group-hover:scale-125 transition-transform duration-100"
					style={{
						left: `${progress}%`,
						transform: "translateX(-50%)",
					}}
				/>
			</div>

			<span className="text-[10px] font-mono font-medium text-muted-foreground/70 tabular-nums tracking-wider px-1">
				{formatSMPTETimecode(duration * 1000)}
			</span>

			<div className="flex items-center gap-1.5 pl-1">
				{volume <= 0.001 ? (
					<VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
				) : (
					<Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
				)}
				<div className="group relative flex h-6 w-20 items-center">
					<div className="absolute left-0 right-0 h-0.5 rounded-full bg-foreground/10 overflow-hidden">
						<div
							className="h-full rounded-full bg-foreground/70"
							style={{ width: `${volume * 100}%` }}
						/>
					</div>
					<input
						type="range"
						min="0"
						max="1"
						step="0.01"
						value={volume}
						onChange={handleVolumeChange}
						className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
					/>
					<div
						className="pointer-events-none absolute h-2.5 w-2.5 rounded-full bg-foreground transition-transform duration-100 group-hover:scale-125"
						style={{ left: `${volume * 100}%`, transform: "translateX(-50%)" }}
					/>
				</div>
			</div>
		</div>
	);
}
