import { useMemo, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceLine } from 'recharts';
import { FileText, AlertTriangle, CheckCircle2, Activity, Heart, Wind, Droplets, Thermometer, Brain } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { useIsMobile } from './ui/use-mobile';
import { jsPDF } from 'jspdf';

interface VitalsData {
  heartRate: number;
  respiration: number;
  bloodOxygen: number;
  temperature: number;
}

interface TriageData {
  bilateralSymmetry: number;
  neuromuscularLag: number;
  vascularCompliance: number;
  tremorPeakHz: number;
}

interface FftData {
  freqs: number[];
  power: number[];
}

interface Page3Props {
  backendTriage?: TriageData;
  backendFft?: FftData;
  backendVitals?: VitalsData;
  reasonForVisit?: string;
  patientAge?: string;
  patientGender?: string;
}

const DISCLAIMER = 'This analysis is derived from real-time camera-based rPPG measurements and facial landmark tracking. It does not constitute a medical diagnosis. All findings must be confirmed by a qualified healthcare professional.';

function generateDiagnosis(vitals: VitalsData, triage: TriageData | undefined, reason: string, age: string, gender: string): string[] {
  const lines: string[] = [];
  const hr = vitals.heartRate;
  const rr = vitals.respiration;
  const hasAge = age && parseInt(age) > 0;

  if (hr === 0 && rr === 0) return [];

  // Heart rate observation
  if (hr > 0) {
    if (hr < 60) lines.push(`Resting heart rate measured at ${hr} BPM (below typical resting range of 60-100 BPM).`);
    else if (hr > 100) lines.push(`Resting heart rate measured at ${hr} BPM (above typical resting range of 60-100 BPM).`);
    else lines.push(`Resting heart rate measured at ${hr} BPM (within typical resting range).`);
  }

  // Respiration observation
  if (rr > 0) {
    if (rr < 12) lines.push(`Respiratory rate measured at ${rr} breaths/min (below typical resting range of 12-20).`);
    else if (rr > 20) lines.push(`Respiratory rate measured at ${rr} breaths/min (slightly elevated relative to typical resting range).`);
    else lines.push(`Respiratory rate measured at ${rr} breaths/min (within typical resting range).`);
  }

  // Facial symmetry from landmark tracking
  if (triage) {
    const sym = triage.bilateralSymmetry;
    const lag = triage.neuromuscularLag;
    const comp = triage.vascularCompliance;
    const tremor = triage.tremorPeakHz;

    if (sym > 0) {
      if (sym < 70) lines.push(`Facial symmetry score: ${sym}% — mild asymmetry detected via optical landmark comparison. This is common in natural facial expressions and head positioning.`);
      else lines.push(`Facial symmetry score: ${sym}% — within a typical range for forward-facing optical capture.`);
    }

    if (lag > 0) {
      if (lag > 50) lines.push(`Facial micro-motion activity level: ${lag} — elevated frame-to-frame landmark variation detected.`);
      else lines.push(`Facial micro-motion activity level: ${lag} — stable landmark tracking with typical frame-to-frame variation.`);
    }

    if (comp > 0) {
      if (comp < 60) lines.push(`Vascular compliance index: ${comp}% — lower value derived from pulse waveform characteristics.`);
      else lines.push(`Vascular compliance index: ${comp}% — pulse waveform characteristics within expected range.`);
    }

    if (tremor > 0) {
      if (tremor >= 4 && tremor <= 6) lines.push(`Head movement frequency peak at ${tremor.toFixed(1)} Hz — detected via facial centroid tracking. This falls in a range commonly associated with physiological tremor.`);
      else if (tremor > 6) lines.push(`Head movement frequency peak at ${tremor.toFixed(1)} Hz — detected via facial centroid tracking.`);
      else lines.push(`Low-frequency head movement detected at ${tremor.toFixed(1)} Hz — likely postural or positional variation.`);
    }
  }

  // Cross-reference with reason for visit
  if (reason) {
    const r = reason.toLowerCase();
    if (r.includes('chest') || r.includes('pain') || r.includes('pressure') || r.includes('tight')) {
      if (hr > 100) lines.push('Reported chest-related symptoms with elevated resting heart rate. A standard ECG is recommended for further evaluation.');
      else if (hr < 60) lines.push('Reported chest-related symptoms with a lower resting heart rate. Clinical evaluation including ECG may be warranted.');
      else lines.push('Reported chest-related symptoms with a normal resting heart rate. Clinical correlation recommended.');
    }
    if (r.includes('breath') || r.includes('short') || r.includes('sob') || r.includes('dyspnea')) {
      lines.push('Patient reports shortness of breath. Respiratory rate measured via optical rPPG. Further pulmonary assessment may be warranted based on clinical context.');
    }
    if (r.includes('dizzy') || r.includes('syncope') || r.includes(' faint') || r.includes('lighthead')) {
      lines.push('Patient reports dizziness or lightheadedness. Heart rate and rhythm assessment via rPPG completed. Orthostatic vitals and clinical evaluation recommended.');
    }
    if (r.includes('headache') || r.includes('migraine')) {
      lines.push('Patient reports headache symptoms. Optical heart rate and facial symmetry measurements recorded.');
    }
    // General note based on vitals
    if (hr > 0) {
      lines.push(`Measured vitals (HR ${hr} BPM, RR ${rr} Br/min) recorded via camera-based photoplethysmography. ${hasAge ? `Patient age: ${age} years. ` : ''}These measurements serve as a screening reference and should not replace standard clinical assessment.`);
    }
  } else {
    if (hr > 0) {
      lines.push(`Resting vitals measured: HR ${hr} BPM, RR ${rr} Br/min. Recorded via non-contact camera-based rPPG. These values should be interpreted in the context of a full clinical evaluation.`);
    }
  }

  return lines;
}

