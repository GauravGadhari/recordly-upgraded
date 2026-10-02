import type { CursorTelemetryPoint } from "../types";

export interface ProceduralWhooshOptions {
	sampleRate?: number;
	basePitch?: number;
	maxPitch?: number;
	volume?: number;
	enableStereo?: boolean;
	durationMs?: number;
}

export interface GeneratedWhoosh {
	dataUrl: string;
	durationMs: number;
}

/**
 * Chamberlin State-Variable Filter (SVF).
 * Unconditionally stable and designed for sample-by-sample frequency modulation.
 */
class ChamberlinSvf {
	private low = 0;
	private band = 0;

	public process(input: number, fc: number, qVal: number, sampleRate: number): { band: number; low: number } {
		const f = 2 * Math.sin((Math.PI * Math.min(fc, sampleRate * 0.45)) / sampleRate);
		const q = 1 / Math.max(0.1, qVal);

		this.low += f * this.band;
		const high = input - this.low - q * this.band;
		this.band += f * high;

		return { band: this.band, low: this.low };
	}

	public reset() {
		this.low = 0;
		this.band = 0;
	}
}

/**
 * 3-pole pink noise generator (Paul Kellet algorithm).
 * Simulates the 1/f spectral density of natural rushing air.
 */
class PinkNoiseGenerator {
	private b0 = 0;
	private b1 = 0;
	private b2 = 0;

	public next(): number {
		const white = Math.random() * 2 - 1;
		this.b0 = 0.99765 * this.b0 + white * 0.099046;
		this.b1 = 0.963 * this.b1 + white * 0.2965164;
		this.b2 = 0.57 * this.b2 + white * 1.0526913;
		const pink = this.b0 + this.b1 + this.b2 + white * 0.1848;
		return pink * 0.18; // normalize
	}
}

/**
 * Encodes stereo Float32Array PCM samples into a 16-bit WAV data URL.
 */
export function encodeWavDataUrl(
	samplesL: Float32Array,
	samplesR: Float32Array,
	sampleRate = 44100,
): string {
	const numSamples = samplesL.length;
	const byteLength = 44 + numSamples * 4;
	const buffer = new ArrayBuffer(byteLength);
	const view = new DataView(buffer);

	// RIFF chunk descriptor
	writeString(view, 0, "RIFF");
	view.setUint32(4, 36 + numSamples * 4, true);
	writeString(view, 8, "WAVE");

	// fmt sub-chunk
	writeString(view, 12, "fmt ");
	view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
	view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
	view.setUint16(22, 2, true); // NumChannels (2 = Stereo)
	view.setUint32(24, sampleRate, true); // SampleRate
	view.setUint32(28, sampleRate * 4, true); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
	view.setUint16(32, 4, true); // BlockAlign (NumChannels * BitsPerSample/8)
	view.setUint16(34, 16, true); // BitsPerSample (16-bit)

	// data sub-chunk
	writeString(view, 36, "data");
	view.setUint32(40, numSamples * 4, true);

	// Interleaved 16-bit samples
	let offset = 44;
	for (let i = 0; i < numSamples; i++) {
		// Left channel
		const sL = Math.max(-1, Math.min(1, samplesL[i]));
		const intL = sL < 0 ? sL * 0x8000 : sL * 0x7fff;
		view.setInt16(offset, intL, true);
		offset += 2;

		// Right channel
		const sR = Math.max(-1, Math.min(1, samplesR[i]));
		const intR = sR < 0 ? sR * 0x8000 : sR * 0x7fff;
		view.setInt16(offset, intR, true);
		offset += 2;
	}

	// Base64 encoding in chunks
	const bytes = new Uint8Array(buffer);
	let binary = "";
	const chunkSize = 8192;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
	}

	return `data:audio/wav;base64,${btoa(binary)}`;
}

function writeString(view: DataView, offset: number, string: string) {
	for (let i = 0; i < string.length; i++) {
		view.setUint8(offset + i, string.charCodeAt(i));
	}
}

/**
 * Soft saturation curve (warm analog style).
 */
