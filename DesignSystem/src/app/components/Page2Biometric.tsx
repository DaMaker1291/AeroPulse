import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { motion } from 'motion/react';
import { Activity, Heart, Wind, Thermometer, Droplets } from 'lucide-react';

interface Page2Props {
  onScanComplete: () => void;
}

export function Page2Biometric({ onScanComplete }: Page2Props) {
  const [scanning, setScanning] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [scanMode, setScanMode] = useState<'compression' | 'tension'>('tension');
  const [waveData1, setWaveData1] = useState<Array<{ time: number; value: number }>>([]);
  const [waveData2, setWaveData2] = useState<Array<{ time: number; leftHand: number; rightHand: number }>>([]);
  const [vitals, setVitals] = useState({ heartRate: 74, respiration: 14, bloodOxygen: 98, temperature: 36.8 });

  useEffect(() => {
    const interval = setInterval(() => {
      setWaveData1(prev => {
        const next = [...prev];
        const t = prev.length;
        next.push({ time: t, value: 50 + 30 * Math.sin(t * 0.3) + Math.random() * 5 });
        if (next.length > 60) next.shift();
        return next;
      });
      setWaveData2(prev => {
        const next = [...prev];
        const t = prev.length;
        next.push({
          time: t,
          leftHand: 60 + 25 * Math.sin(t * 0.25) + Math.random() * 8,
          rightHand: 58 + 27 * Math.sin(t * 0.22 + 0.5) + Math.random() * 7,
        });
        if (next.length > 60) next.shift();
        return next;
      });
      if (Math.random() > 0.88) {
        setVitals(prev => ({
          heartRate: Math.max(60, Math.min(110, prev.heartRate + (Math.random() - 0.5) * 2)),
          respiration: Math.max(10, Math.min(22, prev.respiration + (Math.random() - 0.5) * 0.5)),
          bloodOxygen: Math.min(100, Math.max(95, prev.bloodOxygen + (Math.random() - 0.5) * 0.3)),
          temperature: Math.max(36, Math.min(37.5, prev.temperature + (Math.random() - 0.5) * 0.05)),
        }));
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

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

  const vitalCards = [
    { label: 'Heart Rate', value: Math.round(vitals.heartRate), unit: 'BPM', icon: Heart, color: '#FF453A', status: 'normal' },
    { label: 'Respiration', value: Math.round(vitals.respiration), unit: 'BR/MIN', icon: Wind, color: '#0A84FF', status: 'normal' },
    { label: 'Blood O₂', value: Math.round(vitals.bloodOxygen), unit: '% SpO2', icon: Droplets, color: '#30D158', status: vitals.bloodOxygen > 96 ? 'normal' : 'watch' },
    { label: 'Core Temp', value: vitals.temperature.toFixed(1), unit: '°C', icon: Thermometer, color: '#FF9F0A', status: 'normal' },
  ];

  return (
    <div className="flex flex-col gap-4 h-full">

      {/* Dual Oscilloscope Row */}
      <div className="bg-[#16161A] rounded-2xl border border-[#1E1E22] p-5 flex-shrink-0" style={{ height: '42%' }}>
        <div className="grid grid-cols-2 gap-4 h-full">

          {/* Subplot A: rPPG */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#30D158]" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
                <span className="text-[11px] font-semibold text-white">Optical rPPG Stream</span>
              </div>
              <span className="text-[10px] text-[#8E8E93] font-mono tracking-wide">rPPG · CAPILLARY PULSE WAVE</span>
            </div>
            <div className="flex-1 bg-[#0B0B0D] rounded-xl border border-[#1E1E22] p-3">
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
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#0A84FF]" />
                  <span className="text-[10px] text-[#8E8E93]">Left</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#BF5AF2]" />
                  <span className="text-[10px] text-[#8E8E93]">Right</span>
                </div>
              </div>
              <span className="text-[10px] text-[#8E8E93] font-mono tracking-wide">BIOMECHANICAL FORCE STREAM</span>
            </div>
            <div className="flex-1 bg-[#0B0B0D] rounded-xl border border-[#1E1E22] p-3">
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
      <div className="flex gap-4 flex-1 min-h-0">

        {/* Vitals Matrix */}
        <div className="flex-1 bg-[#16161A] rounded-2xl border border-[#1E1E22] p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-[#0A84FF]" />
            <span className="text-[13px] font-semibold text-white">Live Vitals Matrix</span>
            <div className="ml-auto flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#30D158]" style={{ animation: 'pulse 2s ease-in-out infinite' }} />
              <span className="text-[10px] text-[#8E8E93] tracking-widest">LIVE</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 flex-1">
            {vitalCards.map(card => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="bg-[#0B0B0D] rounded-xl border border-[#1E1E22] p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-[#8E8E93] tracking-widest uppercase font-medium">{card.label}</span>
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${card.color}15` }}>
                      <Icon className="w-3.5 h-3.5" style={{ color: card.color }} />
                    </div>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[36px] font-bold text-white leading-none font-mono">{card.value}</span>
                    <span className="text-[11px] text-[#8E8E93] font-medium mb-0.5">{card.unit}</span>
                  </div>
                  <div className="mt-2 h-1 bg-[#1E1E22] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{
                      backgroundColor: card.color,
                      width: card.label === 'Heart Rate' ? `${((Number(card.value) - 40) / 120) * 100}%` :
                             card.label === 'Blood O₂' ? `${Number(card.value)}%` : '65%',
                      opacity: 0.7,
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Scan Engine */}
        <div className="flex-1 bg-[#16161A] rounded-2xl border border-[#1E1E22] p-5 flex flex-col">
          <span className="text-[13px] font-semibold text-white mb-5">Load Resistance Engine</span>

          {/* Mode toggle */}
          <div className="mb-6">
            <label className="block text-[10px] text-[#8E8E93] tracking-widest uppercase font-medium mb-2.5">Test Protocol</label>
            <div className="flex gap-2 p-1 bg-[#0B0B0D] rounded-xl border border-[#1E1E22]">
              {(['tension', 'compression'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setScanMode(mode)}
                  className={`flex-1 py-2.5 rounded-lg text-[13px] font-semibold transition-all ${
                    scanMode === mode ? 'bg-[#0A84FF] text-white shadow-lg shadow-[#0A84FF]/10' : 'text-[#8E8E93] hover:text-white'
                  }`}
                >
                  {mode === 'tension' ? 'Tension (Pull)' : 'Compression'}
                </button>
              ))}
            </div>
          </div>

          {/* Scan button */}
          <div className="flex-1 flex items-center justify-center">
            <motion.button
              onClick={() => { setScanning(true); setCountdown(10); }}
              disabled={scanning}
              whileHover={{ scale: scanning ? 1 : 1.015 }}
              whileTap={{ scale: scanning ? 1 : 0.985 }}
              className={`relative w-full rounded-2xl overflow-hidden transition-all ${
                scanning ? 'cursor-not-allowed' : 'cursor-pointer'
              }`}
              style={{ height: '130px' }}
            >
              {scanning ? (
                <div className="absolute inset-0 bg-[#0A84FF]/10 border-2 border-[#0A84FF]/40 rounded-2xl flex flex-col items-center justify-center gap-2">
                  {/* Progress bar */}
                  <div className="absolute bottom-0 left-0 right-0 h-1">
                    <motion.div
                      initial={{ width: '0%' }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 10, ease: 'linear' }}
                      className="h-full bg-[#0A84FF]"
                    />
                  </div>
                  <span className="text-[48px] font-bold font-mono text-[#0A84FF] leading-none">{String(countdown).padStart(2, '0')}</span>
                  <span className="text-[12px] text-[#0A84FF]/70 tracking-widest uppercase font-semibold">Scanning in progress</span>
                </div>
              ) : (
                <div className="absolute inset-0 bg-[#0A84FF] rounded-2xl flex flex-col items-center justify-center gap-1.5 hover:bg-[#0A84FF]/90 transition-colors">
                  <span className="text-[15px] font-bold text-white tracking-tight">Execute 10-Second Compliance Scan</span>
                  <span className="text-[12px] text-white/60">{scanMode === 'tension' ? 'Tension protocol active' : 'Compression protocol active'}</span>
                </div>
              )}
            </motion.button>
          </div>

          {/* Protocol note */}
          <div className="mt-4 bg-[#0B0B0D] rounded-xl border border-[#1E1E22] px-4 py-3">
            <p className="text-[11px] text-[#8E8E93] leading-relaxed">
              Patient applies consistent force for full 10-second window. Both hands measured simultaneously. Results feed directly into the Predictive Triage engine.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
