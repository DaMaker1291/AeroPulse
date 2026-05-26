import { useState, useEffect, useRef, useCallback } from 'react';

export interface VexData {
  m3Torque: number;
  m3Pos: number;
  m3Current: number;
  m4Torque: number;
  m4Pos: number;
  m4Current: number;
}

export interface VexState {
  connected: boolean;
  portInfo: string;
  data: VexData | null;
  streaming: boolean;
}

const INITIAL: VexState = {
  connected: false,
  portInfo: '',
  data: null,
  streaming: false,
};

export function useVexSerial() {
  const [state, setState] = useState<VexState>(INITIAL);
  const portRef = useRef<SerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter | null>(null);
  const runningRef = useRef(true);
  const lineBufferRef = useRef('');

  const parseLine = useCallback((line: string): VexData | null => {
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
      m4Torque: data.M4_TORQUE ?? 0,
      m4Pos: data.M4_POS ?? 0,
      m4Current: data.M4_CURRENT ?? 0,
    };
  }, []);

  const disconnect = useCallback(async () => {
    runningRef.current = false;
    if (readerRef.current) {
      try { await readerRef.current.cancel(); } catch { /* ignore */ }
      readerRef.current = null;
    }
    if (writerRef.current) {
      try { await writerRef.current.close(); } catch { /* ignore */ }
      writerRef.current = null;
    }
    if (portRef.current) {
      try { await portRef.current.close(); } catch { /* ignore */ }
      portRef.current = null;
    }
    setState(INITIAL);
  }, []);

  const connect = useCallback(async () => {
    if (!navigator.serial) {
      console.error('Web Serial API not available (use Chrome/Edge with HTTPS or localhost)');
      return;
    }

    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' });
      portRef.current = port;

      const portInfo = port.getInfo?.() ?? {};
      const portLabel = portInfo.usbProductId
        ? `USB VID:${portInfo.usbVendorId} PID:${portInfo.usbProductId}`
        : `Serial Port`;

      setState(s => ({ ...s, connected: true, portInfo: portLabel, streaming: true }));

      // ── Set up reading with line splitting ─────────────────────────────
      const textDecoder = new TextDecoderStream();
      port.readable.pipeTo(textDecoder.writable).catch(() => {});
      const reader = textDecoder.readable.getReader();
      readerRef.current = reader;
      runningRef.current = true;

      // ── Set up writing ──────────────────────────────────────────────────
      const writer = port.writable.getWriter();
      writerRef.current = writer;

      // ── Read loop ──────────────────────────────────────────────────────
      let buf = '';
      while (runningRef.current) {
        try {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;

          buf += value;
          while (buf.includes('\n')) {
            const nlIdx = buf.indexOf('\n');
            const line = buf.slice(0, nlIdx).trim();
            buf = buf.slice(nlIdx + 1);

            if (line.length > 0) {
              const parsed = parseLine(line);
              if (parsed) {
                setState(s => ({ ...s, data: parsed }));
              }
            }
          }
        } catch (err) {
          if (runningRef.current) {
            console.error('Serial read error:', err);
          }
          break;
        }
      }
    } catch (err) {
      console.error('Serial connection error:', err);
      setState(s => ({ ...s, connected: false, portInfo: '', streaming: false }));
    }
  }, [parseLine]);

  const sendCommand = useCallback(async (cmd: string) => {
    if (!writerRef.current) return;
    try {
      await writerRef.current.write(cmd + '\n');
    } catch (err) {
      console.error('Serial write error:', err);
    }
  }, []);

  const pause = useCallback(() => {
    sendCommand('STOP');
    setState(s => ({ ...s, streaming: false }));
  }, [sendCommand]);

  const resume = useCallback(() => {
    sendCommand('START');
    setState(s => ({ ...s, streaming: true }));
  }, [sendCommand]);

  const calibrate = useCallback(() => {
    sendCommand('CALIBRATE');
  }, [sendCommand]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (readerRef.current) {
        readerRef.current.cancel().catch(() => {});
      }
      if (writerRef.current) {
        writerRef.current.close().catch(() => {});
      }
      if (portRef.current) {
        portRef.current.close().catch(() => {});
      }
    };
  }, []);

  return { state, connect, disconnect, pause, resume, calibrate, sendCommand };
}