function softSaturate(x: number): number {
	return x / (1 + Math.abs(x) * 0.6);
}

/**
 * Procedurally synthesizes a motion-adaptive whoosh WAV from cursor telemetry points.
 * Modulates filter cutoff, resonance, sub-bass Doppler shift, and stereo panning
 * according to the cursor's speed and position.
 */
export function synthesizeCursorWhooshWav(
	points: CursorTelemetryPoint[],
	options: ProceduralWhooshOptions = {},
): GeneratedWhoosh {
	const sampleRate = options.sampleRate ?? 44100;
	const basePitch = options.basePitch ?? 260;
	const maxPitch = options.maxPitch ?? 2300;
	const volume = options.volume ?? 1.0;
	const enableStereo = options.enableStereo ?? true;

	// Determine duration
	let durationMs = options.durationMs;
	if (!durationMs) {
		if (points.length >= 2) {
			const start = points[0].timeMs;
			const end = points[points.length - 1].timeMs;
			durationMs = Math.max(180, Math.min(850, end - start));
		} else {
			durationMs = 380;
		}
	}

	const durationSec = durationMs / 1000;
	const numSamples = Math.max(256, Math.round(durationSec * sampleRate));
	const samplesL = new Float32Array(numSamples);
	const samplesR = new Float32Array(numSamples);

	// Pre-calculate velocities between telemetry points
	const velocities: number[] = [];
	let peakVelocity = 1.4;

	if (points.length >= 2) {
		for (let i = 0; i < points.length - 1; i++) {
			const p1 = points[i];
			const p2 = points[i + 1];
			const dt = Math.max(0.005, (p2.timeMs - p1.timeMs) / 1000);
			const dist = Math.hypot(p2.cx - p1.cx, p2.cy - p1.cy);
			const v = dist / dt;
			velocities.push(v);
			if (v > peakVelocity) peakVelocity = v;
		}
	}

	const filter = new ChamberlinSvf();
	const noiseGen = new PinkNoiseGenerator();
	let subPhase = 0;

	// Reference start time
	const startMs = points[0]?.timeMs ?? 0;

	for (let n = 0; n < numSamples; n++) {
		const t = n / sampleRate;
		const progress = t / durationSec;
		const currentMs = startMs + t * 1000;

		// 1. Interpolate velocity and position from telemetry
		let v = 0.5;
		let cx = 0.5;

		if (points.length >= 2) {
			// Find adjacent points
			let idx = 0;
			while (idx < points.length - 2 && points[idx + 1].timeMs < currentMs) {
				idx++;
			}
			const p1 = points[idx];
			const p2 = points[idx + 1];
			const span = Math.max(1, p2.timeMs - p1.timeMs);
			const alpha = Math.max(0, Math.min(1, (currentMs - p1.timeMs) / span));

			cx = p1.cx + (p2.cx - p1.cx) * alpha;
			const v1 = velocities[idx] ?? 1.0;
			const v2 = velocities[Math.min(idx + 1, velocities.length - 1)] ?? v1;
			v = v1 + (v2 - v1) * alpha;
		} else {
			// Fallback bell-curve velocity profile
			const bell = Math.sin(progress * Math.PI);
			v = bell * 2.5;
			cx = 0.5;
		}

		const normV = Math.max(0, Math.min(1, v / peakVelocity));

		// 2. Air turbulence: dynamic bandpass filter tracking velocity
		const fc = basePitch + (maxPitch - basePitch) * Math.pow(normV, 1.3);
		const qVal = 1.8 + 1.4 * normV;
		const rawNoise = noiseGen.next();
		const { band: airTurbulence, low: airBody } = filter.process(rawNoise, fc, qVal, sampleRate);
		const airSound = airTurbulence * 0.88 + airBody * 0.12;

		// 3. Sub-bass air displacement (Doppler sweep 140Hz down to 55Hz)
		const subFreq = 140 - 85 * Math.pow(progress, 1.15);
		subPhase += (2 * Math.PI * subFreq) / sampleRate;
		const subSample = Math.sin(subPhase) * Math.pow(normV, 1.8) * 0.28;

		// 4. Amplitude envelope: velocity-coupled with boundary smoothing
		const window = Math.sin(progress * Math.PI);
		const amp = Math.pow(normV, 1.05) * window * volume * 1.5;

		// 5. Stereo spatial panning
		let leftGain = 0.707;
		let rightGain = 0.707;
		if (enableStereo) {
			const pan = Math.max(-0.92, Math.min(0.92, (cx - 0.5) * 1.7));
			leftGain = Math.cos(((pan + 1) * Math.PI) / 4);
			rightGain = Math.sin(((pan + 1) * Math.PI) / 4);
		}

		// Combined signal with soft saturation
		const combined = airSound + subSample;
		samplesL[n] = softSaturate(combined * amp * leftGain);
		samplesR[n] = softSaturate(combined * amp * rightGain);
	}

	const dataUrl = encodeWavDataUrl(samplesL, samplesR, sampleRate);
	return { dataUrl, durationMs };
}

