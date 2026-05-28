import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Activity, Scan, Brain, Building2 } from 'lucide-react';
import { Toaster } from 'sonner';
import { Page1AdaptiveIntake } from './components/Page1AdaptiveIntake';
import { Page2Biometric } from './components/Page2Biometric';
import { Page3Triage } from './components/Page3Triage';
import { Page4Enterprise } from './components/Page4Enterprise';

type PageKey = 'intake' | 'biometric' | 'triage' | 'enterprise';

export default function App() {
  const [currentPage, setCurrentPage] = useState<PageKey>('intake');
  const [unlockedPages, setUnlockedPages] = useState<Set<PageKey>>(new Set(['intake']));

  // High-fidelity Backend State Channels
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [targetStatus, setTargetStatus] = useState<'standby' | 'acquiring' | 'locked'>('standby');
  const [aiConfidence, setAiConfidence] = useState<number>(0.74);
  const [faceTracked, setFaceTracked] = useState(false);
  const [signalQuality, setSignalQuality] = useState(0);
  const [hrvMetrics, setHrvMetrics] = useState({ rmssd: 0, sdnn: 0, pnsIndex: 0 });
  const [sessionElapsed, setSessionElapsed] = useState(0);
  const [vitalsTrend, setVitalsTrend] = useState<{ heartRate: number[]; spo2: number[]; respiration: number[] }>({ heartRate: [], spo2: [], respiration: [] });
  const [vitals, setVitals] = useState({
    heartRate: 0,
    respiration: 0,
    bloodOxygen: 0,
    compliance: 0,
  });
  const [metrics, setMetrics] = useState({
    bilateralSymmetry: 94,
    neuromuscularLag: 42,
    vascularCompliance: 'MODERATE STIFFENING',
  });
  const [waveData1, setWaveData1] = useState<Array<{ time: number; value: number }>>([]);
  const [waveData2, setWaveData2] = useState<Array<{ time: number; leftHand: number; rightHand: number }>>([]);
  const [psdData, setPsdData] = useState<Array<{ freq: number; amplitude: number }>>([]);
  const [scanMode, setScanMode] = useState<'compression' | 'tension'>('tension');
  const [scanning, setScanning] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [enduranceSummary, setEnduranceSummary] = useState('Awaiting endurance test.');
  const [ws, setWs] = useState<WebSocket | null>(null);

  // Command transmitter helper
  const sendWs = (cmd: string, data: any = {}) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ cmd, ...data }));
    }
  };

  const handleUnlockNavigation = () => {
    setUnlockedPages(new Set(['intake', 'biometric', 'triage', 'enterprise']));
  };

  const handleScanComplete = () => {
    setCurrentPage('triage');
  };

  // Auto-Reconnecting WebSocket Channel
  useEffect(() => {
    let socket: WebSocket;
    let reconnectTimer: any;

    function connect() {
      console.log("Connecting to AeroPulse WebSocket Backend (localhost:8765)...");
      socket = new WebSocket("ws://localhost:8765");

      socket.onopen = () => {
        console.log("AeroPulse Medical telemetry socket active.");
        setUnlockedPages(prev => new Set([...prev, 'biometric', 'triage', 'enterprise']));
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.frame) {
            setVideoSrc(data.frame);
          }
          if (data.targetStatus) {
            setTargetStatus(data.targetStatus);
          }
          if (data.aiConfidence !== undefined) {
            setAiConfidence(data.aiConfidence);
          }
          if (data.faceTracked !== undefined) {
            setFaceTracked(data.faceTracked);
          }
          if (data.signalQuality !== undefined) {
            setSignalQuality(data.signalQuality);
          }
          if (data.sessionElapsed !== undefined) {
            setSessionElapsed(data.sessionElapsed);
          }
          if (data.vitalsTrend) {
            setVitalsTrend(data.vitalsTrend);
          }
          if (data.hrv) {
            setHrvMetrics(data.hrv);
          }
          if (data.vitals) {
            setVitals(prev => {
              if (!data.faceTracked) {
                return { heartRate: 0, respiration: 0, bloodOxygen: 0, compliance: 0 };
              }
              return { ...prev, ...data.vitals };
            });
          }
          if (data.metrics) {
            setMetrics({
              bilateralSymmetry: data.metrics.bilateralSymmetry,
              neuromuscularLag: data.metrics.neuromuscularLag,
              vascularCompliance: data.metrics.vascularComplianceText,
            });
          }
          if (data.enduranceActive !== undefined) {
            setScanning(data.enduranceActive);
          }
          if (data.countdown !== undefined) {
            setCountdown(data.countdown);
          }
          if (data.enduranceSummary !== undefined) {
            setEnduranceSummary(data.enduranceSummary);
          }
          if (data.mode) {
            setScanMode(data.mode);
          }

          // Optical rPPG curves
          if (data.rppg_wave) {
            setWaveData1(data.rppg_wave.map((val: number, idx: number) => ({ time: idx, value: val })));
          }

          // Biomechanical force waveforms (Left Motor 3 vs Right Motor 4)
          if (data.m3_wave && data.m4_wave) {
            const waves = [];
            const len = Math.max(data.m3_wave.length, data.m4_wave.length);
            for (let i = 0; i < len; i++) {
              waves.push({
                time: i,
                leftHand: data.m3_wave[i] || 0.0,
                rightHand: data.m4_wave[i] || 0.0,
              });
            }
            setWaveData2(waves);
          }

          // Neuromuscular frequency density spectral map (PSD)
          if (data.psd) {
            setPsdData(data.psd.map((val: any) => ({ freq: val.freq, amplitude: val.amplitude })));
          }
        } catch (e) {
          console.error("Malformed WS frame error: ", e);
        }
      };

      socket.onclose = () => {
        console.warn("Medical socket channel blunted. Retrying telemetry handshake in 2s...");
        reconnectTimer = setTimeout(connect, 2000);
      };

      socket.onerror = (err) => {
        socket.close();
      };

      setWs(socket);
    }

    connect();

    return () => {
      if (socket) socket.close();
      clearTimeout(reconnectTimer);
    };
  }, []);

  const pages = [
    {
      key: 'intake' as PageKey,
      name: 'Adaptive Intake',
      icon: Activity,
      component: Page1AdaptiveIntake
    },
    {
      key: 'biometric' as PageKey,
      name: 'Biometric Scanner',
      icon: Scan,
      component: Page2Biometric
    },
    {
      key: 'triage' as PageKey,
      name: 'Predictive Triage',
      icon: Brain,
      component: Page3Triage
    },
    {
      key: 'enterprise' as PageKey,
      name: 'Enterprise Fleet',
      icon: Building2,
      component: Page4Enterprise
    }
  ];

  return (
    <div className="w-screen h-screen bg-[#0B0B0D] flex flex-col overflow-hidden">
      <Toaster position="top-right" theme="dark" />

      {/* Top Status Bar */}
      <div className="h-14 bg-[#0B0B0D] border-b border-[#2C2C2E] flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#0A84FF] animate-pulse"></div>
          <h1 className="text-xl font-medium text-white tracking-tight">AeroPulse AI</h1>
          <span className="text-[11px] text-[#8E8E93] tracking-wider">
            — Secure Enterprise Node: <span className="text-[#0A84FF]">#0A84FF</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#30D158]"></div>
          <span className="text-[11px] text-[#8E8E93] tracking-wider uppercase">System Online</span>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Navigation */}
        <div className="w-60 bg-[#0B0B0D] border-r border-[#2C2C2E] p-4 flex flex-col">
          {/* Logo Section */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-6 h-6 text-[#0A84FF]" />
              <span className="text-xl font-medium text-white">AeroPulse</span>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <div className="flex gap-1">
                <div className="w-1 h-4 bg-[#30D158] rounded-full animate-pulse"></div>
                <div className="w-1 h-4 bg-[#30D158] rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-1 h-4 bg-[#30D158] rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
              </div>
              <span className="text-[11px] text-[#8E8E93]">Operational Signal Pulse</span>
            </div>
          </div>

          {/* Navigation Cards */}
          <nav className="flex-1 space-y-2">
            {pages.map((page) => {
              const isActive = currentPage === page.key;
              const isLocked = !unlockedPages.has(page.key);
              const Icon = page.icon;

              return (
                <motion.button
                  key={page.key}
                  onClick={() => !isLocked && setCurrentPage(page.key)}
                  disabled={isLocked}
                  whileHover={!isLocked ? { backgroundColor: '#16161A' } : {}}
                  transition={{ duration: 0.15, ease: 'easeInOut' }}
                  className={`w-full h-14 rounded-xl flex items-center gap-3 px-4 transition-all ${isActive
                    ? 'bg-[#0A84FF] text-white'
                    : isLocked
                      ? 'bg-transparent text-[#8E8E93]/40 cursor-not-allowed'
                      : 'bg-transparent text-[#8E8E93] hover:text-white'
                    }`}
                >
                  <Icon className="w-5 h-5" />
                  <div className="flex-1 text-left">
                    <div className="text-[14px] font-medium">{page.name}</div>
                    {isLocked && (
                      <div className="text-[10px] opacity-60">Locked</div>
                    )}
                  </div>
                  {isActive && (
                    <div className="w-2 h-2 rounded-full bg-white"></div>
                  )}
                </motion.button>
              );
            })}
          </nav>

          {/* System Info */}
          <div className="mt-auto pt-4 border-t border-[#2C2C2E]">
            <div className="text-[11px] text-[#8E8E93] space-y-1">
              <div>Version 2.4.1</div>
              <div>Node ID: APS-WS8765</div>
            </div>
          </div>
        </div>

        {/* Central Viewport */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 p-6 overflow-auto min-h-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentPage}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="h-full min-h-0"
              >
                {currentPage === 'intake' && (
                  <Page1AdaptiveIntake
                    onUnlockNavigation={handleUnlockNavigation}
                    videoSrc={videoSrc}
                    targetStatus={targetStatus}
                    aiConfidence={aiConfidence}
                    sendWs={sendWs}
                  />
                )}
                {currentPage === 'biometric' && (
                  <Page2Biometric
                    onScanComplete={handleScanComplete}
                    vitals={vitals}
                    waveData1={waveData1}
                    waveData2={waveData2}
                    scanMode={scanMode}
                    scanning={scanning}
                    countdown={countdown}
                    sendWs={sendWs}
                    faceTracked={faceTracked}
                    signalQuality={signalQuality}
                    hrvMetrics={hrvMetrics}
                    sessionElapsed={sessionElapsed}
                  />
                )}
                {currentPage === 'triage' && (
                  <Page3Triage
                    metrics={metrics}
                    psdData={psdData}
                    enduranceSummary={enduranceSummary}
                    sendWs={sendWs}
                    vitalsTrend={vitalsTrend}
                  />
                )}
                {currentPage === 'enterprise' && <Page4Enterprise />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Bottom Telemetry HUD */}
      <div className="h-10 bg-[#0B0B0D] border-t border-[#2C2C2E] flex items-center justify-between px-6 text-[11px]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#30D158] animate-pulse"></div>
          <span className="text-[#8E8E93] tracking-wider uppercase">System:</span>
          <span className="text-[#30D158]">USB COMPORT ACTIVE (115200 BAUD)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[#8E8E93] tracking-wider uppercase">AI Pipeline Running:</span>
          <span className="text-[#0A84FF]">60 FPS | 50 Hz</span>
        </div>
      </div>
    </div>
  );
}
