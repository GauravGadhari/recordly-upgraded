import type { MemeRegion, TransitionRegion, TransitionType } from "../types";

export interface LibrarySoundToAdd {
	filePath: string;
	name?: string;
	category?: string;
	durationMs?: number;
}

export interface LibraryTransitionToAdd {
	type: TransitionType;
	durationMs: number;
	overlayVideoPath?: string;
	sfxAudioPath?: string;
	name?: string;
	greenScreen?: boolean;
	chromaKeySimilarity?: number;
	blendMode?: "screen" | "chroma-key" | "normal";
}

export interface LibraryMemeToAdd {
	videoPath: string;
	name: string;
	greenScreen?: boolean;
	chromaKeySimilarity?: number;
	durationMs?: number;
}

/**
 * Props shared by the Sounds / Transitions / Memes sidebar panels. Mounted
 * through `SettingsPanel` and built in `useEditorSettingsPanelProps`.
 */
export interface MediaLibraryPanelProps {
	onAddSound: (sound: LibrarySoundToAdd) => void;
	onAddTransition: (transition: LibraryTransitionToAdd) => void;
	onAddMeme: (meme: LibraryMemeToAdd) => void;
	transitionRegions: TransitionRegion[];
	memeRegions: MemeRegion[];
	selectedTransitionId: string | null;
	selectedMemeId: string | null;
	onTransitionUpdate: (id: string, updates: Partial<Omit<TransitionRegion, "id">>) => void;
	onMemeUpdate: (id: string, updates: Partial<Omit<MemeRegion, "id">>) => void;
	onTransitionDelete?: (id: string) => void;
	onMemeDelete?: (id: string) => void;
	onSeekToTime?: (timeMs: number) => void;
	onGenerateCursorSfx?: (options?: import("../timeline/sfxSuggestionUtils").AutoSfxGenerationOptions) => number;
	onClearCursorSfx?: () => void;
	onGenerateKeystrokeSfx?: (options?: {
		style?: import("../timeline/sfxSuggestionUtils").KeystrokeSfxStyle;
		volume?: number;
		shortcutsOnly?: boolean;
	}) => number;
	onClearKeystrokeSfx?: () => void;
}