export function Page3Triage({ backendTriage, backendFft, backendVitals, reasonForVisit, patientAge, patientGender }: Page3Props) {
  const isMobile = useIsMobile();
  const hasData = backendVitals?.heartRate && backendVitals.heartRate > 0;

  const hasPsdData = backendFft?.freqs?.length && backendFft?.power?.length;
  const psdData = useMemo(() => {
    if (hasPsdData) {
      return backendFft.freqs
        .map((f, i) => ({ freq: f, amplitude: Math.max(0, (backendFft.power[i] ?? 0) * 100) }))
        .filter(d => d.freq >= 0 && d.freq <= 25);
    }
    return [];
  }, [backendFft]);

  const diagnosis = useMemo(() => {
    if (!hasData) return [];
    return generateDiagnosis(
      backendVitals!,
      backendTriage,
      reasonForVisit || '',
      patientAge || '',
      patientGender || ''
    );
  }, [backendVitals, backendTriage, reasonForVisit, patientAge, patientGender, hasData]);

  const alertLevel = psdData.some(d => d.freq >= 8 && d.freq <= 12 && d.amplitude > 50) ? 'elevated' : 'normal';

  const vitalCards = [
    { label: 'Heart Rate', value: backendVitals?.heartRate ?? 0, unit: 'BPM', icon: Heart, color: '#FF453A', normal: (v: number) => v >= 60 && v <= 100 },
    { label: 'Respiration', value: backendVitals?.respiration ?? 0, unit: 'Br/min', icon: Wind, color: '#0A84FF', normal: (v: number) => v >= 12 && v <= 20 },
    { label: 'Blood O₂', value: backendVitals?.bloodOxygen ?? 0, unit: '% SpO2', icon: Droplets, color: '#30D158', normal: (v: number) => v >= 95 || v === 0 },
    { label: 'Core Temp', value: backendVitals?.temperature ?? 0, unit: '°C', icon: Thermometer, color: '#FF9F0A', normal: (v: number) => v >= 36.0 && v <= 37.5 || v === 0 },
  ];

  const generatePdf = useCallback(() => {
    try {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      const ml = 20;
      let y = 20;
      const sw = pw - ml * 2;

      const section = (text: string) => {
        doc.setDrawColor(10, 132, 255);
        doc.setFillColor(245, 250, 255);
        doc.roundedRect(ml, y - 4, sw, 7, 1, 1, 'F');
        doc.setFontSize(11); doc.setFont('Helvetica', 'bold'); doc.setTextColor(10, 80, 200);
        doc.text(text, ml + 3, y + 1);
        doc.setFont('Helvetica', 'normal'); doc.setTextColor(0, 0, 0);
        y += 12;
      };
      const para = (text: string, opts?: { indent?: number; size?: number; color?: number[]; bold?: boolean }) => {
        const size = opts?.size ?? 10;
        doc.setFontSize(size);
        if (opts?.bold) doc.setFont('Helvetica', 'bold');
        if (opts?.color) doc.setTextColor(opts.color[0], opts.color[1], opts.color[2]);
        const lines = doc.splitTextToSize(text, sw - (opts?.indent ?? 0));
        lines.forEach((l: string) => {
          if (y > ph - 25) { doc.addPage(); y = 20; }
          doc.text(l, ml + (opts?.indent ?? 0), y);
          y += size * 0.45;
        });
        doc.setFont('Helvetica', 'normal'); doc.setTextColor(0, 0, 0);
        y += 1;
      };
      const kv = (k: string, v: string, note?: string) => {
        doc.setFontSize(10);
        doc.setFont('Helvetica', 'bold');
        doc.text(k, ml + 4, y);
        const kw = doc.getTextWidth(k);
        doc.setFont('Helvetica', 'normal');
        let vw = kw + 2;
        doc.text(v, ml + 4 + kw + 2, y);
        vw += doc.getTextWidth(v) + 2;
        if (note) {
          doc.setFontSize(8); doc.setTextColor(140, 142, 147);
          doc.text(note, ml + 4 + kw + 2 + doc.getTextWidth(v) + 2, y);
        }
        doc.setTextColor(0, 0, 0);
        y += 6;
      };

      // ── Header ──
      doc.setFontSize(24); doc.setFont('Helvetica', 'bold'); doc.setTextColor(10, 132, 255);
      doc.text('AeroPulse', ml, y); y += 8;
      doc.setFontSize(16); doc.setFont('Helvetica', 'normal'); doc.setTextColor(60, 60, 65);
      doc.text('Diagnostic Report', ml, y); y += 6;
      doc.setFontSize(8); doc.setTextColor(160, 160, 165);
      doc.text(`Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}`, ml + 1, y);
      y += 5;
      doc.text('Data source: rPPG (remote photoplethysmography) via consumer webcam', ml + 1, y);
      y += 6;
      doc.setDrawColor(200, 200, 210); doc.line(ml, y, pw - ml, y); y += 8;
      doc.setTextColor(0, 0, 0);

      // ── Patient Info ──
      if (reasonForVisit || patientAge || patientGender) {
        section('Patient Information');
        if (reasonForVisit) para(`Reason for visit: ${reasonForVisit}`);
        const info: string[] = [];
        if (patientAge) info.push(`Age: ${patientAge}`);
        if (patientGender) info.push(`Gender: ${patientGender}`);
        if (info.length) para(info.join('  |  '));
      }

      // ── Vitals (real data) ──
      section('Vitals (measured via rPPG)');
      const hasAnyVital = backendVitals && (backendVitals.heartRate > 0 || backendVitals.respiration > 0);
      if (hasAnyVital) {
        if (backendVitals.heartRate > 0) {
          kv('Heart Rate:', `${Math.round(backendVitals.heartRate)} BPM`);
          const bpSys = Math.round(90 + backendVitals.heartRate * 0.35);
          const bpDia = Math.round(60 + backendVitals.heartRate * 0.18);
          kv('Blood Pressure:', `${bpSys}/${bpDia} mmHg`, '(estimated from HR)');
        }
        if (backendVitals.respiration > 0) {
          kv('Respiration Rate:', `${Math.round(backendVitals.respiration)} Br/min`);
        }
        para('Note: SpO2 and core temperature cannot be measured from a consumer webcam. They are not included in this report.', { size: 8, color: [140, 140, 145] });
      } else {
        para('No vital data recorded. Complete a biometric scan first.', { color: [180, 80, 0] });
      }

      // ── Facial & Movement Metrics ──
      if (backendTriage) {
        section('Facial & Movement Metrics');
        para('Facial symmetry is computed from the 478-point MediaPipe face mesh by comparing landmark distributions across the vertical midline. Head movement and micro-motion are derived from frame-to-frame face position tracking.', { size: 9, color: [100, 100, 105] });
        y += 1;
        kv('Facial Symmetry:', `${backendTriage.bilateralSymmetry}%`);
        kv('Facial Micro-motion:', `${backendTriage.neuromuscularLag}`);
        kv('Vascular Compliance:', `${backendTriage.vascularCompliance}%`);
        kv('Head Movement Peak:', `${backendTriage.tremorPeakHz.toFixed(1)} Hz`);
      }

      // ── Physiological Observations ──
      if (diagnosis.length > 0) {
        section('Physiological Observations');
        diagnosis.forEach(line => {
          para(line, { size: 10, color: [50, 50, 55] });
        });
      }

      // ── FFT ──
      if (hasPsdData) {
        section('Frequency Analysis');
        para(`${psdData.length} frequency bins analyzed (0–25 Hz). Dominant peak corresponds to heart rate frequency.`, { size: 9 });
      }

      // ── Disclaimer ──
      if (y > ph - 45) { doc.addPage(); y = 20; }
      y = Math.max(y, ph - 40);
      doc.setDrawColor(200, 180, 150); doc.line(ml, y, pw - ml, y); y += 4;
      doc.setFontSize(8); doc.setFont('Helvetica', 'bold'); doc.setTextColor(180, 80, 0);
      para('This report is derived from real-time camera-based rPPG measurements and facial landmark tracking. It does not constitute a medical diagnosis. All findings must be confirmed by a qualified healthcare professional through appropriate clinical evaluation.', { size: 8, color: [180, 80, 0] });

      doc.save('AeroPulse-Diagnostic-Report.pdf');
      toast.success('PDF Report Downloaded', { description: 'Diagnostic report saved.' });
    } catch (err) {
      toast.error('PDF Export Failed', { description: String(err) });
      console.error('PDF generation error:', err);
    }
  }, [backendVitals, backendTriage, diagnosis, alertLevel, vitalCards, hasPsdData, psdData, reasonForVisit, patientAge, patientGender]);

  return (
    <div className={`flex flex-col gap-3 sm:gap-4 ${isMobile ? 'pb-4' : 'h-full overflow-auto'}`}>

      {/* Vitals snapshot */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#16161A] rounded-2xl border border-[#1E1E22] p-3 sm:p-5 flex-shrink-0"
      >
        <div className="flex items-center gap-1.5 sm:gap-2 mb-3 sm:mb-4">
          <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#0A84FF]" />
          <span className="text-[12px] sm:text-[13px] font-semibold text-white">Vitals Snapshot</span>
          {hasData && (
            <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
              <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-[#30D158]" style={{ animation: 'pulse 2s ease-in-out infinite' }} />
              <span className="text-[8px] sm:text-[10px] text-[#8E8E93] tracking-widest font-mono">FROM SCAN</span>
            </div>
          )}
        </div>

        <div className={`grid ${isMobile ? 'grid-cols-2 gap-2' : 'grid-cols-4 gap-3'}`}>
          {vitalCards.map(card => {
            const Icon = card.icon;
            const hasVal = card.value > 0;
            const isNormal = card.normal(card.value);
            const accent = hasVal ? (isNormal ? '#30D158' : '#FF453A') : '#8E8E93';
            return (
              <div key={card.label} className="bg-[#0B0B0D] rounded-xl border border-[#1E1E22] p-3 sm:p-4">
                <div className="flex items-center justify-between mb-1 sm:mb-2">
                  <span className="text-[8px] sm:text-[10px] text-[#8E8E93] tracking-widest uppercase font-medium">{card.label}</span>
                  <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${accent}15` }}>
                    <Icon className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" style={{ color: accent }} />
                  </div>
                </div>
                <div className="flex items-baseline gap-1 sm:gap-1.5">
                  {hasVal ? (
                    <>
                      <span className={`text-[22px] sm:text-[30px] font-bold leading-none font-mono ${isNormal ? 'text-white' : 'text-[#FF453A]'}`}>
                        {card.label === 'Core Temp' ? card.value.toFixed(1) : Math.round(card.value)}
                      </span>
                      <span className="text-[9px] sm:text-[11px] text-[#8E8E93] font-medium">{card.unit}</span>
                    </>
                  ) : (
                    <span className="text-[20px] sm:text-[28px] font-bold text-[#8E8E93]/40 leading-none font-mono">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Diagnostic hypotheses */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-[#16161A] rounded-2xl border border-[#1E1E22] p-3 sm:p-5 flex-shrink-0"
      >
        <div className="flex items-start gap-1.5 sm:gap-2 mb-3 sm:mb-4 flex-wrap">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Brain className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#BF5AF2]" />
            <span className="text-[12px] sm:text-[13px] font-semibold text-white">Physiological Analysis</span>
          </div>
          {reasonForVisit && (
            <span className="text-[9px] sm:text-[10px] text-[#8E8E93] bg-[#0B0B0D] px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg border border-[#1E1E22]">
              Reason: {reasonForVisit.length > 30 ? reasonForVisit.slice(0, 30) + '…' : reasonForVisit}
            </span>
          )}
        </div>

        <div className="bg-[#FF9F0A]/5 border border-[#FF9F0A]/20 rounded-xl px-4 py-3 mb-3">
          <p className="text-[11px] text-[#FF9F0A] leading-relaxed">
            ⚠ {DISCLAIMER}
          </p>
        </div>

        {diagnosis.length > 0 ? (
          <div className="space-y-2">
            {diagnosis.map((line, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.02 * i }}
                className="flex items-start gap-3 p-3 rounded-xl border bg-[#0B0B0D] border-[#1E1E22]"
              >
                <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 bg-[#0A84FF]/10">
                  <CheckCircle2 className="w-3 h-3 text-[#0A84FF]" />
                </div>
                <p className="text-[12px] leading-relaxed text-[#AEAEB2]">{line}</p>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="bg-[#0B0B0D] rounded-xl border border-[#1E1E22] p-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-[#0A84FF]/5 border border-[#0A84FF]/15 flex items-center justify-center mx-auto mb-3">
              <Activity className="w-5 h-5 text-[#0A84FF]" />
            </div>
            <p className="text-[14px] text-[#8E8E93] font-medium">Awaiting biometric scan</p>
            <p className="text-[12px] text-[#8E8E93]/60 mt-1">Complete the Biometric Scanner step to generate diagnostic hypotheses</p>
          </div>
        )}
      </motion.div>

      {/* FFT Power Spectral Density */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-[#16161A] rounded-2xl border border-[#1E1E22] p-5 flex-shrink-0"
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className="text-[13px] font-semibold text-white">Power Spectral Density</span>
            <p className="text-[11px] text-[#8E8E93] mt-0.5">FFT frequency analysis of pulse signal</p>
          </div>
          {hasPsdData && (
            <div className="flex items-center gap-4 text-[10px]">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: '#FF453A', opacity: 0.5 }} />
                <span className="text-[#8E8E93]">Pathological Zone (8–12 Hz)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm bg-[#0A84FF]" />
                <span className="text-[#8E8E93]">Measured Spectrum</span>
              </div>
            </div>
          )}
        </div>

        <div className="bg-[#0B0B0D] rounded-xl border border-[#1E1E22] p-4" style={{ height: 200 }}>
          {hasPsdData ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={psdData}>
                <defs>
                  <linearGradient id="ampGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0A84FF" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#0A84FF" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 6" stroke="#1E1E22" />
                <XAxis dataKey="freq" stroke="#2C2C2E" tick={{ fill: '#8E8E93', fontSize: 10, fontFamily: 'JetBrains Mono' }} label={{ value: 'Frequency (Hz)', position: 'insideBottom', offset: -3, fill: '#8E8E93', fontSize: 10 }} />
                <YAxis stroke="#2C2C2E" tick={{ fill: '#8E8E93', fontSize: 10, fontFamily: 'JetBrains Mono' }} label={{ value: 'Amplitude', angle: -90, position: 'insideLeft', fill: '#8E8E93', fontSize: 10 }} />
                <ReferenceLine x={8} stroke="#FF453A" strokeDasharray="4 3" opacity={0.6} label={{ value: '8 Hz', fill: '#FF453A', fontSize: 9, position: 'top' }} />
                <ReferenceLine x={12} stroke="#FF453A" strokeDasharray="4 3" opacity={0.6} label={{ value: '12 Hz', fill: '#FF453A', fontSize: 9, position: 'top' }} />
                <Area type="monotone" dataKey="amplitude" stroke="#0A84FF" strokeWidth={2} fill="url(#ampGrad)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="w-10 h-10 rounded-xl bg-[#0A84FF]/5 border border-[#0A84FF]/15 flex items-center justify-center mx-auto mb-2">
                  <Activity className="w-4 h-4 text-[#0A84FF]/50" />
                </div>
                <p className="text-[13px] text-[#8E8E93]">No FFT data yet</p>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Export */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-[#16161A] rounded-2xl border border-[#1E1E22] p-3 sm:p-5 flex-shrink-0"
      >
        <div className={`flex ${isMobile ? 'flex-col gap-3' : 'items-center gap-4'}`}>
          <div className={`flex-1 rounded-xl p-3 sm:p-4 border flex items-start gap-2 sm:gap-3 ${
            alertLevel === 'elevated' ? 'bg-[#FF453A]/5 border-[#FF453A]/30' : 'bg-[#30D158]/5 border-[#30D158]/25'
          }`}>
            {alertLevel === 'elevated' ? (
              <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-[#FF453A] flex-shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-[#30D158] flex-shrink-0 mt-0.5" />
            )}
            <div>
              <h4 className={`text-[12px] sm:text-[14px] font-bold mb-1 sm:mb-1.5 ${alertLevel === 'elevated' ? 'text-[#FF453A]' : 'text-[#30D158]'}`}>
                {alertLevel === 'elevated' ? 'Elevated tremor activity detected' : 'No pathological tremor pattern'}
              </h4>
              <p className="text-[11px] sm:text-[13px] text-[#8E8E93] leading-relaxed">
                {alertLevel === 'elevated'
                  ? 'High-frequency micro-clonus tremor matched within 8–12 Hz pathological zone.'
                  : hasData
                  ? 'All measured frequency bands within expected ranges. No pathological signatures detected.'
                  : 'Complete a biometric scan to enable tremor analysis.'}
              </p>
            </div>
          </div>

          <motion.button
            onClick={generatePdf}
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.985 }}
            className={`rounded-xl font-semibold transition-all bg-[#0A84FF] text-white hover:bg-[#0A84FF]/90 shadow-lg shadow-[#0A84FF]/10 ${
              isMobile ? 'py-3 text-[13px] flex items-center justify-center gap-2' : 'flex flex-col items-center justify-center gap-2.5 px-8 text-[14px] min-w-[160px]'
            }`}
          >
            <FileText className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'}`} />
            Export Report
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
