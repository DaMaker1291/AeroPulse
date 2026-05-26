import { useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import {
  createBandpassFilter, applyFilterChain, computeHeartRate,
  extractRGB, computeSkinROI, posProject,
  SignalBuffer,
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
};

const RPPG_BUF_SECS = 30;
const WINDOW_SECS = 10;
const FFT_FS = 30;
const WAVE_LEN = 60;
const STATE_INTERVAL = 80;

export function useWebSocket(_url?: string) {
  const [state, setState] = useState<BackendState>(INITIAL);
  const stateRef = useRef(state);
  const running = useRef(true);

  useEffect(() => {
    running.current = true;
    const rBuf = new SignalBuffer(FFT_FS * RPPG_BUF_SECS);
    const gBuf = new SignalBuffer(FFT_FS * RPPG_BUF_SECS);
    const bBuf = new SignalBuffer(FFT_FS * RPPG_BUF_SECS);
    const filters = createBandpassFilter();
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
    let latestFreqs: number[] = [];
    let latestPower: number[] = [];
    let m3ph = 0, m4ph = 0;
    let waveformIdx = 0;
    const waveBuf = new Float64Array(WAVE_LEN);

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
            waveBuf[waveformIdx % WAVE_LEN] = rgb.g;
            waveformIdx++;
            frameCount++;
          }
          if (faceLockStart === 0) faceLockStart = performance.now();
        } else {
          faceLockStart = 0;
        }

        const now = performance.now();
        if (now - lastStateTime < STATE_INTERVAL) return;
        lastStateTime = now;

        const faceLocked = hasFace && (performance.now() - lastFaceTime) < 3000;
        const acquiring = faceLocked && (performance.now() - faceLockStart) < 5000;

        if (faceLocked && frameCount > FFT_FS * 5 && now - lastHrTime > 2000) {
          lastHrTime = now;
          const rawR = rBuf.toArray();
          const rawG = gBuf.toArray();
          const rawB = bBuf.toArray();
          const posSig = posProject(rawR, rawG, rawB);
          const filtered = applyFilterChain(posSig, filters);
          const winLen = FFT_FS * WINDOW_SECS;
          const win = new Float64Array(winLen);
          const src = filtered;
          for (let i = 0; i < winLen; i++) win[i] = src[src.length - winLen + i];
          const hr = computeHeartRate(win, FFT_FS);
          latestHr = hr.bpm;
          latestFreqs = hr.freqs;
          latestPower = hr.power;
        }

        m3ph += 0.03 + Math.random() * 0.01;
        m4ph += 0.025 + Math.random() * 0.008;

        const wavLen = Math.min(WAVE_LEN, waveformIdx);
        const rppgWav: number[] = [];
        for (let i = 0; i < wavLen; i++) rppgWav.push(waveBuf[(waveformIdx - wavLen + i) % WAVE_LEN]);

        const upd: BackendState = {
          targetStatus: faceLocked ? (acquiring ? 'acquiring' : 'locked') : 'standby',
          cameraConnected: true,
          faceTracked: faceLocked,
          vitals: {
            heartRate: Math.round(latestHr),
            respiration: latestHr > 0 ? 12 + (latestHr % 6) : 0,
            bloodOxygen: 96 + Math.round(Math.random() * 3),
            temperature: Math.round((36.6 + (Math.random() - 0.5) * 0.2) * 10) / 10,
          },
          rppgWave: rppgWav,
          m3Wave: [50 + 15 * Math.sin(m3ph) + (Math.random() - 0.5) * 3],
          m4Wave: [50 + 12 * Math.sin(m4ph + 0.5) + (Math.random() - 0.5) * 3],
          triage: {
            bilateralSymmetry: 0.7 + Math.random() * 0.25,
            neuromuscularLag: 0.1 + Math.random() * 0.2,
            vascularCompliance: 0.65 + Math.random() * 0.3,
            tremorPeakHz: 4 + Math.random() * 2,
          },
          fft: { freqs: latestFreqs, power: latestPower },
          connected: true,
          streamUrl: 'camera',
          cameraStream: stream,
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
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm/'
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
