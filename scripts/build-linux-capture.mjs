import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, chmodSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

if (process.platform !== "linux") {
	console.log("[build-linux-capture] Skipping: host platform is not Linux.");
	process.exit(0);
}

console.log("[build-linux-capture] Building native Linux capture helper (C++)...");

const captureDir = path.join(projectRoot, "electron", "native", "linux-capture");
const buildDir = path.join(captureDir, "build");

// Configure and build with CMake
execSync(`cmake -B build -DCMAKE_BUILD_TYPE=Release`, { cwd: captureDir, stdio: "inherit" });
execSync(`cmake --build build --config Release`, { cwd: captureDir, stdio: "inherit" });

// Stage the compiled binary into the bundled path
const compiledBinary = path.join(buildDir, "linux-capture");
const bundledLinuxDir = path.join(projectRoot, "electron", "native", "bin", "linux-x64");
const bundledLinuxPath = path.join(bundledLinuxDir, "linux-capture");

mkdirSync(bundledLinuxDir, { recursive: true });
copyFileSync(compiledBinary, bundledLinuxPath);
chmodSync(bundledLinuxPath, 0o755);

console.log(`[build-linux-capture] Built and staged: ${bundledLinuxPath}`);
