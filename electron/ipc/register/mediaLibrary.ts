import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { dialog, ipcMain } from "electron";
import {
	rememberApprovedLocalReadPath,
	resolveApprovedLocalMediaPath,
} from "../project/manager";
import { buildMediaUrl, getMediaServerBaseUrl } from "../../mediaServer";
import {
	ensureMediaPreviewVideo,
	getCachedPreviewVideoPath,
} from "../ffmpeg/mediaThumbnails";

export interface MediaSoundItem {
	id: string;
	name: string;
	filePath: string;
	category: string;
}

export interface MediaTransitionPreset {
	id: string;
	name: string;
	type: string;
	description?: string;
}

export interface MediaTransitionItem {
	id: string;
	name: string;
	filePath: string;
	type: "film-burn";
	previewPath?: string;
}

export interface MediaMemeItem {
	id: string;
	name: string;
	filePath: string;
	category: "memes" | "green-screens" | "custom";
	isGreenScreen: boolean;
	previewPath?: string;
}

const DEFAULT_AUDIO_LIBRARY_DIR = "/mnt/editdrive/AudioLibrary";
const DEFAULT_VIDEO_ASSETS_DIR = "/mnt/editdrive/Global Presets/02_Video Assets";
const DEFAULT_MEME_PACK_DIR = "/mnt/editdrive/Global Presets/MEME PACK BY BIGSHOT ❤🔐";

const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".opus"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".mkv"]);

// In-memory cache to make repeated listing instant
let cachedSounds: MediaSoundItem[] | null = null;
let cachedTransitions: { builtIn: MediaTransitionPreset[]; filmBurns: MediaTransitionItem[] } | null = null;
let cachedMemes: MediaMemeItem[] | null = null;

