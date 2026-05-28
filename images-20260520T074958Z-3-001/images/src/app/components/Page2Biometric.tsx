import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { motion } from 'motion/react';

interface Page2Props {
  onScanComplete: () => void;
  vitals: {
    heartRate: number;
    respiration: number;
    bloodOxygen: number;
    compliance: number;
  };
  waveData1: Array<{ time: number; value: number }>;
  waveData2: Array<{ time: number; leftHand: number; rightHand: number }>;
  scanMode: 'compression' | 'tension';
  scanning: boolean;
  countdown: number;
  sendWs: (cmd: string, data?: any) => void;
  faceTracked: boolean;
  signalQuality: number;
  hrvMetrics: { rmssd: number; sdnn: number; pnsIndex: number };
  sessionElapsed: number;
}

export function Page2Biometric({
  onScanComplete,
  vitals,
  waveData1,
  waveData2,
  scanMode,
  scanning,
  countdown,
  sendWs,
  faceTracked,
  signalQuality,
  hrvMetrics,
  sessionElapsed
}: Page2Props) {
  const [prevScanning, setPrevScanning] = useState(false);

  // Auto transition when the 10-second endurance scan completes on python
  useEffect(() => {
    if (prevScanning && !scanning) {
      onScanComplete();
    }
    setPrevScanning(scanning);
  }, [scanning, prevScanning, onScanComplete]);

  const handleExecuteScan = () => {
    sendWs("EXECUTE_SCAN");
  };

  const handleToggleMode = (mode: 'compression' | 'tension') => {
    sendWs("SET_MODE", { mode });
  };

  return (
    <div className="flex flex-col gap-5 h-full">
      {/* Top: Session Info Bar */}
      <div className="flex items-center justify-between bg-[#16161A] rounded-xl px-6 py-2 border border-[#2C2C2E]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${faceTracked ? 'bg-[#30D158] animate-pulse' : 'bg-[#FF9F0A]'}`}></div>
            <span className="text-[11px] text-[#8E8E93] tracking-wider uppercase">
              {faceTracked ? 'Face Locked' : 'No Face'}
            </span>
          </div>
          <div className="h-4 w-px bg-[#2C2C2E]"></div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#8E8E93] tracking-wider uppercase">Session</span>
            <span className="text-[14px] text-white font-mono">
              {sessionElapsed > 0
                ? `${Math.floor(sessionElapsed / 60)}:${(sessionElapsed % 60).toFixed(0).padStart(2, '0')}`
                : '0:00'}
            </span>
          </div>
          <div className="h-4 w-px bg-[#2C2C2E]"></div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#8E8E93] tracking-wider uppercase">Signal</span>
            <div className="w-24 h-2 bg-[#0B0B0D] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  signalQuality > 0.4 ? 'bg-[#30D158]' : signalQuality > 0.2 ? 'bg-[#FF9F0A]' : 'bg-[#FF453A]'
                }`}
                style={{ width: `${Math.min(100, signalQuality * 100)}%` }}
              />
            </div>
            <span className={`text-[11px] ${
              signalQuality > 0.4 ? 'text-[#30D158]' : signalQuality > 0.2 ? 'text-[#FF9F0A]' : 'text-[#FF453A]'
            }`}>
              {(signalQuality * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      {/* Top: Dual Oscilloscope Waveforms */}
      <div className="h-96 bg-[#16161A] rounded-xl p-6 border border-[#2C2C2E]">
        <div className="grid grid-cols-2 gap-6 h-full">
          {/* Subplot A: Optical rPPG Stream */}
          <div className="flex flex-col">
            <div className="mb-2">
              <span className="text-[11px] text-[#8E8E93] tracking-wider uppercase">Optical Stream</span>
              <span className="text-[11px] text-[#30D158] ml-2">● rPPG Capillary Pulse Wave</span>
            </div>
            <div className="flex-1 bg-[#0B0B0D] rounded-lg p-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={waveData1}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2C2C2E" opacity={0.3} />
                  <XAxis dataKey="time" hide />
                  <YAxis hide domain={[0, 100]} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#30D158"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Subplot B: Biomechanical Force Stream */}
          <div className="flex flex-col">
            <div className="mb-2">
              <span className="text-[11px] text-[#8E8E93] tracking-wider uppercase">Biomechanical Stream</span>
              <span className="text-[11px] text-[#0A84FF] ml-2">● Left</span>
              <span className="text-[11px] text-[#BF5AF2] ml-2">● Right</span>
            </div>
            <div className="flex-1 bg-[#0B0B0D] rounded-lg p-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={waveData2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2C2C2E" opacity={0.3} />
                  <XAxis dataKey="time" hide />
                  <YAxis hide domain={[0, 100]} />
                  <Line
                    type="monotone"
                    dataKey="leftHand"
                    stroke="#0A84FF"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="rightHand"
                    stroke="#BF5AF2"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="flex gap-5 flex-1">
        {/* Left: Live Vitals Matrix + HRV */}
        <div className="flex-1 bg-[#16161A] rounded-xl p-6 border border-[#2C2C2E] flex flex-col">
          <h3 className="text-[14px] text-[#8E8E93] tracking-wider uppercase mb-4">Live Vitals Matrix</h3>
          <div className="grid grid-cols-2 gap-4 h-[calc(100%-2rem)]">
            {/* Heart Rate */}
            <div className="bg-[#0B0B0D] rounded-lg p-4 flex flex-col justify-between border border-[#2C2C2E]">
              <span className="text-[11px] text-[#8E8E93] tracking-wider uppercase">Heart Rate</span>
              <div className="flex items-baseline">
                <span className="text-5xl font-medium text-white">{faceTracked && vitals.heartRate > 0 ? Math.round(vitals.heartRate) : '--'}</span>
                <span className="text-[11px] text-[#8E8E93] ml-2 mb-2">BPM</span>
              </div>
            </div>

            {/* Respiration */}
            <div className="bg-[#0B0B0D] rounded-lg p-4 flex flex-col justify-between border border-[#2C2C2E]">
              <span className="text-[11px] text-[#8E8E93] tracking-wider uppercase">Respiration</span>
              <div className="flex items-baseline">
                <span className="text-5xl font-medium text-white">{faceTracked && vitals.respiration > 0 ? Math.round(vitals.respiration) : '--'}</span>
                <span className="text-[11px] text-[#8E8E93] ml-2 mb-2">BR/MIN</span>
              </div>
            </div>

            {/* Blood Oxygen */}
            <div className="bg-[#0B0B0D] rounded-lg p-4 flex flex-col justify-between border border-[#2C2C2E]">
              <span className="text-[11px] text-[#8E8E93] tracking-wider uppercase">Blood Oxygen</span>
              <div className="flex items-baseline">
                <span className="text-5xl font-medium text-white">{faceTracked && vitals.bloodOxygen > 0 ? Math.round(vitals.bloodOxygen) : '--'}</span>
                <span className="text-[11px] text-[#8E8E93] ml-2 mb-2">% SpO2</span>
              </div>
            </div>

          </div>

          {/* HRV Metrics Row */}
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div className="bg-[#0B0B0D] rounded-lg px-3 py-2 border border-[#2C2C2E]">
              <span className="text-[10px] text-[#8E8E93] tracking-wider uppercase">RMSSD</span>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-medium text-white">{faceTracked && hrvMetrics.rmssd > 0 ? hrvMetrics.rmssd.toFixed(1) : '--'}</span>
                <span className="text-[10px] text-[#8E8E93]">ms</span>
              </div>
            </div>
            <div className="bg-[#0B0B0D] rounded-lg px-3 py-2 border border-[#2C2C2E]">
              <span className="text-[10px] text-[#8E8E93] tracking-wider uppercase">SDNN</span>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-medium text-white">{faceTracked && hrvMetrics.sdnn > 0 ? hrvMetrics.sdnn.toFixed(1) : '--'}</span>
                <span className="text-[10px] text-[#8E8E93]">ms</span>
              </div>
            </div>
            <div className="bg-[#0B0B0D] rounded-lg px-3 py-2 border border-[#2C2C2E]">
              <span className="text-[10px] text-[#8E8E93] tracking-wider uppercase">PNS Index</span>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-medium text-white">{faceTracked && hrvMetrics.pnsIndex > 0 ? hrvMetrics.pnsIndex.toFixed(2) : '--'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Load Resistance Controller */}
        <div className="flex-1 bg-[#16161A] rounded-xl p-6 border border-[#2C2C2E] flex flex-col">
          <h3 className="text-[14px] text-[#8E8E93] tracking-wider uppercase mb-6">Load Resistance Engine</h3>

          {/* Mode Toggle */}
          <div className="mb-8">
            <label className="block text-[11px] text-[#8E8E93] tracking-wider mb-3 uppercase">Test Mode</label>
            <div className="flex gap-2">
              <button
                onClick={() => handleToggleMode('compression')}
                className={`flex-1 py-3 rounded-lg text-[14px] font-medium transition-all ${scanMode === 'compression'
                  ? 'bg-[#0A84FF] text-white'
                  : 'bg-[#0B0B0D] text-[#8E8E93] border border-[#2C2C2E]'
                  }`}
              >
                Compression (Squeeze)
              </button>
              <button
                onClick={() => handleToggleMode('tension')}
                className={`flex-1 py-3 rounded-lg text-[14px] font-medium transition-all ${scanMode === 'tension'
                  ? 'bg-[#0A84FF] text-white'
                  : 'bg-[#0B0B0D] text-[#8E8E93] border border-[#2C2C2E]'
                  }`}
              >
                Tension (Pull Across)
              </button>
            </div>
          </div>

          {/* Execute Button */}
          <div className="flex-1 flex items-center justify-center">
            <motion.button
              onClick={handleExecuteScan}
              disabled={scanning}
              whileHover={{ scale: scanning ? 1 : 1.02 }}
              whileTap={{ scale: scanning ? 1 : 0.98 }}
              className={`relative w-full h-32 rounded-xl text-[18px] font-medium transition-all ${scanning
                ? 'bg-[#0A84FF]/30 text-[#0A84FF] border-2 border-[#0A84FF] cursor-not-allowed'
                : 'bg-[#0A84FF] text-white hover:bg-[#0A84FF]/90 border-2 border-transparent'
                }`}
            >
              {scanning ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="text-3xl font-bold">{countdown}</div>
                  <div className="text-[14px]">SCANNING IN PROGRESS...</div>
                  <div className="w-48 h-1 bg-[#0B0B0D] rounded-full overflow-hidden mt-2">
                    <motion.div
                      initial={{ width: '0%' }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 10, ease: 'linear' }}
                      className="h-full bg-[#0A84FF]"
                    />
                  </div>
                </div>
              ) : (
                'EXECUTE 10-SECOND COMPLIANCE SCAN'
              )}
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}
