import { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { motion } from 'motion/react';
import { Activity, Heart, Droplets, Gauge } from 'lucide-react';
import { useIsMobile } from './ui/use-mobile';

interface VitalsData {
  heartRate: number;
  respiration: number;
  bloodOxygen: number;
}

interface Page2Props {
  onScanComplete: () => void;
  backendVitals?: VitalsData;
  backendRppgWave?: number[];
  backendM3Wave?: number[];
  backendM4Wave?: number[];
  cameraConnected?: boolean;
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, v));
}

export function Page2Biometric({ onScanComplete, backendVitals, backendRppgWave, backendM3Wave, backendM4Wave, cameraConnected }: Page2Props) {
  const [scanning, setScanning] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [scanMode, setScanMode] = useState<'compression' | 'tension'>('tension');
  const [waveData1, setWaveData1] = useState<Array<{ time: number; value: number }>>([]);
  const [waveData2, setWaveData2] = useState<Array<{ time: number; leftHand: number; rightHand: number }>>([]);
  const [vitals, setVitals] = useState({ heartRate: 0, respiration: 0, bloodOxygen: 0 });
  const tickRef = useRef(0);

  // Stable rPPG waveform: append new point from backend, maintain fixed window
  useEffect(() => {
    if (backendRppgWave && backendRppgWave.length > 0) {
      const newVal = 50 + clamp(backendRppgWave[backendRppgWave.length - 1] * 15, -45, 45);
      tickRef.current += 1;
      setWaveData1(prev => {
        const next = [...prev, { time: tickRef.current, value: newVal }];
        if (next.length > 60) next.shift();
        return next;
      });
    }
  }, [backendRppgWave?.[backendRppgWave.length - 1]]);

  // Gentle placeholder wave when no real data — uses physiological-like multi-sine + noise
  useEffect(() => {
    if (!backendRppgWave || backendRppgWave.length === 0) {
      const interval = setInterval(() => {
        tickRef.current += 1;
        const t = tickRef.current;
        setWaveData1(prev => {
          const next = [...prev, { time: t, value: 50 + 8 * Math.sin(t * 0.12) + 3 * Math.sin(t * 0.07) + (Math.random() - 0.5) * 4 }];
          if (next.length > 60) next.shift();
          return next;
        });
      }, 100);
      return () => clearInterval(interval);
    }
  }, [backendRppgWave?.length ?? 0]);

  // Stable mechanical waveform
  useEffect(() => {
    if (backendM3Wave && backendM3Wave.length > 0 && backendM4Wave && backendM4Wave.length > 0) {
      const lh = clamp(50 + backendM3Wave[backendM3Wave.length - 1] * 2, 5, 95);
      const rh = clamp(50 + (backendM4Wave[backendM4Wave.length - 1] ?? 0) * 2, 5, 95);
      setWaveData2(prev => {
        const next = [...prev, { time: tickRef.current, leftHand: lh, rightHand: rh }];
        if (next.length > 60) next.shift();
        return next;
      });
    }
  }, [backendM3Wave?.[backendM3Wave.length - 1], backendM4Wave?.[backendM4Wave.length - 1]]);

  // Gentle placeholder mechanical wave when no real data
  useEffect(() => {
    if (!backendM3Wave || backendM3Wave.length === 0) {
      const interval = setInterval(() => {
        const t = tickRef.current;
        setWaveData2(prev => {
          const next = [...prev, {
            time: t,
            leftHand: 50 + 6 * Math.sin(t * 0.1) + 2 * Math.sin(t * 0.06) + (Math.random() - 0.5) * 3,
            rightHand: 50 + 7 * Math.sin(t * 0.09 + 0.4) + 2 * Math.sin(t * 0.05) + (Math.random() - 0.5) * 3,
          }];
          if (next.length > 60) next.shift();
          return next;
        });
      }, 100);
      return () => clearInterval(interval);
    }
  }, [!backendM3Wave?.length]);

  useEffect(() => {
    if (backendVitals && backendVitals.heartRate > 0) {
      setVitals(prev => ({
        heartRate: backendVitals.heartRate ?? prev.heartRate,
        respiration: backendVitals.respiration ?? prev.respiration,
        bloodOxygen: backendVitals.bloodOxygen ?? prev.bloodOxygen,
      }));
    }
  }, [backendVitals]);

  useEffect(() => {
    if (scanning && countdown > 0) {
      const t = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(t);
    } else if (scanning && countdown === 0) {
      setScanning(false);
      setCountdown(10);
      onScanComplete();
    }
  }, [scanning, countdown, onScanComplete]);

  const bpSystolic = vitals.heartRate > 0 ? Math.round(90 + vitals.heartRate * 0.35) : 0;
  const bpDiastolic = vitals.heartRate > 0 ? Math.round(60 + vitals.heartRate * 0.18) : 0;

  const vitalCards = [
    { label: 'Heart Rate', value: vitals.heartRate > 0 ? Math.round(vitals.heartRate) : null, unit: 'BPM', icon: Heart, color: '#FF453A' },
    { label: 'Blood Pressure', value: vitals.heartRate > 0 ? `${bpSystolic}/${bpDiastolic}` : null, unit: 'mmHg', icon: Gauge, color: '#0A84FF' },
    { label: 'Blood O₂', value: vitals.bloodOxygen > 0 ? Math.round(vitals.bloodOxygen) : null, unit: '% SpO2', icon: Droplets, color: '#30D158' },
  ];

  const isMobile = useIsMobile();

  return (
    <div className={`flex flex-col gap-3 sm:gap-4 ${isMobile ? 'pb-4' : 'min-h-0 flex-1'}`}>

      {/* Dual Oscilloscope Row */}
      <div className={`bg-[#16161A] rounded-2xl border border-[#1E1E22] p-3 sm:p-5 flex-shrink-0 overflow-hidden`} style={{ height: isMobile ? 220 : 260, minHeight: isMobile ? 180 : 220 }}>
        <div className={`grid ${isMobile ? 'grid-cols-1 gap-3' : 'grid-cols-2 gap-4'} h-full`}>

          {/* Subplot A: rPPG */}
          <div className="flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-[#30D158]" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
                <span className="text-[10px] sm:text-[11px] font-semibold text-white">Optical rPPG Stream</span>
              </div>
              <span className="text-[8px] sm:text-[10px] text-[#8E8E93] font-mono tracking-wide">rPPG · CAPILLARY PULSE WAVE</span>
            </div>
            <div className="flex-1 bg-[#0B0B0D] rounded-xl border border-[#1E1E22] p-2 sm:p-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={waveData1}>
                  <CartesianGrid strokeDasharray="2 6" stroke="#1E1E22" />
                  <XAxis dataKey="time" hide />
                  <YAxis hide domain={[0, 100]} />
                  <Line type="monotone" dataKey="value" stroke="#30D158" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Subplot B: Biomechanical Force */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="flex items-center gap-1 sm:gap-1.5">
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-[#0A84FF]" />
                  <span className="text-[9px] sm:text-[10px] text-[#8E8E93]">Left</span>
                </div>
                <div className="flex items-center gap-1 sm:gap-1.5">
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-[#BF5AF2]" />
                  <span className="text-[9px] sm:text-[10px] text-[#8E8E93]">Right</span>
                </div>
              </div>
              <span className="text-[8px] sm:text-[10px] text-[#8E8E93] font-mono tracking-wide">BIOMECHANICAL FORCE STREAM</span>
            </div>
            <div className="flex-1 bg-[#0B0B0D] rounded-xl border border-[#1E1E22] p-2 sm:p-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={waveData2}>
                  <CartesianGrid strokeDasharray="2 6" stroke="#1E1E22" />
                  <XAxis dataKey="time" hide />
                  <YAxis hide domain={[0, 100]} />
                  <Line type="monotone" dataKey="leftHand" stroke="#0A84FF" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="rightHand" stroke="#BF5AF2" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className={`${isMobile ? 'flex flex-col gap-3' : 'flex gap-4 flex-1 min-h-0'}`}>

        {/* Vitals Matrix */}
        <div className={`bg-[#16161A] rounded-2xl border border-[#1E1E22] p-3 sm:p-5 flex flex-col ${isMobile ? '' : 'flex-1'}`}>
          <div className="flex items-center gap-1.5 sm:gap-2 mb-3 sm:mb-4">
            <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#0A84FF]" />
            <span className="text-[12px] sm:text-[13px] font-semibold text-white">Vitals Matrix</span>
            <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
              <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-[#30D158]" style={{ animation: 'pulse 2s ease-in-out infinite' }} />
              <span className="text-[8px] sm:text-[10px] text-[#8E8E93] tracking-widest">LIVE</span>
            </div>
          </div>

          <div className={`grid ${isMobile ? 'grid-cols-2 gap-2' : 'grid-cols-2 gap-3 flex-1'}`}>
            {vitalCards.map(card => {
              const Icon = card.icon;
              const hasVal = card.value !== null;
              return (
                <div key={card.label} className="bg-[#0B0B0D] rounded-xl border border-[#1E1E22] p-3 sm:p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-1 sm:mb-2">
                    <span className="text-[8px] sm:text-[10px] text-[#8E8E93] tracking-widest uppercase font-medium">{card.label}</span>
                    <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${card.color}15` }}>
                      <Icon className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" style={{ color: card.color }} />
                    </div>
                  </div>
                  <div className="flex items-baseline gap-1 sm:gap-1.5">
                    {hasVal ? (
                      <>
                        <span className="text-[24px] sm:text-[36px] font-bold text-white leading-none font-mono">{card.value}</span>
                        <span className="text-[9px] sm:text-[11px] text-[#8E8E93] font-medium">{card.unit}</span>
                      </>
                    ) : (
                      <span className="text-[20px] sm:text-[28px] font-bold text-[#8E8E93]/40 leading-none font-mono">—</span>
                    )}
                  </div>
                  <div className="mt-1 sm:mt-2 h-0.5 sm:h-1 bg-[#1E1E22] rounded-full overflow-hidden">
                    {hasVal && (
                      <div className="h-full rounded-full" style={{
                        backgroundColor: card.color,
                        width: card.label === 'Heart Rate' ? `${((Number(card.value) - 40) / 120) * 100}%` : '65%',
                        opacity: 0.7,
                      }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Scan Engine */}
        <div className={`bg-[#16161A] rounded-2xl border border-[#1E1E22] p-3 sm:p-5 flex flex-col ${isMobile ? '' : 'flex-1'}`}>
          <span className="text-[12px] sm:text-[13px] font-semibold text-white mb-3 sm:mb-5">Load Resistance Engine</span>

          {/* Mode toggle */}
          <div className="mb-4 sm:mb-6">
            <label className="block text-[8px] sm:text-[10px] text-[#8E8E93] tracking-widest uppercase font-medium mb-1.5 sm:mb-2.5">Test Protocol</label>
            <div className="flex gap-1.5 sm:gap-2 p-1 bg-[#0B0B0D] rounded-xl border border-[#1E1E22]">
              {(['tension', 'compression'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setScanMode(mode)}
                  className={`flex-1 py-2 sm:py-2.5 rounded-lg text-[12px] sm:text-[13px] font-semibold transition-all ${
                    scanMode === mode ? 'bg-[#0A84FF] text-white shadow-lg shadow-[#0A84FF]/10' : 'text-[#8E8E93] hover:text-white'
                  }`}
                >
                  {mode === 'tension' ? 'Tension (Pull)' : 'Compression'}
                </button>
              ))}
            </div>
          </div>

          {/* Scan button */}
          <div className={`flex items-center justify-center ${isMobile ? '' : 'flex-1'}`}>
            <motion.button
              onClick={() => { setScanning(true); setCountdown(10); }}
              disabled={scanning}
              whileHover={{ scale: scanning ? 1 : 1.015 }}
              whileTap={{ scale: scanning ? 1 : 0.985 }}
              className={`relative w-full rounded-2xl overflow-hidden transition-all ${
                scanning ? 'cursor-not-allowed' : 'cursor-pointer'
              }`}
              style={{ height: isMobile ? 100 : 130 }}
            >
              {scanning ? (
                <div className="absolute inset-0 bg-[#0A84FF]/10 border-2 border-[#0A84FF]/40 rounded-2xl flex flex-col items-center justify-center gap-1 sm:gap-2">
                  <div className="absolute bottom-0 left-0 right-0 h-1">
                    <motion.div
                      initial={{ width: '0%' }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 10, ease: 'linear' }}
                      className="h-full bg-[#0A84FF]"
                    />
                  </div>
                  <span className="text-[36px] sm:text-[48px] font-bold font-mono text-[#0A84FF] leading-none">{String(countdown).padStart(2, '0')}</span>
                  <span className="text-[10px] sm:text-[12px] text-[#0A84FF]/70 tracking-widest uppercase font-semibold">Scanning in progress</span>
                </div>
              ) : (
                <div className="absolute inset-0 bg-[#0A84FF] rounded-2xl flex flex-col items-center justify-center gap-1 sm:gap-1.5 hover:bg-[#0A84FF]/90 transition-colors">
                  <span className="text-[13px] sm:text-[15px] font-bold text-white tracking-tight">Execute 10-Second Compliance Scan</span>
                  <span className="text-[10px] sm:text-[12px] text-white/60">{scanMode === 'tension' ? 'Tension protocol active' : 'Compression protocol active'}</span>
                </div>
              )}
            </motion.button>
          </div>

          {/* Protocol note */}
          <div className="mt-3 sm:mt-4 bg-[#0B0B0D] rounded-xl border border-[#1E1E22] px-3 sm:px-4 py-2 sm:py-3">
            <p className="text-[10px] sm:text-[11px] text-[#8E8E93] leading-relaxed">
              Patient applies consistent force for full 10-second window. Both hands measured simultaneously.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
