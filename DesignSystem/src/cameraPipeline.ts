export class BiquadFilter {
  b0: number; b1: number; b2: number; a1: number; a2: number;
  x1 = 0; x2 = 0; y1 = 0; y2 = 0;
  constructor(b0: number, b1: number, b2: number, a1: number, a2: number) {
    this.b0 = b0; this.b1 = b1; this.b2 = b2; this.a1 = a1; this.a2 = a2;
  }
  process(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }
  reset() { this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0; }
}

const SOS_COEFFS_HR: [number, number, number, number, number][] = [
  [0.0000008987, 0.0000017973, 0.0000008987, -1.7457043886, 0.7780357524],
  [1, 2, 1, -1.7456878584, 0.8034788479],
  [1, 2, 1, -1.8423039935, 0.8553828891],
  [1, -2, 1, -1.8424727644, 0.9194858877],
  [1, -2, 1, -1.9178839034, 0.9255442094],
  [1, -2, 1, -1.9702374417, 0.9764941797],
];

export function createBandpassFilter(): BiquadFilter[] {
  return SOS_COEFFS_HR.map(c => new BiquadFilter(c[0], c[1], c[2], c[3], c[4]));
}

export function applyFilterChain(signal: Float64Array, filters: BiquadFilter[]): Float64Array {
  filters.forEach(f => f.reset());
  const out = new Float64Array(signal.length);
  for (let i = 0; i < signal.length; i++) {
    let v = signal[i];
    for (const f of filters) v = f.process(v);
    out[i] = v;
  }
  return out;
}

export function hanningWindow(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
  return w;
}

function bitReverse(n: number, bits: number): number {
  let rev = 0;
  for (let i = 0; i < bits; i++) {
    rev = (rev << 1) | (n & 1);
    n >>= 1;
  }
  return rev;
}

export function fftMagnitude(signal: Float64Array): Float64Array {
  const n = signal.length;
  const bits = Math.log2(n);
  const real = new Float64Array(n);
  const imag = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const j = bitReverse(i, bits);
    real[j] = signal[i];
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const angle = -2 * Math.PI / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let wr = 1, wi = 0;
      for (let j = 0; j < half; j++) {
        const k = i + j;
        const tRe = wr * real[k + half] - wi * imag[k + half];
        const tIm = wr * imag[k + half] + wi * real[k + half];
        real[k + half] = real[k] - tRe;
        imag[k + half] = imag[k] - tIm;
        real[k] += tRe;
        imag[k] += tIm;
        const nwr = wr * wRe - wi * wIm;
        wi = wr * wIm + wi * wRe;
        wr = nwr;
      }
    }
  }
  const mag = new Float64Array(n >> 1);
  for (let i = 0; i < mag.length; i++) {
    mag[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
  }
  return mag;
}

export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function gaussInterpolation(mag: Float64Array, peakIdx: number): number {
  const y0 = Math.log(mag[peakIdx - 1] || 1e-30);
  const y1 = Math.log(mag[peakIdx]);
  const y2 = Math.log(mag[peakIdx + 1] || 1e-30);
  const denom = 2 * (2 * y1 - y2 - y0);
  if (Math.abs(denom) < 1e-12) return peakIdx;
  return peakIdx + (y0 - y2) / denom;
}

export interface HRResult {
  bpm: number;
  freqs: number[];
  power: number[];
  snr: number;
  quality: number;
  peakProminence: number;
  harmonicRatio: number;
}

export function computeHeartRate(filtered: Float64Array, fs: number): HRResult {
  const n = filtered.length;
  const fftLen = nextPow2(n * 4); // 4× zero-padding for finer interpolation
  const han = hanningWindow(n);
  const padded = new Float64Array(fftLen);
  for (let i = 0; i < n; i++) padded[i] = filtered[i] * han[i];
  const mag = fftMagnitude(padded);
  const binSpacing = fs / fftLen;
  let maxPower = 0;
  let peakIdx = 0;
  let secondMaxPower = 0;
  const freqs: number[] = [];
  const power: number[] = [];
  let totalPower = 0;
  let meanPower = 0;
  for (let i = 0; i < mag.length; i++) {
    const f = i * binSpacing;
    if (f < 0.75 || f > 2.75) continue;
    freqs.push(f);
    power.push(mag[i]);
    totalPower += mag[i];
    if (mag[i] > maxPower) {
      secondMaxPower = maxPower;
      maxPower = mag[i];
      peakIdx = i;
    } else if (mag[i] > secondMaxPower) {
      secondMaxPower = mag[i];
    }
  }
  meanPower = totalPower / Math.max(freqs.length, 1);

  const interpIdx = gaussInterpolation(mag, peakIdx);
  const peakFreq = interpIdx * binSpacing;
  const snr = meanPower > 0 ? maxPower / Math.max(meanPower, 1e-30) : 0;

  // Peak prominence: how dominant the peak is vs surrounding bins
  const peakProminence = maxPower > 0 && secondMaxPower > 0
    ? (maxPower - secondMaxPower) / maxPower
    : 0;

  // Harmonic ratio: power at 2× fundamental vs fundamental peak
  const harmonicFreq = peakFreq * 2;
  let harmonicPower = 0;
  for (let i = 0; i < freqs.length; i++) {
    if (Math.abs(freqs[i] - harmonicFreq) < binSpacing * 2 && power[i] > harmonicPower) {
      harmonicPower = power[i];
    }
  }
  const harmonicRatio = maxPower > 0
    ? Math.min(1, harmonicPower / Math.max(maxPower, 1e-30))
    : 0;

  // Composite quality score (0-1)
  const snrNorm = Math.min(1, Math.max(0, (snr - 1.5) / 5.0));
  const promNorm = Math.min(1, Math.max(0, peakProminence * 2));
  const harmNorm = Math.min(1, harmonicRatio * 3);
  const quality = 0.45 * snrNorm + 0.3 * promNorm + 0.25 * harmNorm;

  return {
    bpm: peakFreq * 60, freqs, power, snr, quality,
    peakProminence, harmonicRatio,
  };
}

