import { useState, useEffect, useRef, useCallback } from 'react';

export interface VexData {
  m3Torque: number;
  m3Pos: number;
  m3Current: number;
  m3Force: number;
  m4Torque: number;
  m4Pos: number;
  m4Current: number;
  m4Force: number;
}

export interface VexDiagnosis {
  tensionTorqueL: number;
  tensionTorqueR: number;
  compressionTorqueL: number;
  compressionTorqueR: number;
}

export interface VexState {
  connected: boolean;
  portInfo: string;
  data: VexData | null;
  streaming: boolean;
  error: string | null;
  webSerialAvailable: boolean;
  diagnosis: VexDiagnosis | null;
  peakForceL: number;
  peakForceR: number;
  symmetryRatio: number;
  fatigueIndex: number;
}

const INITIAL: VexState = {
  connected: false,
  portInfo: '',
  data: null,
  streaming: false,
  error: null,
  webSerialAvailable: false,
  diagnosis: null,
  peakForceL: 0,
  peakForceR: 0,
  symmetryRatio: 0,
  fatigueIndex: 0,
};

export function useVexSerial() {
  const [state, setState] = useState<VexState>(() => ({
    ...INITIAL,
    webSerialAvailable: typeof navigator !== 'undefined' && 'serial' in navigator,
  }));
  const portRef = useRef<SerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter | null>(null);
  const runningRef = useRef(true);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const forceHistoryL = useRef<number[]>([]);
  const forceHistoryR = useRef<number[]>([]);

  const parseDataLine = useCallback((line: string): VexData | null => {
    const data: Record<string, number> = {};
    const pairs = line.split(',');
    for (const pair of pairs) {
      const idx = pair.indexOf(':');
      if (idx === -1) continue;
      const key = pair.slice(0, idx).trim();
      const val = parseFloat(pair.slice(idx + 1));
      if (!isNaN(val)) data[key] = val;
    }
    if (data.M3_TORQUE === undefined) return null;
    return {
      m3Torque: data.M3_TORQUE,
      m3Pos: data.M3_POS ?? 0,
      m3Current: data.M3_CURRENT ?? 0,
      m3Force: data.M3_FORCE ?? 0,
      m4Torque: data.M4_TORQUE ?? 0,
      m4Pos: data.M4_POS ?? 0,
      m4Current: data.M4_CURRENT ?? 0,
      m4Force: data.M4_FORCE ?? 0,
    };
  }, []);

  const parseDiagnosisLine = useCallback((line: string): Partial<VexDiagnosis> | null => {
    if (line.startsWith('TENSION:')) {
      const parts = line.slice(8).split(',');
      if (parts.length >= 2) return { tensionTorqueL: parseFloat(parts[0]), tensionTorqueR: parseFloat(parts[1]) };
    }
    if (line.startsWith('COMPRESSION:')) {
      const parts = line.slice(12).split(',');
      if (parts.length >= 2) return { compressionTorqueL: parseFloat(parts[0]), compressionTorqueR: parseFloat(parts[1]) };
    }
    return null;
  }, []);

  // Core serial read/write loop for a given port
  const startPortSession = useCallback(async (port: SerialPort) => {
    portRef.current = port;
    const portInfo = port.getInfo?.() ?? {};
    const portLabel = portInfo.usbProductId
      ? `USB VID:${portInfo.usbVendorId} PID:${portInfo.usbProductId}`
      : `Serial Port`;

    // Port opened but not yet confirmed — connected stays false until first valid data
    setState(s => ({ ...s, portInfo: portLabel, streaming: true, error: null }));

    const textDecoder = new TextDecoderStream();
    port.readable.pipeTo(textDecoder.writable).catch(() => {});
    const reader = textDecoder.readable.getReader();
    readerRef.current = reader;
    runningRef.current = true;

    const writer = port.writable.getWriter();
    writerRef.current = writer;

    let buf = '';
    let totalBytes = 0;
    let receivedData = false;
    let firstDataTimeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      setState(s => ({ ...s, error: `${portLabel} — no data received (${totalBytes} raw bytes). Is bridge firmware running?`, connected: false }));
    }, 8000);

    while (runningRef.current) {
      try {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;

        totalBytes += value.length;
        buf += value;
        while (buf.includes('\n')) {
          const nlIdx = buf.indexOf('\n');
          const line = buf.slice(0, nlIdx).trim();
          buf = buf.slice(nlIdx + 1);

          if (line.length === 0) continue;
          if (line.startsWith('ACK:')) continue;

          const diag = parseDiagnosisLine(line);
          if (diag) {
            setState(s => ({
              ...s,
              diagnosis: {
                tensionTorqueL: diag.tensionTorqueL ?? s.diagnosis?.tensionTorqueL ?? 0,
                tensionTorqueR: diag.tensionTorqueR ?? s.diagnosis?.tensionTorqueR ?? 0,
                compressionTorqueL: diag.compressionTorqueL ?? s.diagnosis?.compressionTorqueL ?? 0,
                compressionTorqueR: diag.compressionTorqueR ?? s.diagnosis?.compressionTorqueR ?? 0,
              },
            }));
            continue;
          }

          const parsed = parseDataLine(line);
          if (parsed) {
            if (firstDataTimeout) { clearTimeout(firstDataTimeout); firstDataTimeout = null; }
            if (!receivedData) {
              receivedData = true;
              setState(s => ({ ...s, connected: true, error: null }));
            }
            // Track force history for peak/symmetry/fatigue analysis
            const histL = forceHistoryL.current;
            const histR = forceHistoryR.current;
            histL.push(parsed.m3Force);
            histR.push(parsed.m4Force);
            if (histL.length > 300) histL.shift();
            if (histR.length > 300) histR.shift();
            const peakL = Math.max(...histL, parsed.m3Force);
            const peakR = Math.max(...histR, parsed.m4Force);
            const recentN = Math.min(60, histL.length, histR.length);
            let avgL = 0, avgR = 0;
            if (recentN > 0) {
              for (let i = histL.length - recentN; i < histL.length; i++) avgL += histL[i];
              for (let i = histR.length - recentN; i < histR.length; i++) avgR += histR[i];
              avgL /= recentN; avgR /= recentN;
            }
            const symRatio = avgL > 0 && avgR > 0 ? Math.min(avgL, avgR) / Math.max(avgL, avgR) : 0;
            // Fatigue: force trend over last 120 samples (~2.4s)
            let fatigueIdx = 0;
            if (histL.length >= 120) {
              const half = Math.floor(histL.length / 2);
              let firstHalf = 0, secondHalf = 0;
              for (let i = 0; i < half; i++) firstHalf += histL[i];
              for (let i = half; i < histL.length; i++) secondHalf += histL[i];
              const avgFirst = firstHalf / half;
              const avgSecond = secondHalf / (histL.length - half);
              fatigueIdx = avgFirst > 0 ? Math.max(0, Math.min(1, (avgFirst - avgSecond) / avgFirst)) : 0;
            }
            setState(s => ({
              ...s, data: parsed, error: null,
              peakForceL: Math.max(s.peakForceL, parsed.m3Force),
              peakForceR: Math.max(s.peakForceR, parsed.m4Force),
              symmetryRatio: Math.round(symRatio * 100),
              fatigueIndex: Math.round(fatigueIdx * 100),
            }));
          }
        }
      } catch (err) {
        if (runningRef.current) {
          setState(s => ({ ...s, error: `Serial read error: ${err instanceof Error ? err.message : String(err)}` }));
        }
        break;
      }
    }
    if (firstDataTimeout) clearTimeout(firstDataTimeout);
  }, [parseDataLine, parseDiagnosisLine]);

  const disconnect = useCallback(async () => {
    runningRef.current = false;
    if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
    if (readerRef.current) { try { await readerRef.current.cancel(); } catch {} readerRef.current = null; }
    if (writerRef.current) { try { await writerRef.current.close(); } catch {} writerRef.current = null; }
    if (portRef.current) { try { await portRef.current.close(); } catch {} portRef.current = null; }
    setState(s => ({ ...s, ...INITIAL, webSerialAvailable: s.webSerialAvailable }));
  }, []);

  // Manually connect (user clicks button → browser shows picker)
  const connect = useCallback(async () => {
    if (!navigator.serial) {
      setState(s => ({ ...s, error: 'Web Serial API not available. Use Chrome/Edge with HTTPS or localhost.' }));
      return;
    }
    setState(s => ({ ...s, error: null, diagnosis: null }));
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' });
      startPortSession(port);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('cancelled') || msg.includes('cancel')) {
        setState(s => ({ ...s, error: null }));
      } else {
        setState(s => ({ ...s, error: `Connection failed: ${msg}` }));
      }
      setState(s => ({ ...s, connected: false, portInfo: '', streaming: false }));
    }
  }, [startPortSession]);

  // Auto-connect on mount: reuses previously-authorized ports without picker
  const tryAutoConnect = useCallback(async () => {
    if (!navigator.serial) return;
    try {
      const ports = await navigator.serial.getPorts();
      if (ports.length > 0) {
        await ports[0].open({ baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' });
        startPortSession(ports[0]);
      }
    } catch {
      // No previously authorized ports — silent, user clicks Connect manually
    }
  }, [startPortSession]);

  // On mount, try auto-connect to remembered VEX port
  useEffect(() => {
    tryAutoConnect();
  }, [tryAutoConnect]);

  const encoder = new TextEncoder();

  const sendCommand = useCallback(async (cmd: string) => {
    if (!writerRef.current) return;
    try { await writerRef.current.write(encoder.encode(cmd + '\n')); } catch (err) {
      setState(s => ({ ...s, error: `Serial write error: ${err instanceof Error ? err.message : String(err)}` }));
    }
  }, []);

  const pause = useCallback(() => { sendCommand('STOP'); setState(s => ({ ...s, streaming: false })); }, [sendCommand]);
  const resume = useCallback(() => { sendCommand('START'); setState(s => ({ ...s, streaming: true })); }, [sendCommand]);
  const calibrate = useCallback(() => { sendCommand('CALIBRATE'); }, [sendCommand]);
  const setPosition = useCallback((deg: number) => { sendCommand(`SETPOS:${deg}`); }, [sendCommand]);
  const runDiagnose = useCallback(() => { setState(s => ({ ...s, diagnosis: null })); sendCommand('DIAGNOSE'); }, [sendCommand]);

  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
      if (readerRef.current) { readerRef.current.cancel().catch(() => {}); }
      if (writerRef.current) { writerRef.current.close().catch(() => {}); }
      if (portRef.current) { portRef.current.close().catch(() => {}); }
    };
  }, []);

  return { state, connect, disconnect, pause, resume, calibrate, setPosition, runDiagnose, sendCommand };
}
