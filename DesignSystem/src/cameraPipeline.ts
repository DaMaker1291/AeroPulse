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

function peakInterpolation(mag: Float64Array, peakIdx: number): number {
  const y0 = mag[peakIdx - 1] || 0;
  const y1 = mag[peakIdx];
  const y2 = mag[peakIdx + 1] || 0;
  const denom = y0 - 2 * y1 + y2;
  if (Math.abs(denom) < 1e-12) return peakIdx;
  return peakIdx + (y0 - y2) / (2 * denom);
}

export function computeHeartRate(filtered: Float64Array, fs: number): { bpm: number; freqs: number[]; power: number[]; snr: number } {
  const n = filtered.length;
  const fftLen = nextPow2(n);
  const han = hanningWindow(n);
  const padded = new Float64Array(fftLen);
  for (let i = 0; i < n; i++) padded[i] = filtered[i] * han[i];
  const mag = fftMagnitude(padded);
  const binSpacing = fs / fftLen;
  let maxPower = 0;
  let peakIdx = 0;
  const freqs: number[] = [];
  const power: number[] = [];
  let totalPower = 0;
  for (let i = 0; i < mag.length; i++) {
    const f = i * binSpacing;
    if (f < 0.75 || f > 2.75) continue;
    freqs.push(f);
    power.push(mag[i]);
    totalPower += mag[i];
    if (mag[i] > maxPower) { maxPower = mag[i]; peakIdx = i; }
  }
  const interpIdx = peakInterpolation(mag, peakIdx);
  const peakFreq = interpIdx * binSpacing;
  const snr = totalPower > 0 ? maxPower / (totalPower / power.length) : 0;
  return { bpm: peakFreq * 60, freqs, power, snr };
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

export function posProject(r: Float64Array, g: Float64Array, b: Float64Array): Float64Array {
  const n = r.length;
  const meanR = r.reduce((a, v) => a + v, 0) / n;
  const meanG = g.reduce((a, v) => a + v, 0) / n;
  const meanB = b.reduce((a, v) => a + v, 0) / n;
  if (meanR < 1 || meanG < 1 || meanB < 1) {
    return new Float64Array(n);
  }
  const nr = new Float64Array(n);
  const ng = new Float64Array(n);
  const nb = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    nr[i] = r[i] / meanR;
    ng[i] = g[i] / meanG;
    nb[i] = b[i] / meanB;
  }
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = nr[i] - nb[i];
    y[i] = nr[i] + ng[i] - 2 * nb[i];
  }
  const stdX = Math.sqrt(x.reduce((s, v) => s + v * v, 0) / n);
  const stdY = Math.sqrt(y.reduce((s, v) => s + v * v, 0) / n);
  const alpha = stdX / (stdY || 1e-10);
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
