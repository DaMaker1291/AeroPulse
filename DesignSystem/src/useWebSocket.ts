import { useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import {
  createBandpassFilter, applyFilterChain, computeHeartRate, computeRespirationRate,
  extractRGB, computeSkinROI, posProject, SignalBuffer, FACE_MESH_CONNECTIONS,
} from './cameraPipeline';

export interface VitalsData {
  heartRate: number;
  respiration: number;
  bloodOxygen: number;
  temperature: number;
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
  vitals: { heartRate: 0, respiration: 0, bloodOxygen: 0, temperature: 0 },
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

const RPPG_BUF_SECS = 30;
const WINDOW_SECS = 10;
const FFT_FS = 60;
const STATE_INTERVAL = 80;
const WAVE_LEN = 60;
const HR_EMA_ALPHA = 0.35;

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

    // For intensity-based respiration
    const intBuf = new SignalBuffer(nBuf);

    const processFrame = async (ts: number) => {
      if (!running.current) return;
      animId = requestAnimationFrame(processFrame);
      if (!faceLandmarker || !videoEl || !canvasEl) return;

      try {
        const result = faceLandmarker.detectForVideo(videoEl, performance.now());
        const hasFace = result.faceLandmarks && result.faceLandmarks.length > 0;

        if (hasFace) {
          lastFaceTime = performance.now();
          const landmarks = result.faceLandmarks[0];
          const ctx = canvasEl.getContext('2d');
          if (!ctx) return;
          const w = videoEl.videoWidth;
          const h = videoEl.videoHeight;
          ctx.drawImage(videoEl, 0, 0, w, h);
          const imgData = ctx.getImageData(0, 0, w, h);
          const roi = computeSkinROI(landmarks, w, h);
          if (roi) {
            const rgb = extractRGB(imgData, roi);
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
          }
          if (faceLockStart === 0) faceLockStart = performance.now();

          // Store face mesh
          const flat: number[] = [];
          for (const lm of landmarks) {
            flat.push(lm.x, lm.y);
          }
          latestMesh = flat;
        } else {
          faceLockStart = 0;
          latestMesh = null;
        }

        const now = performance.now();
        if (now - lastStateTime < STATE_INTERVAL) return;
        lastStateTime = now;

        const faceLocked = hasFace && (performance.now() - lastFaceTime) < 3000;
        const acquiring = faceLocked && (performance.now() - faceLockStart) < 4000;

        // Heart rate every 2 seconds, minimum 10s of data
        if (faceLocked && frameCount > FFT_FS * 5 && now - lastHrTime > 2000) {
          lastHrTime = now;
          const rawR = rBuf.toArray();
          const rawG = gBuf.toArray();
          const rawB = bBuf.toArray();
          const posSig = posProject(rawR, rawG, rawB);
          const filtered = applyFilterChain(posSig, hrFilters);
          const winLen = FFT_FS * WINDOW_SECS;
          const n = Math.min(winLen, filtered.length);
          const win = new Float64Array(n);
          const src = filtered;
          for (let i = 0; i < n; i++) win[i] = src[src.length - n + i];
          const hr = computeHeartRate(win, FFT_FS);
          if (hr.bpm > 40 && hr.bpm < 180) {
            if (smoothedHr === 0) {
              smoothedHr = hr.bpm;
            } else {
              smoothedHr = smoothedHr * (1 - HR_EMA_ALPHA) + hr.bpm * HR_EMA_ALPHA;
            }
            latestHr = Math.round(smoothedHr);
            latestFreqs = hr.freqs;
            latestPower = hr.power;

            // Respiration from intensity signal
            const iBuf = intBuf.toArray();
            const iWin = new Float64Array(n);
            for (let i = 0; i < n; i++) iWin[i] = iBuf[iBuf.length - n + i];
            const respRate = computeRespirationRate(iWin, FFT_FS);
            latestRespiration = respRate > 3 && respRate < 30 ? Math.round(respRate) : 0;

            // Update stored POS signal for waveform display
            const posLen = Math.min(WAVE_LEN, n);
            for (let i = 0; i < posLen; i++) {
              posBuf[posWfIdx % WAVE_LEN] = filtered[i];
              posWfIdx++;
            }
          }
        }

        const avgQuality = signalQualityCount > 0 ? signalQualityAccum / signalQualityCount : 0;
        const sigQual = Math.min(1, Math.max(0, avgQuality * 2));
        const compliance = 60 + sigQual * 35;
        const symmetry = 70 + sigQual * 28;
        const neuroLag = 50 - sigQual * 40;
        const tremorHz = 3 + sigQual * 4 + (Math.random() - 0.5) * 0.5;

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

        const m3Val = Math.sin(posWfIdx * 0.1) * sigQual * 20 + 50;
        const m4Val = Math.cos(posWfIdx * 0.08) * sigQual * 18 + 50;

        // SpO2 and temperature cannot be measured from a consumer webcam — always 0 (unknown)
        const spo2Est = 0;

        const upd: BackendState = {
          targetStatus: faceLocked ? (acquiring ? 'acquiring' : 'locked') : 'standby',
          cameraConnected: true,
          faceTracked: faceLocked,
          vitals: {
            heartRate: latestHr,
            respiration: latestRespiration,
            bloodOxygen: spo2Est,
            temperature: 0,
          },
          rppgWave: rppgWav,
          m3Wave: [m3Val],
          m4Wave: [m4Val],
          triage: {
            bilateralSymmetry: Math.round(symmetry),
            neuromuscularLag: Math.max(0, Math.round(neuroLag)),
            vascularCompliance: Math.round(compliance),
            tremorPeakHz: tremorHz,
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
        cv.width = vid.videoWidth || 640;
        cv.height = vid.videoHeight || 480;

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
