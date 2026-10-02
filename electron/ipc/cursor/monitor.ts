import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import { BrowserWindow } from "electron";
import {
	ensureNativeCursorMonitorBinary,
	getCursorMonitorExePath,
	getLinuxCursorMonitorBinaryPath,
} from "../paths/binaries";
import {
	currentCursorVisualType,
	isCursorCaptureActive,
	nativeCursorMonitorOutputBuffer,
	nativeCursorMonitorProcess,
	setCurrentCursorVisualType,
	setLinuxCursorScreenPoint,
	setNativeCursorMonitorOutputBuffer,
	setNativeCursorMonitorProcess,
} from "../state";
import type { CursorVisualType } from "../types";
import { recordCursorMouseDown, recordCursorMouseUp } from "./interaction";
import { recordKeyDown, recordKeyUp } from "./keystrokeTelemetry";
import { isCursorCapturePaused, sampleCursorPoint } from "./telemetry";

export function emitCursorStateChanged(cursorType: CursorVisualType) {
	BrowserWindow.getAllWindows().forEach((window) => {
		if (!window.isDestroyed()) {
			window.webContents.send("cursor-state-changed", { cursorType });
		}
	});
}

export function handleCursorMonitorStdout(chunk: Buffer) {
	setNativeCursorMonitorOutputBuffer(nativeCursorMonitorOutputBuffer + chunk.toString());
	const lines = nativeCursorMonitorOutputBuffer.split(/\r?\n/);
	setNativeCursorMonitorOutputBuffer(lines.pop() ?? "");

	for (const line of lines) {
		const keyMatch = line.match(/^KEY:(down|up):(\d+)$/);
		if (keyMatch) {
			const isDown = keyMatch[1] === "down";
			const code = Number(keyMatch[2]);
			if (isDown) {
				recordKeyDown(code, { source: "linux-evdev" });
			} else {
				recordKeyUp(code, true);
			}
			continue;
		}

		const interactionMatch = line.match(/^INTERACTION:(mousedown|mouseup)(?::([123]))?$/);
		if (interactionMatch) {
			if (interactionMatch[1] === "mouseup") {
				recordCursorMouseUp();
			} else {
				const button = Number(interactionMatch[2]);
				recordCursorMouseDown(button === 2 || button === 3 ? button : 1);
			}
			continue;
		}

		const posMatch = line.match(/^POSITION:(-?\d+(?:\.\d+)?):(-?\d+(?:\.\d+)?)$/);
		if (posMatch) {
			const x = Number.parseFloat(posMatch[1]);
			const y = Number.parseFloat(posMatch[2]);
			setLinuxCursorScreenPoint({ x, y, updatedAt: Date.now() });
			if (isCursorCaptureActive && !isCursorCapturePaused()) {
				sampleCursorPoint();
			}
			continue;
		}

		const match = line.match(/^STATE:(.+)$/);
		if (!match) continue;
		const next = match[1].trim() as CursorVisualType;
		if (
			next === "arrow" ||
			next === "text" ||
			next === "pointer" ||
			next === "crosshair" ||
			next === "open-hand" ||
			next === "closed-hand" ||
			next === "resize-ew" ||
			next === "resize-ns" ||
			next === "not-allowed"
		) {
			if (currentCursorVisualType !== next) {
				setCurrentCursorVisualType(next);
				emitCursorStateChanged(next);
				if (isCursorCaptureActive && !isCursorCapturePaused()) {
					sampleCursorPoint();
				}
			}
		}
	}
}

export function stopNativeCursorMonitor() {
	setCurrentCursorVisualType("arrow");

	if (!nativeCursorMonitorProcess) {
		return;
	}

	try {
		nativeCursorMonitorProcess.stdin.write("stop\n");
	} catch {
		// ignore stop signal issues
	}
	try {
		nativeCursorMonitorProcess.kill();
	} catch {
		// ignore kill issues
	}

	setNativeCursorMonitorProcess(null);
	setNativeCursorMonitorOutputBuffer("");
}

export async function startNativeCursorMonitor() {
	if (nativeCursorMonitorProcess && !nativeCursorMonitorProcess.killed) {
		return;
	}

	stopNativeCursorMonitor();

	if (process.platform !== "darwin" && process.platform !== "win32" && process.platform !== "linux") {
		setCurrentCursorVisualType("arrow");
		return;
	}

	try {
		let helperPath: string;
		let spawnCmd = "";
		let spawnArgs: string[] = [];

		if (process.platform === "win32") {
			helperPath = getCursorMonitorExePath();
			try {
				// Use F_OK on Windows — X_OK is meaningless and can give false positives
				await fs.access(helperPath, fsConstants.F_OK);
			} catch {
				console.warn("Windows cursor monitor helper missing:", helperPath);
				setCurrentCursorVisualType("arrow");
				return;
			}
			spawnCmd = helperPath;
			spawnArgs = [];
		} else if (process.platform === "darwin") {
			helperPath = await ensureNativeCursorMonitorBinary();
			spawnCmd = helperPath;
			spawnArgs = [];
		} else if (process.platform === "linux") {
			helperPath = getLinuxCursorMonitorBinaryPath();
			try {
				await fs.access(helperPath, fsConstants.X_OK);
			} catch {
				console.warn("Linux cursor monitor helper missing or not executable:", helperPath);
				setCurrentCursorVisualType("arrow");
				return;
			}
			spawnCmd = helperPath;
			spawnArgs = [];
		} else {
			setCurrentCursorVisualType("arrow");
			return;
		}

		setNativeCursorMonitorOutputBuffer("");
		setCurrentCursorVisualType("arrow");

		let proc: ReturnType<typeof spawn> | null;
		try {
			proc = spawn(spawnCmd, spawnArgs, {
				stdio: ["pipe", "pipe", "pipe"],
			});
		} catch (spawnError) {
			console.warn("Failed to spawn cursor monitor:", spawnError);
			setNativeCursorMonitorProcess(null);
			setCurrentCursorVisualType("arrow");
			return;
		}

		setNativeCursorMonitorProcess(proc as Parameters<typeof setNativeCursorMonitorProcess>[0]);
		const spawned = proc;
		if (!spawned) {
			setNativeCursorMonitorProcess(null);
			setCurrentCursorVisualType("arrow");
			return;
		}

		spawned.once("error", (error) => {
			console.warn("Native cursor monitor process error:", error);
			if (nativeCursorMonitorProcess === spawned) {
				setNativeCursorMonitorProcess(null);
				setNativeCursorMonitorOutputBuffer("");
				setCurrentCursorVisualType("arrow");
			}
		});

		if (spawned.stdout) spawned.stdout.on("data", handleCursorMonitorStdout);
		if (spawned.stderr) {
			spawned.stderr.on("data", () => {
				// Drain stderr so helper logging cannot block the process.
			});
		}

		spawned.once("close", () => {
			if (nativeCursorMonitorProcess === spawned) {
				setNativeCursorMonitorProcess(null);
				setNativeCursorMonitorOutputBuffer("");
				setCurrentCursorVisualType("arrow");
			}
		});
	} catch (error) {
		console.warn("Failed to start native cursor monitor:", error);
		setNativeCursorMonitorProcess(null);
		setNativeCursorMonitorOutputBuffer("");
		setCurrentCursorVisualType("arrow");
	}
}