/**
 * Synthesizes a dedicated procedural whoosh for zoom in/out transitions.
 * Zoom-in: accelerating pitch up.
 * Zoom-out: settling pitch down.
 */
export function synthesizeZoomWhooshWav(
	isZoomIn: boolean,
	options: ProceduralWhooshOptions = {},
): GeneratedWhoosh {
	const sampleRate = options.sampleRate ?? 44100;
	const durationMs = options.durationMs ?? (isZoomIn ? 340 : 400);
	const durationSec = durationMs / 1000;
	const volume = options.volume ?? 1.0;
	const numSamples = Math.round(durationSec * sampleRate);

	const samplesL = new Float32Array(numSamples);
	const samplesR = new Float32Array(numSamples);
	const filter = new ChamberlinSvf();
	const noiseGen = new PinkNoiseGenerator();
	let subPhase = 0;

	for (let n = 0; n < numSamples; n++) {
		const progress = (n / sampleRate) / durationSec;
		const window = Math.sin(progress * Math.PI);

		// Cutoff frequency curve
		let fc: number;
		let subFreq: number;
		if (isZoomIn) {
			// Pitch sweeps up from 220Hz to 1900Hz
			fc = 220 + 1680 * Math.pow(progress, 1.5);
			subFreq = 70 + 75 * progress;
		} else {
			// Pitch sweeps down from 1900Hz to 200Hz
			fc = 200 + 1700 * Math.pow(1 - progress, 1.4);
			subFreq = 145 - 85 * progress;
		}

		const qVal = 2.2 + 0.8 * window;
		const rawNoise = noiseGen.next();
		const { band: airBand, low: airLow } = filter.process(rawNoise, fc, qVal, sampleRate);
		const airSound = airBand * 0.85 + airLow * 0.15;

		subPhase += (2 * Math.PI * subFreq) / sampleRate;
		const subSample = Math.sin(subPhase) * Math.pow(window, 1.5) * 0.25;

		const amp = window * volume * 1.35;
		const mono = softSaturate((airSound + subSample) * amp);

		samplesL[n] = mono * 0.707;
		samplesR[n] = mono * 0.707;
	}

	const dataUrl = encodeWavDataUrl(samplesL, samplesR, sampleRate);
	return { dataUrl, durationMs };
}

export interface ProceduralClickOptions {
	sampleRate?: number;
	volume?: number;
	style?: "crisp" | "soft" | "mechanical" | "digital" | "procedural";
	isRightClick?: boolean;
	isDoubleClick?: boolean;
	pan?: number; // -1 to 1
	durationMs?: number;
}

/**
 * Procedurally synthesizes a realistic mouse click using acoustic physical modeling:
 * 1. Metallic microswitch leaf snap (sharp micro-transient at 5.4kHz)
 * 2. Surface contact impact noise burst (< 1.5ms)
 * 3. Plastic mouse shell cavity resonance (formants at ~1250Hz and ~380Hz)
 * 4. Plunger bottoming-out mechanical rebound (~3.5ms delayed pulse)
 * 5. Organic micro-variation (subtle pitch/damping variations, right-click, double-click)
 * 6. Stereo spatial panning according to cursor screen position
 */