function sanitizeCategoryName(folderName: string): string {
	return folderName
		.replace(/[\u{1F300}-\u{1FAFF}]/gu, "") // strip emojis
		.replace(/[()]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function cleanMediaName(filename: string): string {
	const ext = path.extname(filename);
	const base = path.basename(filename, ext);
	return base
		.replace(/^[0-9]+[_\-\s]*/, "") // remove leading track numbers
		.replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
		.replace(/[-_]+/g, " ")
		.trim();
}

async function scanDirectoryRecursive(
	dirPath: string,
	validExtensions: Set<string>,
	maxDepth = 4,
	currentDepth = 0,
): Promise<string[]> {
	if (currentDepth > maxDepth || !existsSync(dirPath)) return [];
	const results: string[] = [];

	try {
		const entries = await fs.readdir(dirPath, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path.join(dirPath, entry.name);
			if (entry.isDirectory()) {
				const nested = await scanDirectoryRecursive(
					fullPath,
					validExtensions,
					maxDepth,
					currentDepth + 1,
				);
				results.push(...nested);
			} else if (entry.isFile()) {
				const ext = path.extname(entry.name).toLowerCase();
				if (validExtensions.has(ext)) {
					results.push(fullPath);
				}
			}
		}
	} catch (err) {
		console.warn(`[mediaLibrary] Error scanning directory ${dirPath}:`, err);
	}

	return results;
}

const BUILT_IN_TRANSITIONS: MediaTransitionPreset[] = [
	{ id: "fade-black", name: "Fade to Black", type: "fade-black", description: "Smooth cinematic fade through black" },
	{ id: "dip-white", name: "Dip to White", type: "dip-white", description: "Flash effect dipping through pure white" },
	{ id: "cross-dissolve", name: "Cross Dissolve", type: "cross-dissolve", description: "Standard smooth dissolve" },
	{ id: "zoom-in", name: "Zoom In", type: "zoom-in", description: "Dynamic camera punch-in" },
	{ id: "zoom-out", name: "Zoom Out", type: "zoom-out", description: "Pull back revealing next scene" },
	{ id: "slide-left", name: "Slide Left", type: "slide-left", description: "Push transition towards the left" },
	{ id: "slide-right", name: "Slide Right", type: "slide-right", description: "Push transition towards the right" },
	{ id: "glitch", name: "Glitch Effect", type: "glitch", description: "Digital cyber glitch distortion" },
];

export function registerMediaLibraryHandlers() {
	// 1. SOUNDS
	ipcMain.handle("list-media-library-sounds", async (_, options?: { category?: string; search?: string }) => {
		try {
			if (!cachedSounds) {
				const items: MediaSoundItem[] = [];
				if (existsSync(DEFAULT_AUDIO_LIBRARY_DIR)) {
					const allFiles = await scanDirectoryRecursive(DEFAULT_AUDIO_LIBRARY_DIR, AUDIO_EXTENSIONS);
					for (const filePath of allFiles) {
						// determine category based on immediate or parent directory
						const rel = path.relative(DEFAULT_AUDIO_LIBRARY_DIR, filePath);
						const parts = rel.split(path.sep);
						let category = "SFX";
						if (parts.length > 2 && parts[0].includes("500+ Sound Effects")) {
							category = sanitizeCategoryName(parts[1]);
						} else if (parts.length > 1) {
							category = sanitizeCategoryName(parts[0]);
						}

						// Normalize common category names
						if (/user interface|ui/i.test(category)) category = "UI";
						else if (/whoosh/i.test(category)) category = "Whoosh";
						else if (/funny/i.test(category)) category = "Funny";
						else if (/meme/i.test(category)) category = "Meme SFX";
						else if (/transition/i.test(category)) category = "Transition SFX";
						else if (/cinematic/i.test(category)) category = "Cinematic";
						else if (/anime/i.test(category)) category = "Anime";
						else if (/glitch/i.test(category)) category = "Glitch";
						else if (/hits/i.test(category)) category = "Hits";
						else if (/risers/i.test(category)) category = "Risers";
						else if (/music/i.test(category)) category = "Music";

						const filename = path.basename(filePath);
						const name = cleanMediaName(filename) || filename;

						// Pre-approve local media server reading
						void rememberApprovedLocalReadPath(filePath);

						items.push({
							id: `sound-${items.length}`,
							name,
							filePath,
							category: category || "General",
						});
					}
				}
				cachedSounds = items;
			}

			let filtered = cachedSounds;
			if (options?.category && options.category !== "All") {
				const targetCat = options.category.toLowerCase();
				filtered = filtered.filter((s) => s.category.toLowerCase() === targetCat);
			}
			if (options?.search && options.search.trim()) {
				const q = options.search.toLowerCase().trim();
				filtered = filtered.filter(
					(s) => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q),
				);
			}

			const categoriesSet = new Set<string>(["All"]);
			for (const sound of cachedSounds) {
				categoriesSet.add(sound.category);
			}

			return {
				success: true,
				categories: Array.from(categoriesSet),
				items: filtered,
			};
		} catch (error) {
			console.error("[mediaLibrary] Failed to list sounds:", error);
			return { success: false, categories: ["All"], items: [], error: String(error) };
		}
	});

	// 2. TRANSITIONS
	ipcMain.handle("list-media-library-transitions", async () => {
		try {
			if (!cachedTransitions) {
				const filmBurns: MediaTransitionItem[] = [];
				const filmBurnsDir = path.join(DEFAULT_VIDEO_ASSETS_DIR, "Film Burns & Light Leaks");
				if (existsSync(filmBurnsDir)) {
					const files = await scanDirectoryRecursive(filmBurnsDir, VIDEO_EXTENSIONS);
					for (const filePath of files) {
						const filename = path.basename(filePath);
						const name = cleanMediaName(filename) || filename;
						void rememberApprovedLocalReadPath(filePath);
						const previewPath = getCachedPreviewVideoPath(filePath) ?? undefined;
						filmBurns.push({
							id: `transition-burn-${filmBurns.length}`,
							name,
							filePath,
							type: "film-burn",
							previewPath,
						});
					}
				}

				cachedTransitions = {
					builtIn: BUILT_IN_TRANSITIONS,
					filmBurns,
				};
			}

			return {
				success: true,
				builtIn: cachedTransitions.builtIn,
				filmBurns: cachedTransitions.filmBurns,
			};
		} catch (error) {
			console.error("[mediaLibrary] Failed to list transitions:", error);
			return {
				success: false,
				builtIn: BUILT_IN_TRANSITIONS,
				filmBurns: [],
				error: String(error),
			};
		}
	});

	// 3. MEMES
	ipcMain.handle("list-media-library-memes", async (_, options?: { category?: string; search?: string }) => {
		try {
			if (!cachedMemes) {
				const items: MediaMemeItem[] = [];

				// Green screens
				const greenScreensDir = path.join(DEFAULT_VIDEO_ASSETS_DIR, "Green Screens");
				if (existsSync(greenScreensDir)) {
					const files = await scanDirectoryRecursive(greenScreensDir, VIDEO_EXTENSIONS);
					for (const filePath of files) {
						const filename = path.basename(filePath);
						const name = cleanMediaName(filename) || filename;
						void rememberApprovedLocalReadPath(filePath);
						const previewPath = getCachedPreviewVideoPath(filePath) ?? undefined;
						items.push({
							id: `meme-green-${items.length}`,
							name,
							filePath,
							category: "green-screens",
							isGreenScreen: true,
							previewPath,
						});
					}
				}

				// Meme Clips
				const memeClipsDir = path.join(DEFAULT_VIDEO_ASSETS_DIR, "Meme Clips");
				if (existsSync(memeClipsDir)) {
					const files = await scanDirectoryRecursive(memeClipsDir, VIDEO_EXTENSIONS);
					for (const filePath of files) {
						const filename = path.basename(filePath);
						const name = cleanMediaName(filename) || filename;
						void rememberApprovedLocalReadPath(filePath);
						const previewPath = getCachedPreviewVideoPath(filePath) ?? undefined;
						items.push({
							id: `meme-clip-${items.length}`,
							name,
							filePath,
							category: "memes",
							isGreenScreen: false,
							previewPath,
						});
					}
				}

				// Meme Pack by BigShot
				if (existsSync(DEFAULT_MEME_PACK_DIR)) {
					const files = await scanDirectoryRecursive(DEFAULT_MEME_PACK_DIR, VIDEO_EXTENSIONS);
					for (const filePath of files) {
						const filename = path.basename(filePath);
						const name = cleanMediaName(filename) || filename;
						void rememberApprovedLocalReadPath(filePath);
						const previewPath = getCachedPreviewVideoPath(filePath) ?? undefined;
						items.push({
							id: `meme-pack-${items.length}`,
							name,
							filePath,
							category: "memes",
							isGreenScreen: false,
							previewPath,
						});
					}
				}

				cachedMemes = items;
			}

			let filtered = cachedMemes;
			if (options?.category && options.category !== "All") {
				if (options.category === "Green Screen") {
					filtered = filtered.filter((m) => m.isGreenScreen);
				} else if (options.category === "Meme Clips") {
					filtered = filtered.filter((m) => !m.isGreenScreen);
				}
			}
			if (options?.search && options.search.trim()) {
				const q = options.search.toLowerCase().trim();
				filtered = filtered.filter((m) => m.name.toLowerCase().includes(q));
			}

			return {
				success: true,
				items: filtered,
			};
		} catch (error) {
			console.error("[mediaLibrary] Failed to list memes:", error);
			return { success: false, items: [], error: String(error) };
		}
	});

	// 4. File Picker for custom assets
	ipcMain.handle("show-media-file-picker", async (_, type: "sound" | "transition" | "meme") => {
		try {
			const isAudio = type === "sound";
			const extensions = isAudio
				? ["mp3", "wav", "m4a", "aac", "ogg", "flac"]
				: ["mp4", "mov", "webm", "mkv", "gif"];

			const result = await dialog.showOpenDialog({
				title: isAudio ? "Select Sound File" : "Select Video / Meme File",
				properties: ["openFile"],
				filters: [
					{
						name: isAudio ? "Audio Files" : "Video Files",
						extensions,
					},
				],
			});

			if (result.canceled || result.filePaths.length === 0) {
				return { success: false };
			}

			const selectedPath = result.filePaths[0];
			await rememberApprovedLocalReadPath(selectedPath);
			const filename = path.basename(selectedPath);
			const name = cleanMediaName(filename) || filename;

			return {
				success: true,
				filePath: selectedPath,
				name,
			};
		} catch (error) {
			console.error("[mediaLibrary] Failed to pick file:", error);
			return { success: false, error: String(error) };
		}
	});

	// 5. Low-resolution Video Preview Generator
	ipcMain.handle("get-media-preview-video", async (_, filePath: string) => {
		try {
			if (!filePath || typeof filePath !== "string") {
				return { success: false, error: "Invalid file path" };
			}
			const previewPath = await ensureMediaPreviewVideo(filePath);
			if (!previewPath) {
				return { success: false, error: "Failed to generate preview video" };
			}
			const baseUrl = getMediaServerBaseUrl();
			const resolved = await resolveApprovedLocalMediaPath(previewPath);
			const url = baseUrl && resolved ? buildMediaUrl(baseUrl, resolved) : null;
			return {
				success: true,
				previewPath,
				url: url ?? undefined,
			};
		} catch (error) {
			return { success: false, error: String(error) };
		}
	});
}
