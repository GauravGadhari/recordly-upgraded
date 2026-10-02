import { getAssetPath } from "@/lib/assetPath";
import { fromFileUrl, toFileUrl } from "@/components/video-editor/projectPersistence";

const NOOP = () => undefined;
const REMOTE_MEDIA_URL_PATTERN = /^(https?:|blob:|data:)/i;
const LOOPBACK_MEDIA_HOSTS = new Set(["127.0.0.1", "localhost"]);
const BUNDLED_ASSET_PATH_PREFIXES = ["/wallpapers/", "/app-icons/", "/sfx/"];

export function isAbsoluteLocalPath(resource: string) {
	return (
		resource.startsWith("/") ||
		/^[A-Za-z]:[\\/]/.test(resource) ||
		/^\\\\[^\\]+\\[^\\]+/.test(resource)
	);
}

export function isBundledAssetPath(resource: string) {
	return BUNDLED_ASSET_PATH_PREFIXES.some((prefix) => resource.startsWith(prefix));
}

function getLocalMediaServerPath(resource: string) {
	if (!/^https?:\/\//i.test(resource)) {
		return null;
	}

	try {
		const url = new URL(resource);
		if (!LOOPBACK_MEDIA_HOSTS.has(url.hostname) || url.pathname !== "/video") {
			return null;
		}

		const mediaPath = url.searchParams.get("path");
		return mediaPath && mediaPath.trim().length > 0 ? mediaPath : null;
	} catch {
		return null;
	}
}

export function isLocalMediaServerUrl(resource: string) {
	return getLocalMediaServerPath(resource) !== null;
}

export function getLocalFilePath(resource: string) {
	const localMediaServerPath = getLocalMediaServerPath(resource);
	if (localMediaServerPath) {
		return localMediaServerPath;
	}

	if (/^file:\/\//i.test(resource)) {
		return fromFileUrl(resource);
	}

	if (isBundledAssetPath(resource)) {
		return null;
	}

	return isAbsoluteLocalPath(resource) ? resource : null;
}

function isRemoteMediaResource(resource: string) {
	return REMOTE_MEDIA_URL_PATTERN.test(resource) && !isLocalMediaServerUrl(resource);
}

export function getNormalizedMediaResourceUrl(resource: string) {
	const localFilePath = getLocalFilePath(resource);
	if (!localFilePath) {
		return resource;
	}

	if (isLocalMediaServerUrl(resource)) {
		return resource;
	}

	return /^file:\/\//i.test(resource) ? resource : toFileUrl(localFilePath);
}

function inferMimeType(filePath: string) {
	const normalized = filePath.split("?")[0]?.toLowerCase() ?? filePath.toLowerCase();

	if (normalized.endsWith(".mp4") || normalized.endsWith(".m4v")) return "video/mp4";
	if (normalized.endsWith(".mov")) return "video/quicktime";
	if (normalized.endsWith(".webm")) return "video/webm";
	if (normalized.endsWith(".mkv")) return "video/x-matroska";
	if (normalized.endsWith(".avi")) return "video/x-msvideo";
	if (normalized.endsWith(".mp3")) return "audio/mpeg";
	if (normalized.endsWith(".wav")) return "audio/wav";
	if (normalized.endsWith(".m4a")) return "audio/mp4";
	if (normalized.endsWith(".aac")) return "audio/aac";
	if (normalized.endsWith(".ogg")) return "audio/ogg";
	if (normalized.endsWith(".opus")) return "audio/ogg;codecs=opus";
	if (normalized.endsWith(".flac")) return "audio/flac";

	return "application/octet-stream";
}

export async function resolveMediaResourceUrl(resource: string): Promise<string> {
	if (!resource) {
		return resource;
	}

	if (isBundledAssetPath(resource)) {
		return getAssetPath(resource.replace(/^\/+/, ""));
	}

	const localFilePath = getLocalFilePath(resource);
	if (!localFilePath) {
		return resource;
	}

	if (isLocalMediaServerUrl(resource)) {
		return resource;
	}

	if (typeof window !== "undefined" && window.electronAPI?.getLocalMediaUrl) {
		try {
			const result = await window.electronAPI.getLocalMediaUrl(localFilePath);
			if (result.success) {
				return result.url;
			}
		} catch {
			// Fall through to a file URL when the local media server is unavailable.
		}
	}

	return /^file:\/\//i.test(resource) ? resource : toFileUrl(localFilePath);
}

export async function loadMediaArrayBuffer(resource: string): Promise<ArrayBuffer> {
	if (!resource) {
		throw new Error("Empty media resource");
	}

	// 1. Direct base64 data URL decode — bypasses network stack, instant, never throws network errors
	if (resource.startsWith("data:")) {
		const commaIndex = resource.indexOf(",");
		if (commaIndex === -1) {
			throw new Error("Invalid data URL");
		}
		const base64 = resource.slice(commaIndex + 1);
		const binary = atob(base64);
		const len = binary.length;
		const bytes = new Uint8Array(len);
		for (let i = 0; i < len; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes.buffer;
	}

	// 2. Resolve URL (including bundled asset paths like /sfx/...)
	const resolvedUrl = await resolveMediaResourceUrl(resource);

	// 3. For local or file URLs in Electron, prefer reading directly via IPC if available
	const localPath =
		(/^file:\/\//i.test(resolvedUrl) ? fromFileUrl(resolvedUrl) : null) ||
		getLocalFilePath(resolvedUrl) ||
		getLocalFilePath(resource) ||
		(/^file:\/\//i.test(resource) ? fromFileUrl(resource) : null);

	if (localPath && typeof window !== "undefined" && window.electronAPI?.readLocalFile) {
		try {
			const result = await window.electronAPI.readLocalFile(localPath);
			if (result.success && result.data) {
				const bytes =
					result.data instanceof Uint8Array ? result.data : new Uint8Array(result.data);
				const copy = new Uint8Array(bytes.byteLength);
				copy.set(bytes);
				return copy.buffer;
			}
		} catch (err) {
			console.warn("[MediaSource] readLocalFile failed, falling back to fetch:", err);
		}
	}

	// 4. Fetch fallback
	const response = await fetch(resolvedUrl);
	if (!response.ok) {
		throw new Error(`Failed to load media: ${response.status} ${response.statusText}`);
	}
	return await response.arrayBuffer();
}

async function createReadableMediaResourceFile(resource: string): Promise<File> {
	const filename = resource.split(/[\\/]/).pop()?.split("?")[0] || "media";
	const resourceUrl = await resolveMediaResourceUrl(resource);
	const response = await fetch(resourceUrl);
	if (!response.ok) {
		throw new Error(`Failed to load media resource: ${response.status} ${response.statusText}`);
	}

	const blob = await response.blob();
	return new File([blob], filename, { type: blob.type || inferMimeType(filename) });
}

export async function createFallbackDemuxerSource(resource: string): Promise<string | File> {
	// Local media already has a random-access transport: WebDemuxer issues bounded
	// byte-range requests against this URL. Converting it to a File would copy the
	// complete recording through Electron IPC and make memory use scale with file size.
	if (getLocalFilePath(resource)) {
		return resolveMediaResourceUrl(resource);
	}

	return createReadableMediaResourceFile(resource);
}

export async function resolveMediaElementSource(resource: string): Promise<{
	src: string;
	revoke: () => void;
}> {
	if (!resource || isRemoteMediaResource(resource)) {
		return { src: resource, revoke: NOOP };
	}

	return {
		src: await resolveMediaResourceUrl(resource),
		revoke: NOOP,
	};
}
