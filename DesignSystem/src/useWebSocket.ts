import { useEffect, useRef, useState, useCallback } from 'react';

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
};

export function useWebSocket(url = 'ws://localhost:8765') {
  const [state, setState] = useState<BackendState>(INITIAL);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const mounted = useRef(true);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    try {
      const ws = new WebSocket(url);
      ws.onopen = () => {
        setState(s => ({ ...s, connected: true }));
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setState(s => ({
            ...s,
            connected: true,
            targetStatus: data.faceTracked && data.targetStatus === 'locked'
              ? 'locked'
              : data.faceTracked
              ? 'acquiring'
              : 'standby',
            cameraConnected: data.cameraConnected ?? false,
            faceTracked: data.faceTracked ?? false,
            vitals: {
              heartRate: data.vitals?.heartRate ?? s.vitals.heartRate,
              respiration: data.vitals?.respiration ?? s.vitals.respiration,
              bloodOxygen: data.vitals?.bloodOxygen ?? s.vitals.bloodOxygen,
              temperature: data.vitals?.temperature ?? s.vitals.temperature,
            },
            rppgWave: data.rppg_wave ?? s.rppgWave,
            m3Wave: data.m3_wave ?? s.m3Wave,
            m4Wave: data.m4_wave ?? s.m4Wave,
            triage: {
              bilateralSymmetry: data.triage?.bilateralSymmetry ?? s.triage.bilateralSymmetry,
              neuromuscularLag: data.triage?.neuromuscularLag ?? s.triage.neuromuscularLag,
              vascularCompliance: data.triage?.vascularCompliance ?? s.triage.vascularCompliance,
              tremorPeakHz: data.triage?.tremorPeakHz ?? s.triage.tremorPeakHz,
            },
            fft: {
              freqs: data.fft?.freqs ?? s.fft.freqs,
              power: data.fft?.power ?? s.fft.power,
            },
          }));
        } catch { /* ignore parse errors */ }
      };
      ws.onclose = () => {
        setState(s => ({ ...s, connected: false }));
        if (mounted.current) {
          reconnectTimer.current = setTimeout(connect, 2000);
        }
      };
      ws.onerror = () => { ws.close(); };
      wsRef.current = ws;
    } catch { /* ignore connection errors */ }
  }, [url]);

  useEffect(() => {
    mounted.current = true;
    connect();
    return () => {
      mounted.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return state;
}
