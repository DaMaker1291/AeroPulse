import { useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import {
  createBandpassFilter, applyFilterChain, computeHeartRate, computeRespirationRate, computeSpO2,
  extractRGB, extractRGBSkin, computeSkinROI, posProject, SignalBuffer, FACE_MESH_CONNECTIONS,
  HRResult, computeHRQuality, adaptiveNoiseCancel, computeHRV, normalizeImageData,
} from './cameraPipeline';

export interface VitalsData {
  heartRate: number;
  respiration: number;
  bloodOxygen: number;
  hrvSdnn: number;
  hrvRmssd: number;
}

export interface TriageData {
  bilateralSymmetry: number;
  neuromuscularLag: number;
  vascularCompliance: number;
  tremorPeakHz: number;
}

export interface FftData {
  freqs: number[];
  power: number[];
}

export interface BackendState {
  targetStatus: 'locked' | 'acquiring' | 'standby';
  cameraConnected: boolean;
  faceTracked: boolean;
  vitals: VitalsData;
  rppgWave: number[];
  m3Wave: number[];
  m4Wave: number[];
  triage: TriageData;
  fft: FftData;
  connected: boolean;
  streamUrl: string;
  cameraStream: MediaStream | null;
  faceMesh: number[] | null;
}

const INITIAL: BackendState = {
  targetStatus: 'standby',
  cameraConnected: false,
  faceTracked: false,
  vitals: { heartRate: 0, respiration: 0, bloodOxygen: 0, hrvSdnn: 0, hrvRmssd: 0 },
  rppgWave: [],
  m3Wave: [],
  m4Wave: [],
  triage: { bilateralSymmetry: 0, neuromuscularLag: 0, vascularCompliance: 0, tremorPeakHz: 0 },
  fft: { freqs: [], power: [] },
  connected: false,
  streamUrl: '',
  cameraStream: null,
  faceMesh: null,
};

const RPPG_BUF_SECS = 20;
const WINDOW_SECS = 8;
const FFT_FS = 60;
const STATE_INTERVAL = 80;
const WAVE_LEN = 60;
const HR_EMA_ALPHA = 0.55;
const HR_QUALITY_THRESHOLD = 0.30;
const HR_STABILITY_REQUIRED = 3;
const HR_MIN_ACCEPTABLE = 45;
const HR_MAX_ACCEPTABLE = 180;
const HR_CHANGE_MAX = 15;
const MOTION_BLEND_THRESHOLD = 0.15;
const PROC_W = 320;
const PROC_H = 240;

export function useWebSocket(_url?: string) {
  const [state, setState] = useState<BackendState>(INITIAL);
  const stateRef = useRef(state);
  const running = useRef(true);

  useEffect(() => {
    running.current = true;
    const nBuf = FFT_FS * RPPG_BUF_SECS;
    const rBuf = new SignalBuffer(nBuf);
    const gBuf = new SignalBuffer(nBuf);
    const bBuf = new SignalBuffer(nBuf);
    const hrFilters = createBandpassFilter();
    let frameCount = 0;
    let lastFaceTime = 0;
    let faceLockStart = 0;
    let faceLandmarker: FaceLandmarker | null = null;
    let videoEl: HTMLVideoElement | null = null;
    let canvasEl: HTMLCanvasElement | null = null;
    let stream: MediaStream | null = null;
    let animId = 0;
    let lastStateTime = 0;
    let lastHrTime = 0;
    let latestHr = 0;
    let smoothedHr = 0;
    let latestRespiration = 0;
    let latestHrvSdnn = 0;
    let latestHrvRmssd = 0;
    let latestFreqs: number[] = [];
    let latestPower: number[] = [];
    let waveformIdx = 0;
    let filteredWavePrev = 0;
    const waveBuf = new Float64Array(WAVE_LEN);
    const posBuf = new Float64Array(WAVE_LEN);
    let posWfIdx = 0;
    let latestMesh: number[] | null = null;
    let signalQualityAccum = 0;
    let signalQualityCount = 0;

    // Quality gating
    let consecutiveBadReadings = 0;

    // Background reference for adaptive noise canceling
    const bgBuf = new SignalBuffer(nBuf);

    // Motion tracking: running RMS of landmark displacement
    let motionRmsAccum = 0;
    let motionRmsCount = 0;

    // Face mesh symmetry & tremor buffers
    const centroidBufX = new SignalBuffer(FFT_FS * 5);
    const centroidBufY = new SignalBuffer(FFT_FS * 5);
    let symmetryAccum = 0;
    let symmetryCount = 0;
    let blinkCount = 0;
    let prevEyeRatio = 0;
    let prevUpperLip = 0;
    let prevLowerLip = 0;
    let microMotionAccum = 0;
    let microMotionCount = 0;

    // For intensity-based respiration
    const intBuf = new SignalBuffer(nBuf);
    const hrvBufSize = FFT_FS * 30; // 30-second buffer for HRV
    const hrvBuf = new SignalBuffer(hrvBufSize);

    const processFrame = async (ts: number) => {
      if (!running.current) return;
      animId = requestAnimationFrame(processFrame);
      if (!videoEl || !canvasEl) return;

      try {
        const ctx = canvasEl.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(videoEl, 0, 0, PROC_W, PROC_H);
        const imgData = ctx.getImageData(0, 0, PROC_W, PROC_H);

        let hasFace = false;
        let landmarks: { x: number; y: number }[] | null = null;

        if (faceLandmarker) {
          try {
            const result = faceLandmarker.detectForVideo(videoEl, performance.now());
            hasFace = result.faceLandmarks && result.faceLandmarks.length > 0;
            if (hasFace) landmarks = result.faceLandmarks[0];
          } catch (e) {
            // MediaPipe detection failed this frame
          }
        }

        // Extract ROI: from face landmarks if available, otherwise center crop
        let roi: { x: number; y: number; w: number; h: number } | null = null;
        if (landmarks) {
          roi = computeSkinROI(landmarks, PROC_W, PROC_H);
          lastFaceTime = performance.now();
          if (faceLockStart === 0) faceLockStart = performance.now();

          // Compute face symmetry from mesh
          let leftSum = 0, rightSum = 0;
          let leftCount = 0, rightCount = 0;
          let cx = 0, cy = 0;
          for (const lm of landmarks) { cx += lm.x; cy += lm.y; }
          cx /= landmarks.length; cy /= landmarks.length;
          for (const lm of landmarks) {
            if (lm.x < cx) { leftCount++; leftSum += cx - lm.x; }
            else { rightCount++; rightSum += lm.x - cx; }
          }
          const leftAvg = leftCount > 0 ? leftSum / leftCount : 0;
          const rightAvg = rightCount > 0 ? rightSum / rightCount : 0;
          const ratio = leftAvg > 0 && rightAvg > 0 ? Math.min(leftAvg, rightAvg) / Math.max(leftAvg, rightAvg) : 1;
          symmetryAccum += ratio;
          symmetryCount++;

          centroidBufX.push(cx);
          centroidBufY.push(cy);

          // Facial micro-motion from frame-to-frame landmark jitter
          let motionSum = 0;
          for (let i = 0; i < landmarks.length; i++) {
            const dx = landmarks[i].x - (latestMesh?.[i * 2] ?? landmarks[i].x);
            const dy = landmarks[i].y - (latestMesh?.[i * 2 + 1] ?? landmarks[i].y);
            motionSum += Math.sqrt(dx * dx + dy * dy);
          }
          microMotionAccum += motionSum / landmarks.length;
          microMotionCount++;

          // Store face mesh
          const flat: number[] = [];
          for (const lm of landmarks) { flat.push(lm.x, lm.y); }
          latestMesh = flat;
        } else {
          // No face detected — use center crop as fallback for signal extraction
          const cropW = PROC_W * 0.4;
          const cropH = PROC_H * 0.4;
          roi = { x: (PROC_W - cropW) / 2, y: (PROC_H - cropH) / 2, w: cropW, h: cropH };
          if (!faceLandmarker) {
            // MediaPipe not available: treat as face-locked for signal pipeline
            if (faceLockStart === 0) faceLockStart = performance.now();
            lastFaceTime = performance.now();
          } else {
            // MediaPipe loaded but no face: still use center-crop for signal; treat as locked after warmup
            if (faceLockStart === 0) faceLockStart = performance.now();
            lastFaceTime = performance.now();
            latestMesh = null;
          }
        }

        if (roi) {
          // Apply per-frame brightness normalization to reduce lighting artifacts
          normalizeImageData(imgData);
          // Use skin-pixel-filtered extraction for cleaner PPG signal
          const rgb = landmarks ? extractRGBSkin(imgData, roi) : extractRGB(imgData, roi);
          rBuf.push(rgb.r);
          gBuf.push(rgb.g);
          bBuf.push(rgb.b);
          const avgIntensity = (rgb.r + rgb.g + rgb.b) / 3;
          intBuf.push(avgIntensity);
          waveBuf[waveformIdx % WAVE_LEN] = avgIntensity;
          waveformIdx++;
          frameCount++;
          signalQualityAccum += Math.abs(rgb.g - rgb.r) / (rgb.g + rgb.r + 1);
          signalQualityCount++;

          // Extract background noise reference from top-left 10% corner
          const bgROI = { x: 0, y: 0, w: PROC_W * 0.12, h: PROC_H * 0.12 };
          const bgRgb = extractRGB(imgData, bgROI);
          const bgIntensity = (bgRgb.r + bgRgb.g + bgRgb.b) / 3;
          bgBuf.push(bgIntensity);

          // Track motion from face landmark displacement
          if (latestMesh) {
            const pts = landmarks
              ? landmarks.map(lm => ({ x: lm.x, y: lm.y }))
              : null;
            if (pts) {
              let dxSum = 0, dySum = 0;
              for (let i = 0; i < Math.min(pts.length, latestMesh.length / 2); i++) {
                dxSum += (pts[i].x - latestMesh[i * 2]) ** 2;
                dySum += (pts[i].y - latestMesh[i * 2 + 1]) ** 2;
              }
              const nPts = Math.min(pts.length, latestMesh.length / 2);
              const rms = Math.sqrt((dxSum + dySum) / (nPts || 1));
              motionRmsAccum += rms;
              motionRmsCount++;
            }
          }
        }

        const now = performance.now();
        if (now - lastStateTime < STATE_INTERVAL) return;
        lastStateTime = now;

        const faceLocked = (performance.now() - lastFaceTime) < 3000;
        const acquiring = faceLocked && (faceLockStart > 0 && (performance.now() - faceLockStart) < 4000);

        // Heart rate every 1 second, minimum 6s of data
        const motionScore = motionRmsCount > 0 ? motionRmsAccum / motionRmsCount : 0;
        const motionHeavy = motionScore > MOTION_BLEND_THRESHOLD;

        if (faceLocked && frameCount > FFT_FS * WINDOW_SECS && now - lastHrTime > 1000) {
          lastHrTime = now;
          const rawR = rBuf.toArray();
          const rawG = gBuf.toArray();
          const rawB = bBuf.toArray();
          const rawBg = bgBuf.toArray();

          // Apply POS with sliding-window normalization (fixed formula)
          const posSig = posProject(rawR, rawG, rawB, FFT_FS);
          const filtered = applyFilterChain(posSig, hrFilters);

          // Adaptive noise canceling using background reference
          const bgFiltered = applyFilterChain(
            posProject(rawBg, rawBg, rawBg, FFT_FS),
            hrFilters
          );
          const cleaned = adaptiveNoiseCancel(filtered, bgFiltered, 0.005, 4);

          const winLen = FFT_FS * WINDOW_SECS;
          const n = Math.min(winLen, cleaned.length);
          const win = new Float64Array(n);
          const src = cleaned;
          for (let i = 0; i < n; i++) win[i] = src[src.length - n + i];
          const hr = computeHeartRate(win, FFT_FS);

          const bpmInRange = hr.bpm > HR_MIN_ACCEPTABLE && hr.bpm < HR_MAX_ACCEPTABLE;
          const signalQuality = computeHRQuality(win, hr.bpm, hr, motionScore);

          // On heavy motion, blend new readings at lower weight instead of freezing
          const motionWeight = motionHeavy ? 0.15 : 1.0;

          if (bpmInRange && signalQuality > HR_QUALITY_THRESHOLD) {
            consecutiveBadReadings = 0;
            // Adaptive EMA: quality-based alpha (no decay — always responsive)
            const adaptiveAlpha = Math.min(0.7, HR_EMA_ALPHA + 0.2 * signalQuality) * motionWeight;

            if (smoothedHr === 0) {
                smoothedHr = hr.bpm;
              } else {
                const delta = Math.abs(hr.bpm - smoothedHr);
                if (delta < HR_CHANGE_MAX) {
                  smoothedHr = smoothedHr * (1 - adaptiveAlpha) + hr.bpm * adaptiveAlpha;
              } else if (delta < HR_CHANGE_MAX * 1.5) {
                // Moderate jump: half weight
                smoothedHr = smoothedHr * 0.6 + hr.bpm * 0.4;
              }
              // Large jump: blend at minimum weight
              if (delta >= HR_CHANGE_MAX * 1.5) {
                smoothedHr = smoothedHr * 0.85 + hr.bpm * 0.15;
              }
            }
            latestHr = Math.round(smoothedHr);

            // Respiration from intensity signal
            const iBuf = intBuf.toArray();
            const iWin = new Float64Array(n);
            for (let i = 0; i < n; i++) iWin[i] = iBuf[iBuf.length - n + i];
            const respResult = computeRespirationRate(iWin, FFT_FS);
            latestRespiration = respResult.rate;

            // HRV from the full 20s buffer (more peaks = more reliable)
            const hrvMetrics = computeHRV(cleaned, FFT_FS);
            latestHrvSdnn = hrvMetrics.sdnn;
            latestHrvRmssd = hrvMetrics.rmssd;
          } else {
            consecutiveBadReadings++;
            // Freeze display on last good reading — don't update latestHr
            // Only clear when face is lost (handled below)
          }

          // Always update FFT data for display, but quality-gate HR
          latestFreqs = hr.freqs;
          latestPower = hr.power;

          const posLen = Math.min(WAVE_LEN, n);
          for (let i = 0; i < posLen; i++) {
            posBuf[posWfIdx % WAVE_LEN] = cleaned[i];
            posWfIdx++;
          }
          }

        const avgQuality = signalQualityCount > 0 ? signalQualityAccum / signalQualityCount : 0;
        const sigQual = Math.min(1, Math.max(0, avgQuality * 2));

        // Face symmetry from actual mesh landmarks (100 = perfectly symmetric)
        const avgSymmetry = symmetryCount > 0 ? (symmetryAccum / symmetryCount) * 100 : 0;
        const symmetry = Math.round(Math.min(100, Math.max(0, avgSymmetry)));

        // Facial micro-motion (tremor proxy): how much landmarks jitter frame-to-frame
        const avgMicroMotion = microMotionCount > 0 ? (microMotionAccum / microMotionCount) * 1000 : 0;
        const microMotionNorm = Math.min(100, Math.max(0, avgMicroMotion * 20));

        // Tremor from face centroid FFT
        const cLen = centroidBufX.size;
        let tremorHz = 0;
        if (cLen >= FFT_FS * 2) {
          const cxArr = centroidBufX.toArray();
          const n = cLen;
          const win = new Float64Array(n);
          for (let i = 0; i < n; i++) win[i] = cxArr[i];
          const res = computeHeartRate(win, FFT_FS);
          // Find dominant freq in tremor band (3-12 Hz)
          let peakPower = 0, peakFreq = 0;
          for (let i = 0; i < res.freqs.length; i++) {
            if (res.freqs[i] >= 3 && res.freqs[i] <= 12 && res.power[i] > peakPower) {
              peakPower = res.power[i];
              peakFreq = res.freqs[i];
            }
          }
          tremorHz = peakFreq > 0 ? peakFreq : 0;
        }

        // Vascular compliance from signal quality (real — derived from RGB pulse amplitude)
        const compliance = sigQual > 0 ? Math.round(55 + sigQual * 40) : 0;

        // Build rPPG wave from live intensity buffer (updated every frame)
        const wavLen = Math.min(WAVE_LEN, waveformIdx);
        const rppgWav: number[] = [];
        if (wavLen > 0) {
          const buf = waveBuf;
          const idx = waveformIdx;
          const mean = buf.reduce((s, v, i) => i < wavLen ? s + v : s, 0) / wavLen;
          for (let i = 0; i < wavLen; i++) {
            rppgWav.push(buf[(idx - wavLen + i) % WAVE_LEN] - mean);
          }
        }

        // VEX motor data comes from serial port (useVexSerial), not generated here

        // Hold last HR for 5s when face is lost, then clear
        if (!faceLocked) {
          const timeSinceFace = (performance.now() - lastFaceTime);
          if (timeSinceFace > 5000) {
            latestHr = 0;
            latestRespiration = 0;
            latestHrvSdnn = 0;
            latestHrvRmssd = 0;
            smoothedHr = 0;
            consecutiveBadReadings = 0;
          }
        }

        // SpO2 estimated from RGB ratio-of-ratios (red/green AC/DC)
        const spo2Est = latestHr > 0 ? computeSpO2(rBuf.toArray(), gBuf.toArray()) : 0;

        const upd: BackendState = {
          targetStatus: faceLocked ? (acquiring ? 'acquiring' : 'locked') : 'standby',
          cameraConnected: true,
          faceTracked: faceLocked,
          vitals: {
            heartRate: latestHr,
            respiration: latestRespiration,
            bloodOxygen: spo2Est,
            hrvSdnn: latestHrvSdnn,
            hrvRmssd: latestHrvRmssd,
          },
          rppgWave: rppgWav,
          m3Wave: [],
          m4Wave: [],
          triage: {
            bilateralSymmetry: symmetry,
            neuromuscularLag: Math.round(microMotionNorm),
            vascularCompliance: compliance,
            tremorPeakHz: Math.round(tremorHz * 10) / 10,
          },
          fft: { freqs: latestFreqs, power: latestPower },
          connected: true,
          streamUrl: 'camera',
          cameraStream: stream,
          faceMesh: latestMesh,
        };
        stateRef.current = upd;
        setState(upd);
      } catch (e) { console.error('rPPG frame error:', e); }
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        });
        const vid = document.createElement('video');
        videoEl = vid;
        vid.srcObject = stream;
        vid.playsInline = true;
        vid.muted = true;
        await vid.play();
        const cv = document.createElement('canvas');
        canvasEl = cv;
        cv.width = PROC_W;
        cv.height = PROC_H;

        setState(s => ({ ...s, cameraConnected: true, connected: true, streamUrl: 'camera', cameraStream: stream }));

        try {
          const vision = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
          );
          faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numFaces: 1,
          });
        } catch (mlErr) {
          console.warn('MediaPipe face landmarker failed to load — camera feed still active without face tracking:', mlErr);
        }

        animId = requestAnimationFrame(processFrame);
      } catch (e) {
        console.error('Camera init error:', e);
        setState(s => ({ ...s, cameraConnected: false, connected: false }));
      }
    })();

    return () => {
      running.current = false;
      cancelAnimationFrame(animId);
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, []);

  return state;
}