export function synthesizeCursorClickWav(
	options: ProceduralClickOptions = {},
): GeneratedWhoosh {
	const sampleRate = options.sampleRate ?? 44100;
	const style = options.style ?? "crisp";
	const volume = options.volume ?? 1.0;
	const isRight = Boolean(options.isRightClick);
	const isDouble = Boolean(options.isDoubleClick);

	const durationMs = options.durationMs ?? (style === "soft" ? 42 : style === "mechanical" ? 52 : 36);
	const durationSec = durationMs / 1000;
	const numSamples = Math.round(durationSec * sampleRate);

	const samplesL = new Float32Array(numSamples);
	const samplesR = new Float32Array(numSamples);

	// Acoustic formants based on switch style & click type
	let snapFreq = 5400; // Microswitch leaf metallic snap
	let cavityFreq = 1250; // Plastic mouse shell primary resonance
	let thumpFreq = 380; // Chassis low impact
	const reboundFreq = 2300; // Plunger bottoming out
	let snapDecay = 0.0010;
	let cavityDecay = 0.0045;
	const thumpDecay = 0.0070;

	if (style === "soft") {
		snapFreq = 3800;
		cavityFreq = 950;
		thumpFreq = 320;
		snapDecay = 0.0016;
		cavityDecay = 0.007;
	} else if (style === "mechanical") {
		snapFreq = 6200;
		cavityFreq = 1450;
		thumpFreq = 420;
		snapDecay = 0.0008;
		cavityDecay = 0.0035;
	}

	// Right click has lower lever-arm mechanical pitch (-12%)
	if (isRight) {
		snapFreq *= 0.88;
		cavityFreq *= 0.88;
		thumpFreq *= 0.86;
	}

	// 2nd click of double click is higher pitched and crisper (+7%)
	if (isDouble) {
		snapFreq *= 1.07;
		cavityFreq *= 1.06;
		cavityDecay *= 0.85;
	}

	// Random organic micro-jitter (human touch variation)
	const microPitch = 1.0 + (Math.random() - 0.5) * 0.05;
	snapFreq *= microPitch;
	cavityFreq *= microPitch;

	// Stereo panning (-1 left to +1 right)
	const pan = Math.max(-0.85, Math.min(0.85, options.pan ?? 0));
	const leftGain = Math.cos(((pan + 1) * Math.PI) / 4);
	const rightGain = Math.sin(((pan + 1) * Math.PI) / 4);

	for (let n = 0; n < numSamples; n++) {
		const t = n / sampleRate;

		// 1. Initial metallic leaf snap (sharp micro-transient)
		const snapEnv = Math.exp(-t / snapDecay);
		const snap = Math.sin(2 * Math.PI * snapFreq * t) * snapEnv * 0.75;

		// Surface contact friction noise burst (first 1.5ms)
		const noiseBurst = (Math.random() * 2 - 1) * Math.exp(-t / 0.0008) * 0.22;

		// 2. Plastic mouse shell cavity body resonance
		const cavityEnv = Math.exp(-t / cavityDecay);
		const cavity = Math.sin(2 * Math.PI * cavityFreq * t) * cavityEnv * 0.65;

		// 3. Chassis low thump
		const thumpEnv = Math.exp(-t / thumpDecay);
		const thump = Math.sin(2 * Math.PI * thumpFreq * t) * thumpEnv * 0.35;

		// 4. Plunger bottoming out (micro-rebound at ~3.5ms)
		let rebound = 0;
		if (t > 0.0035) {
			const tr = t - 0.0035;
			rebound = Math.sin(2 * Math.PI * reboundFreq * tr) * Math.exp(-tr / 0.0018) * 0.30;
		}

		// Combined composite click signal
		const rawSignal = (snap + noiseBurst + cavity + thump + rebound) * volume * 1.6;
		const saturated = softSaturate(rawSignal);

		samplesL[n] = saturated * leftGain;
		samplesR[n] = saturated * rightGain;
	}

	const dataUrl = encodeWavDataUrl(samplesL, samplesR, sampleRate);
	return { dataUrl, durationMs };
}