export function computeHRQuality(
  signal: Float64Array,
  hrBpm: number,
  hrResult: HRResult,
  motionScore: number,
): number {
  // SNR factor (0-1)
  const snrScore = Math.min(1, Math.max(0, (hrResult.snr - 1.5) / 5.0));

  // Peak prominence factor (0-1)
  const promScore = Math.min(1, Math.max(0, hrResult.peakProminence * 2));

  // Harmonic ratio factor: strong 2nd harmonic = cleaner pulse
  const harmScore = Math.min(1, hrResult.harmonicRatio * 3);

  // HR range factor: penalize extreme values
  const hrScore = hrBpm >= 55 && hrBpm <= 110 ? 1.0
    : hrBpm >= 50 && hrBpm <= 120 ? 0.7
    : 0.3;

  // Motion factor: 0 = high motion, 1 = no motion
  const motionFactor = Math.max(0, 1 - motionScore * 3);

  // Signal amplitude factor: need sufficient signal
  let ampSum = 0;
  for (let i = 0; i < signal.length; i++) ampSum += Math.abs(signal[i]);
  const ampMean = ampSum / signal.length;
  const ampScore = Math.min(1, ampMean * 10);

  return 0.30 * snrScore + 0.15 * promScore + 0.20 * harmScore + 0.15 * hrScore + 0.15 * motionFactor + 0.05 * ampScore;
}

export function adaptiveNoiseCancel(
  signal: Float64Array,
  reference: Float64Array,
  mu: number = 0.01,
  order: number = 4,
): Float64Array {
  const n = Math.min(signal.length, reference.length);
  if (n < order + 1) return signal.slice(0, n);

  const w = new Float64Array(order);
  const out = new Float64Array(n);

  for (let i = order; i < n; i++) {
    let noiseEst = 0;
    for (let j = 0; j < order; j++) {
      noiseEst += w[j] * reference[i - j];
    }
    const error = signal[i] - noiseEst;
    out[i] = error;

    // LMS update
    const norm = mu / (1e-10 + reference.slice(i - order, i).reduce((s, v) => s + v * v, 0));
    for (let j = 0; j < order; j++) {
      w[j] += norm * error * reference[i - j];
    }
  }

  // Copy initial samples
  for (let i = 0; i < order; i++) out[i] = signal[i];
  return out;
}

export function computeSpO2(r: Float64Array, g: Float64Array): number {
  const n = r.length;
  if (n < 10) return 0;
  const meanR = r.reduce((a, v) => a + v, 0) / n;
  const meanG = g.reduce((a, v) => a + v, 0) / n;
  if (meanR < 1 || meanG < 1) return 0;
  let acR = 0, acG = 0;
  for (let i = 0; i < n; i++) {
    acR += (r[i] - meanR) ** 2;
    acG += (g[i] - meanG) ** 2;
  }
  const rmsR = Math.sqrt(acR / n);
  const rmsG = Math.sqrt(acG / n);
  const ratio = (rmsR / meanR) / (rmsG / meanG + 1e-10);
  const spo2 = Math.round(110 - 25 * Math.max(0.2, Math.min(0.8, ratio)));
  return Math.max(85, Math.min(100, spo2));
}

export function computeRespirationRate(avgIntensity: Float64Array, fs: number): number {
  const n = avgIntensity.length;
  const fftLen = nextPow2(n);
  const han = hanningWindow(n);
  const padded = new Float64Array(fftLen);
  for (let i = 0; i < n; i++) padded[i] = avgIntensity[i] * han[i];
  const mag = fftMagnitude(padded);
  const binSpacing = fs / fftLen;
  let maxPower = 0;
  let peakFreq = 0;
  for (let i = 0; i < mag.length; i++) {
    const f = i * binSpacing;
    if (f < 0.1 || f > 0.5) continue;
    if (mag[i] > maxPower) { maxPower = mag[i]; peakFreq = f; }
  }
  return peakFreq * 60;
}

