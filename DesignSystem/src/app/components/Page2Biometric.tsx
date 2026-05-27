import { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { Activity, Heart, Droplets, Gauge } from 'lucide-react';
import { useIsMobile } from './ui/use-mobile';

interface VitalsData {
  heartRate: number;
  respiration: number;
  bloodOxygen: number;
  hrvSdnn?: number;
  hrvRmssd?: number;
  snr?: number;
  signalQuality?: number;
  pulseWidthMs?: number;
  augIndex?: number;
  headStability?: number;
  blinkRate?: number;
}

interface Page2Props {
  backendVitals?: VitalsData;
  backendRppgWave?: number[];
  backendM3Wave?: number[];
  backendM4Wave?: number[];
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, v));
}

export function Page2Biometric({ backendVitals, backendRppgWave, backendM3Wave, backendM4Wave }: Page2Props) {
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

  // No placeholder — only show real data from camera rPPG pipeline

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

  // VEX motor wave data comes from serial port (useVexSerial), not generated here

  useEffect(() => {
    if (backendVitals && backendVitals.heartRate > 0) {
      setVitals(prev => ({
        heartRate: backendVitals.heartRate ?? prev.heartRate,
        respiration: backendVitals.respiration ?? prev.respiration,
        bloodOxygen: backendVitals.bloodOxygen ?? prev.bloodOxygen,
      }));
    }
  }, [backendVitals]);

  const v = vitals as any;
  const vitalCards = [
    { label: 'Heart Rate', value: vitals.heartRate > 0 ? Math.round(vitals.heartRate) : null, unit: 'BPM', icon: Heart, color: '#FF453A' },
    { label: 'Respiration', value: vitals.respiration > 0 ? Math.round(vitals.respiration) : null, unit: 'Br/min', icon: Gauge, color: '#0A84FF' },
    { label: 'Blood O₂', value: vitals.bloodOxygen > 0 ? Math.round(vitals.bloodOxygen) : null, unit: '% SpO2', icon: Droplets, color: '#30D158' },
    { label: 'HRV (SDNN)', value: v.hrvSdnn > 0 ? v.hrvSdnn : null, unit: 'ms', icon: Activity, color: '#BF5AF2' },
    { label: 'Pulse Width', value: v.pulseWidthMs > 0 ? v.pulseWidthMs : null, unit: 'ms', icon: Activity, color: '#30D158' },
    { label: 'Aug. Index', value: v.augIndex > 0 ? v.augIndex : null, unit: '%', icon: Activity, color: '#FF9F0A' },
    { label: 'Blink Rate', value: v.blinkRate > 0 ? v.blinkRate : null, unit: '/min', icon: Activity, color: '#0A84FF' },
    { label: 'Head Stability', value: v.headStability > 0 ? `${v.headStability}%` : null, unit: '', icon: Activity, color: '#30D158' },
    { label: 'Signal SNR', value: v.snr > 0 ? v.snr.toFixed(1) : null, unit: 'ratio', icon: Activity, color: '#FF9F0A' },
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

        <div className={`grid ${isMobile ? 'grid-cols-2 gap-2' : 'grid-cols-3 gap-3 flex-1'}`}>
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
    </div>
  );
}