export interface ProceduralDragOptions {
	sampleRate?: number;
	volume?: number;
	pan?: number;
	durationMs?: number;
}

/**
 * Synthesizes a realistic mouse surface glide/friction sound for drag actions.
 */
export function synthesizeCursorDragWav(
	samples: CursorTelemetryPoint[] = [],
	options: ProceduralDragOptions = {},
): GeneratedWhoosh {
	const sampleRate = options.sampleRate ?? 44100;
	const volume = options.volume ?? 1.0;

	let durationMs = options.durationMs;
	if (!durationMs) {
		if (samples.length >= 2) {
			durationMs = Math.max(120, Math.min(1200, samples[samples.length - 1].timeMs - samples[0].timeMs));
		} else {
			durationMs = 450;
		}
	}

	const durationSec = durationMs / 1000;
	const numSamples = Math.round(durationSec * sampleRate);

	const samplesL = new Float32Array(numSamples);
	const samplesR = new Float32Array(numSamples);
	const filter = new ChamberlinSvf();
	const noiseGen = new PinkNoiseGenerator();

	const pan = Math.max(-0.8, Math.min(0.8, options.pan ?? 0));
	const leftGain = Math.cos(((pan + 1) * Math.PI) / 4);
	const rightGain = Math.sin(((pan + 1) * Math.PI) / 4);

	for (let n = 0; n < numSamples; n++) {
		const progress = (n / sampleRate) / durationSec;
		// Smooth bell window for glide start & release
		const window = Math.sin(progress * Math.PI);

		// Surface glide friction frequency (cloth mousepad texture ~650Hz to 1200Hz)
		const fc = 650 + 550 * window;
		const rawNoise = noiseGen.next();
		const { band: frictionBand } = filter.process(rawNoise, fc, 1.8, sampleRate);

		const rawSignal = frictionBand * window * volume * 1.2;
		const saturated = softSaturate(rawSignal);

		samplesL[n] = saturated * leftGain;
		samplesR[n] = saturated * rightGain;
	}

	const dataUrl = encodeWavDataUrl(samplesL, samplesR, sampleRate);
	return { dataUrl, durationMs };
}

export type ProceduralKeystrokeStyle = "mechanical" | "thock" | "typewriter" | "soft";

export interface ProceduralKeystrokeOptions {
	style?: ProceduralKeystrokeStyle;
	sampleRate?: number;
	volume?: number;
	pan?: number;
	isSpacebar?: boolean;
	isModifier?: boolean;
	durationMs?: number;
}

/**
 * Synthesizes an authentic keyboard keystroke/typing sound (mechanical click, thock, typewriter, or soft chiclet).
 */