export function resample(signal: Float64Array, fromCount: number, toCount: number): Float64Array {
  const out = new Float64Array(toCount);
  for (let i = 0; i < toCount; i++) {
    const pos = (i / toCount) * fromCount;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = idx < fromCount ? signal[idx] : 0;
    const b = idx + 1 < fromCount ? signal[idx + 1] : a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

export function computeSkinROI(
  landmarks: { x: number; y: number }[],
  imageWidth: number, imageHeight: number
): { x: number; y: number; w: number; h: number } | null {
  if (landmarks.length < 468) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < landmarks.length; i++) {
    const px = landmarks[i].x * imageWidth;
    const py = landmarks[i].y * imageHeight;
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }
  const padX = (maxX - minX) * 0.15;
  const padY = (maxY - minY) * 0.15;
  return {
    x: Math.max(0, minX - padX),
    y: Math.max(0, minY - padY),
    w: Math.min(imageWidth, maxX - minX + padX * 2),
    h: Math.min(imageHeight, maxY - minY + padY * 2),
  };
}

export function extractRGB(imageData: ImageData, roi: { x: number; y: number; w: number; h: number }): { r: number; g: number; b: number } {
  const data = imageData.data;
  const startX = Math.floor(roi.x);
  const startY = Math.floor(roi.y);
  const endX = Math.min(Math.floor(roi.x + roi.w), imageData.width);
  const endY = Math.min(Math.floor(roi.y + roi.h), imageData.height);
  let rs = 0, gs = 0, bs = 0, count = 0;
  for (let y = startY; y < endY; y++) {
    const row = y * imageData.width;
    for (let x = startX; x < endX; x++) {
      const idx = (row + x) * 4;
      rs += data[idx];
      gs += data[idx + 1];
      bs += data[idx + 2];
      count++;
    }
  }
  return { r: rs / count, g: gs / count, b: bs / count };
}

export function posProject(r: Float64Array, g: Float64Array, b: Float64Array, fs: number = 60): Float64Array {
  const n = r.length;
  if (n < 3) return new Float64Array(n);

  const windowSec = 1.6;
  const W = Math.max(3, Math.round(windowSec * fs));

  // Cumulative sums for O(1) sliding window mean
  const csR = new Float64Array(n + 1);
  const csG = new Float64Array(n + 1);
  const csB = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    csR[i + 1] = csR[i] + r[i];
    csG[i + 1] = csG[i] + g[i];
    csB[i + 1] = csB[i] + b[i];
  }

  // Normalize each sample by its sliding window mean
  const nr = new Float64Array(n);
  const ng = new Float64Array(n);
  const nb = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - W + 1);
    const segLen = i - start + 1;
    const muR = (csR[i + 1] - csR[start]) / segLen;
    const muG = (csG[i + 1] - csG[start]) / segLen;
    const muB = (csB[i + 1] - csB[start]) / segLen;
    nr[i] = r[i] / Math.max(muR, 1e-12);
    ng[i] = g[i] / Math.max(muG, 1e-12);
    nb[i] = b[i] / Math.max(muB, 1e-12);
  }

  // POS projection: S1 = G_n - R_n, S2 = G_n + R_n - 2*B_n
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = ng[i] - nr[i];
    y[i] = ng[i] + nr[i] - 2.0 * nb[i];
  }

  let sx = 0, sy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i]; sy += y[i];
    sxx += x[i] * x[i]; syy += y[i] * y[i];
  }
  const mx = sx / n, my = sy / n;
  const vx = sxx / n - mx * mx, vy = syy / n - my * my;
  const stdX = Math.sqrt(Math.max(vx, 1e-30));
  const stdY = Math.sqrt(Math.max(vy, 1e-30));
  const alpha = stdX / Math.max(stdY, 1e-30);

  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = x[i] - alpha * y[i];
  return out;
}

export class SignalBuffer {
  buffer: Float64Array;
  pos = 0;
  size: number;
  constructor(size: number) { this.size = size; this.buffer = new Float64Array(size); }
  push(v: number) { this.buffer[this.pos] = v; this.pos = (this.pos + 1) % this.size; }
  length(): number { return this.size; }
  toArray(): Float64Array {
    const out = new Float64Array(this.size);
    for (let i = 0; i < this.size; i++) out[i] = this.buffer[(this.pos + i) % this.size];
    return out;
  }
  lastN(n: number): Float64Array {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = this.buffer[(this.pos - n + i + this.size) % this.size];
    return out;
  }
}

export const FACE_MESH_CONNECTIONS: number[][] = [
  [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10],
  [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246, 33],
  [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466, 263],
  [46, 53, 52, 65, 55, 70, 63, 105, 66, 107],
  [276, 283, 282, 295, 285, 300, 293, 334, 296, 336],
  [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185, 61],
  [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78],
  [168, 6, 197, 195, 5, 4, 1, 19, 94, 2],
  [474, 475, 476, 477],
  [469, 470, 471, 472],
];