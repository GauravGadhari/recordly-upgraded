import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import { BrowserWindow } from "electron";
import { getLinuxCaptureBinaryPath } from "../paths/binaries";
import { emitRecordingInterrupted } from "./events";
import {
	linuxCaptureOutputBuffer,
	linuxCaptureStopRequested,
	linuxCaptureTargetPath,
	linuxNativeCaptureActive,
	selectedSource,
	setLinuxCaptureProcess,
	setLinuxCaptureStopRequested,
	setLinuxNativeCaptureActive,
} from "../state";

export const LINUX_CAPTURE_STOP_TIMEOUT_MS = 15000;

export async function isNativeLinuxCaptureAvailable(): Promise<boolean> {
	if (process.platform !== "linux") return false;

	try {
		const binaryPath = getLinuxCaptureBinaryPath();
		console.log("[linux-capture] Checking binary at:", binaryPath);
		await fs.access(binaryPath, fsConstants.X_OK);
		console.log("[linux-capture] Binary found and executable!");
		return true;
	} catch (err) {
		console.warn("[linux-capture] Binary NOT available:", err);
		return false;
	}
}

export function waitForLinuxCaptureStart(proc: ChildProcessWithoutNullStreams): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => {
			cleanup();
			reject(new Error("Timed out waiting for native Linux capture to start"));
		}, 30000); // 30s to allow for portal prompt interaction

		let stdoutBuffer = "";
		const onStdout = (chunk: Buffer) => {
			stdoutBuffer += chunk.toString();
			if (stdoutBuffer.includes("Recording started")) {
				cleanup();
				resolve();
			}
		};

		const onError = (error: Error) => {
			cleanup();
			reject(error);
		};

		const onExit = (code: number | null) => {
			cleanup();
			reject(
				new Error(
					linuxCaptureOutputBuffer.trim() ||
						`Native Linux capture exited before recording started (code ${code ?? "unknown"})`,
				),
			);
		};

		const cleanup = () => {
			clearTimeout(timer);
			proc.stdout.off("data", onStdout);
			proc.off("error", onError);
			proc.off("exit", onExit);
		};

		proc.stdout.on("data", onStdout);
		proc.once("error", onError);
		proc.once("exit", onExit);
	});
}

export function waitForLinuxCaptureStop(
	proc: ChildProcessWithoutNullStreams,
	timeoutMs = LINUX_CAPTURE_STOP_TIMEOUT_MS,
): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		let settled = false;
		const finish = (callback: () => void) => {
			if (settled) return;
			settled = true;
			cleanup();
			callback();
		};

		const timer = setTimeout(() => {
			finish(() => {
				try {
					if (!proc.killed) proc.kill();
				} catch {
					// The process may already be gone
				}
				reject(new Error("Timed out waiting for native Linux capture to stop"));
			});
		}, timeoutMs);

		const onClose = (code: number | null) => {
			finish(() => {
				const match = linuxCaptureOutputBuffer.match(
					/Recording stopped\. Output path: (.+)/,
				);
				if (match?.[1]) {
					resolve(match[1].trim());
					return;
				}
				if (code === 0 && linuxCaptureTargetPath) {
					resolve(linuxCaptureTargetPath);
					return;
				}
				reject(
					new Error(
						linuxCaptureOutputBuffer.trim() ||
							`Native Linux capture exited with code ${code ?? "unknown"}`,
					),
				);
			});
		};

		const onError = (error: Error) => {
			finish(() => {
				reject(error);
			});
		};

		const cleanup = () => {
			clearTimeout(timer);
			proc.off("close", onClose);
			proc.off("error", onError);
		};

		proc.once("close", onClose);
		proc.once("error", onError);
	});
}

export function attachLinuxCaptureLifecycle(proc: ChildProcessWithoutNullStreams): void {
	proc.once("close", () => {
		const wasActive = linuxNativeCaptureActive;
		setLinuxCaptureProcess(null);

		if (!wasActive || linuxCaptureStopRequested) {
			return;
		}

		setLinuxNativeCaptureActive(false);
		setLinuxCaptureStopRequested(false);

		const sourceName = selectedSource?.name ?? "Screen";
		BrowserWindow.getAllWindows().forEach((window) => {
			if (!window.isDestroyed()) {
				window.webContents.send("recording-state-changed", {
					recording: false,
					sourceName,
				});
			}
		});

		emitRecordingInterrupted("capture-stopped", "Recording stopped unexpectedly.");
	});
}