export function synthesizeKeystrokeClickWav(
	options: ProceduralKeystrokeOptions = {},
): GeneratedWhoosh {
	const sampleRate = options.sampleRate ?? 44100;
	const style = options.style ?? "mechanical";
	const volume = options.volume ?? 1.0;
	const isSpacebar = options.isSpacebar ?? false;
	const isModifier = options.isModifier ?? false;

	const defaultDur = isSpacebar
		? (style === "typewriter" ? 68 : 55)
		: style === "thock"
			? 48
			: style === "typewriter"
				? 62
				: style === "soft"
					? 35
					: 42;
	const durationMs = options.durationMs ?? defaultDur;
	const durationSec = durationMs / 1000;
	const numSamples = Math.round(durationSec * sampleRate);

	const samplesL = new Float32Array(numSamples);
	const samplesR = new Float32Array(numSamples);

	// Acoustic formants
	let clickFreq = 5200;      // Switch contact / tactile click
	let keycapFreq = 1650;     // Stem/keycap plastic impact
	let plateFreq = 340;       // PCB / backplate resonant thock
	let clickDecay = 0.0011;
	let keycapDecay = 0.0035;
	let plateDecay = 0.0065;

	if (style === "thock") {
		// Deep, lubricated, solid switch (Gateron / Holy Panda)
		clickFreq = 2800;
		keycapFreq = 1100;
		plateFreq = 240;
		clickDecay = 0.0009;
		keycapDecay = 0.005;
		plateDecay = 0.009;
	} else if (style === "typewriter") {
		// Heavy mechanical strike + metallic ringing overtone
		clickFreq = 4600;
		keycapFreq = 2200;
		plateFreq = 420;
		clickDecay = 0.0018;
		keycapDecay = 0.006;
		plateDecay = 0.014;
	} else if (style === "soft") {
		// Modern laptop scissor switch (MacBook / ThinkPad quiet chiclet)
		clickFreq = 3200;
		keycapFreq = 1350;
		plateFreq = 280;
		clickDecay = 0.0008;
		keycapDecay = 0.0022;
		plateDecay = 0.004;
	}

	// Spacebar has deeper cavity resonance (-25%) and larger mass
	if (isSpacebar) {
		clickFreq *= 0.78;
		keycapFreq *= 0.75;
		plateFreq *= 0.70;
		plateDecay *= 1.35;
	} else if (isModifier) {
		// Modifiers (Ctrl, Shift, Enter) have slightly lower pitch (-8%)
		clickFreq *= 0.92;
		keycapFreq *= 0.90;
		plateFreq *= 0.88;
	}

	// Micro-pitch variance for natural human typing cadence
	const microPitch = 1.0 + (Math.random() - 0.5) * 0.06;
	clickFreq *= microPitch;
	keycapFreq *= microPitch;
	plateFreq *= microPitch;

	const pan = Math.max(-0.85, Math.min(0.85, options.pan ?? 0));
	const leftGain = Math.cos(((pan + 1) * Math.PI) / 4);
	const rightGain = Math.sin(((pan + 1) * Math.PI) / 4);

	for (let n = 0; n < numSamples; n++) {
		const t = n / sampleRate;

		// 1. Tactile click / leaf snap
		const clickEnv = Math.exp(-t / clickDecay);
		const click = Math.sin(2 * Math.PI * clickFreq * t) * clickEnv * 0.75;

		// 2. Plastic initial friction contact burst
		const contactNoise = (Math.random() * 2 - 1) * Math.exp(-t / 0.0009) * 0.28;

		// 3. Keycap bottoming out resonance
		const keycapEnv = Math.exp(-t / keycapDecay);
		const keycap = Math.sin(2 * Math.PI * keycapFreq * t) * keycapEnv * 0.60;

		// 4. Keyboard plate / chassis body thock
		const plateEnv = Math.exp(-t / plateDecay);
		const plate = Math.sin(2 * Math.PI * plateFreq * t) * plateEnv * 0.40;

		// 5. Stabilizer wire micro-clack for spacebar
		let stab = 0;
		if (isSpacebar && t > 0.0025) {
			const ts = t - 0.0025;
			stab = Math.sin(2 * Math.PI * 3400 * ts) * Math.exp(-ts / 0.0016) * 0.25;
		}

		// 6. Typewriter metallic harmonic overtone
		let ring = 0;
		if (style === "typewriter" && t > 0.003) {
			const tr = t - 0.003;
			ring =
				(Math.sin(2 * Math.PI * 1850 * tr) + 0.4 * Math.sin(2 * Math.PI * 3700 * tr)) *
				Math.exp(-tr / 0.012) *
				0.35;
		}

		const rawSignal = (click + contactNoise + keycap + plate + stab + ring) * volume * 1.5;
		const saturated = softSaturate(rawSignal);

		samplesL[n] = saturated * leftGain;
		samplesR[n] = saturated * rightGain;
	}

	const dataUrl = encodeWavDataUrl(samplesL, samplesR, sampleRate);
	return { dataUrl, durationMs };
}

export type ScrollSfxStyle = "ratchet" | "smooth" | "notch";

export interface ProceduralScrollOptions {
	sampleRate?: number;
	style?: ScrollSfxStyle;
	volume?: number;
	pan?: number;
	intensity?: number; // 0-1, maps to scroll speed/amount
	durationMs?: number;
}

/**
 * Procedurally synthesizes a mouse wheel scroll tick WAV.
 * Models the physical ratchet mechanism of a scroll wheel:
 * - Detent click from the notch spring
 * - Plastic housing resonance
 * - Wheel inertia micro-rattle
 */
export function synthesizeScrollTickWav(
	options: ProceduralScrollOptions = {},
): GeneratedWhoosh {
	const sampleRate = options.sampleRate ?? 44100;
	const style = options.style ?? "ratchet";
	const volume = options.volume ?? 1.0;
	const intensity = Math.max(0, Math.min(1, options.intensity ?? 0.5));

	const defaultDur = style === "smooth" ? 65 : style === "notch" ? 38 : 45;
	const durationMs = options.durationMs ?? defaultDur;
	const durationSec = durationMs / 1000;
	const numSamples = Math.round(durationSec * sampleRate);

	const samplesL = new Float32Array(numSamples);
	const samplesR = new Float32Array(numSamples);

	// Micro-pitch variance for natural scroll cadence
	const microPitch = 1.0 + (Math.random() - 0.5) * 0.08;

	// Acoustic parameters per style
	let detentFreq: number;
	let housingFreq: number;
	let rattleFreq: number;
	let detentDecay: number;
	let housingDecay: number;
	let rattleDecay: number;

	if (style === "smooth") {
		// Smooth encoder / trackpad feel
		detentFreq = 2800 * microPitch;
		housingFreq = 900 * microPitch;
		rattleFreq = 4200 * microPitch;
		detentDecay = 0.0008;
		housingDecay = 0.003;
		rattleDecay = 0.0005;
	} else if (style === "notch") {
		// Crisp, precise notch (Logitech MX-style)
		detentFreq = 4800 * microPitch;
		housingFreq = 1400 * microPitch;
		rattleFreq = 6200 * microPitch;
		detentDecay = 0.0006;
		housingDecay = 0.0018;
		rattleDecay = 0.0004;
	} else {
		// Default ratchet (standard mechanical scroll)
		detentFreq = 3600 * microPitch;
		housingFreq = 1100 * microPitch;
		rattleFreq = 5400 * microPitch;
		detentDecay = 0.0007;
		housingDecay = 0.0025;
		rattleDecay = 0.0005;
	}

	// Intensity modulates amplitude and adds a subtle pitch shift
	const intensityGain = 0.6 + intensity * 0.4;
	detentFreq *= 1.0 + intensity * 0.1;

	const pan = Math.max(-0.85, Math.min(0.85, options.pan ?? 0));
	const leftGain = Math.cos(((pan + 1) * Math.PI) / 4);
	const rightGain = Math.sin(((pan + 1) * Math.PI) / 4);

	for (let n = 0; n < numSamples; n++) {
		const t = n / sampleRate;

		// 1. Detent spring click
		const detentEnv = Math.exp(-t / detentDecay);
		const detent = Math.sin(2 * Math.PI * detentFreq * t) * detentEnv * 0.7;

		// 2. Initial contact burst (micro-friction)
		const contactNoise = (Math.random() * 2 - 1) * Math.exp(-t / 0.0006) * 0.2;

		// 3. Housing plastic resonance
		const housingEnv = Math.exp(-t / housingDecay);
		const housing = Math.sin(2 * Math.PI * housingFreq * t) * housingEnv * 0.35;

		// 4. Wheel rattle overtone
		const rattleEnv = Math.exp(-t / rattleDecay);
		const rattle = Math.sin(2 * Math.PI * rattleFreq * t) * rattleEnv * 0.15;

		const rawSignal = (detent + contactNoise + housing + rattle) * volume * intensityGain * 1.4;
		const saturated = rawSignal / (1 + Math.abs(rawSignal) * 0.6);

		samplesL[n] = saturated * leftGain;
		samplesR[n] = saturated * rightGain;
	}

	const dataUrl = encodeWavDataUrl(samplesL, samplesR, sampleRate);
	return { dataUrl, durationMs };
}
