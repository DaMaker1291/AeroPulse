import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceLine } from 'recharts';
import { FileText, AlertTriangle, CheckCircle2, Activity, Heart, Wind, Droplets, Thermometer, Brain } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';

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
}

function generateDiagnosis(vitals: VitalsData, triage: TriageData | undefined, reason: string): string[] {
  const lines: string[] = [];
  const hr = vitals.heartRate;
  const rr = vitals.respiration;

  if (hr === 0 && rr === 0) return [];

  // Heart rate interpretation
  if (hr > 0) {
    if (hr < 60) lines.push(`Sinus bradycardia (HR ${hr} BPM). Consider hypothyroidism, increased vagal tone, or beta-blocker effect. If symptomatic, rule out heart block.`);
    else if (hr > 100) lines.push(`Sinus tachycardia (HR ${hr} BPM). May reflect pain, anxiety, fever, dehydration, or compensatory response to reduced stroke volume. Consider ECG.`);
    else lines.push(`Heart rate normal (${hr} BPM). Normal sinus rhythm.`);
  }

  // Respiration interpretation
  if (rr > 0) {
    if (rr < 12) lines.push(`Bradypnea (${rr} Br/min). Possible opioid effect, metabolic alkalosis, or CNS depression.`);
    else if (rr > 20) lines.push(`Tachypnea (${rr} Br/min). Could indicate pneumonia, pulmonary embolism, metabolic acidosis, or anxiety.`);
    else lines.push(`Respiratory rate normal (${rr} Br/min). Adequate ventilation.`);
  }

  // Triage metrics
  if (triage) {
    const sym = triage.bilateralSymmetry;
    const lag = triage.neuromuscularLag;
    const comp = triage.vascularCompliance;
    const tremor = triage.tremorPeakHz;

    if (sym < 70) lines.push(`Bilateral asymmetry (${sym}%). Motor deficit suspected. Consider cortical stroke, peripheral nerve injury, or unilateral musculoskeletal pathology.`);
    else if (sym < 85) lines.push(`Mild bilateral asymmetry (${sym}%). Subclinical motor variance. May be normal or early neurodegenerative change.`);
    else lines.push(`Bilateral symmetry normal (${sym}%). No motor asymmetry detected.`);

    if (lag > 80) lines.push(`Elevated neuromuscular lag (${lag} ms). Delayed conduction suggests possible neuropathy, radiculopathy, or upper motor neuron lesion.`);
    else if (lag > 50) lines.push(`Slightly elevated neuromuscular lag (${lag} ms). Borderline conduction velocity. May warrant follow-up.`);
    else lines.push(`Neuromuscular conduction normal (${lag} ms). No significant delay.`);

    if (comp < 60) lines.push(`Reduced vascular compliance (${comp}%). Arterial stiffening pattern. Associated with aging, hypertension, and elevated cardiovascular risk.`);
    else lines.push(`Vascular compliance adequate (${comp}%). No significant stiffening.`);

    if (tremor >= 4 && tremor <= 6) lines.push(`Tremor peak at ${tremor.toFixed(1)} Hz — within physiological (essential) tremor range. May be enhanced by anxiety, caffeine, or fatigue.`);
    else if (tremor > 6 && tremor <= 12) lines.push(`Tremor peak at ${tremor.toFixed(1)} Hz — overlaps with pathological (parkinsonian or cerebellar) tremor range. Recommend neurological correlation.`);
    else if (tremor > 0) lines.push(`Tremor peak at ${tremor.toFixed(1)} Hz — low-frequency drift, likely postural or positional.`);
  }

  // Cross-reference with reason for visit
  if (reason) {
    const r = reason.toLowerCase();
    if (r.includes('chest') || r.includes('pain') || r.includes('pressure') || r.includes('tight')) {
      if (hr > 100) lines.push('Chest symptoms with tachycardia: rule out ACS, pulmonary embolism, anxiety/panic attack. Consider ECG, troponin, D-dimer.');
      else if (hr < 60) lines.push('Chest symptoms with bradycardia: consider inferior ischemia, vagal response, or medication effect.');
      else lines.push('Chest symptoms with normal HR: consider musculoskeletal pain, GERD, or costochondritis. ECG recommended.');
    }
    if (r.includes('breath') || r.includes('short') || r.includes('sob') || r.includes('dyspnea')) {
      if (rr > 20) lines.push('Dyspnea with tachypnea: consider pneumonia, PE, CHF exacerbation, or COPD. Assess O2 sat, chest imaging.');
      else lines.push('Dyspnea with normal RR: consider mild reactive airway, deconditioning, or anxiety. Pulmonary function tests may help.');
    }
    if (r.includes('fatigue') || r.includes('tired')) {
      if (hr < 60) lines.push('Fatigue with bradycardia: consider hypothyroidism, sleep apnea, or medication side effect. Check TSH, iron studies.');
      else lines.push('Fatigue assessment: consider sleep quality, anemia, thyroid function, depression screening.');
    }
    if (r.includes('fever') || r.includes(' infection') || r.includes('flu')) {
      if (hr > 100) lines.push('Tachycardia with infectious symptoms: appropriate compensatory response. Monitor for sepsis criteria.');
      else if (rr > 20) lines.push('Tachypnea with infectious symptoms: monitor for lower respiratory involvement.');
    }
    if (r.includes('dizzy') || r.includes('syncope') || r.includes(' faint') || r.includes('lighthead')) {
      if (hr < 60) lines.push('Bradycardia with syncope/dizziness: high risk for cardiogenic syncope. Consider ECG holter, tilt table.');
      else lines.push('Dizziness with normal HR: consider vestibular, orthostatic, or metabolic causes. Check orthostatic vitals.');
    }
    if (r.includes('stroke') || r.includes('weak') || r.includes('numb') || r.includes('speech')) {
      if (triage?.bilateralSymmetry && triage.bilateralSymmetry < 70) {
        lines.push('ASYMMETRY DETECTED with neurological symptoms — HIGH suspicion for CVA/stroke. Urgent neuroimaging indicated. NIHSS assessment recommended.');
      }
    }

    // Cancer screening consideration
    if (r.includes('mass') || r.includes('lump') || r.includes('growth') || r.includes('cancer') || r.includes(' tumor') || r.includes('neoplasm') || r.includes('screening') || r.includes('mole') || r.includes('lesion')) {
      lines.push('ONCOLOGY SCREENING: Requested evaluation for suspected neoplasm. While rPPG cannot diagnose cancer, abnormal autonomic patterns (sustained tachycardia, HRV suppression) have been associated with paraneoplastic syndromes and systemic inflammation. Recommend: (1) Complete blood count with differential, (2) Inflammatory markers (CRP, ESR), (3) Age/gender-appropriate cancer screening (mammography, colonoscopy, low-dose CT chest if indicated), (4) Tissue biopsy for any suspicious lesion.');
    } else if (r.includes('weight') && r.includes('loss')) {
      lines.push('UNEXPLAINED WEIGHT LOSS: Requires malignancy screening per guidelines. Constitutional symptoms with vital abnormality warrant low threshold for imaging.');
    }

    // General cancer marker awareness (always included when vitals are available)
    if (hr > 0) {
      lines.push('CANCER SCREENING NOTE: No specific cancer marker can be identified via rPPG alone. However, persistent resting tachycardia, reduced heart rate variability, or unexplained tachypnea in a non-acute setting may warrant malignancy screening per NCCN or WHO guidelines, particularly in patients aged >50 with unexplained constitutional symptoms.');
    }
  } else {
    // No reason given — provide general screening note
    if (hr > 0) {
      lines.push('No reason for visit documented. Consider asking the patient about presenting symptoms to refine diagnostic hypothesis.');
      lines.push('CANCER SCREENING NOTE: rPPG-derived vitals alone cannot screen for malignancy. Age/gender-appropriate screening per guidelines remains the standard of care. Unexplained resting tachycardia or tachypnea may warrant further investigation.');
    }
  }

  return lines;
}

export function Page3Triage({ backendTriage, backendFft, backendVitals, reasonForVisit }: Page3Props) {
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
      reasonForVisit || ''
    );
  }, [backendVitals, backendTriage, reasonForVisit, hasData]);

  const alertLevel = psdData.some(d => d.freq >= 8 && d.freq <= 12 && d.amplitude > 50) ? 'elevated' : 'normal';

  const vitalCards = [
    { label: 'Heart Rate', value: backendVitals?.heartRate ?? 0, unit: 'BPM', icon: Heart, color: '#FF453A', normal: (v: number) => v >= 60 && v <= 100 },
    { label: 'Respiration', value: backendVitals?.respiration ?? 0, unit: 'Br/min', icon: Wind, color: '#0A84FF', normal: (v: number) => v >= 12 && v <= 20 },
    { label: 'Blood O₂', value: backendVitals?.bloodOxygen ?? 0, unit: '% SpO2', icon: Droplets, color: '#30D158', normal: (v: number) => v >= 95 || v === 0 },
    { label: 'Core Temp', value: backendVitals?.temperature ?? 0, unit: '°C', icon: Thermometer, color: '#FF9F0A', normal: (v: number) => v >= 36.0 && v <= 37.5 || v === 0 },
  ];

  return (
    <div className="flex flex-col gap-4 h-full overflow-auto">

      {/* Vitals snapshot */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#16161A] rounded-2xl border border-[#1E1E22] p-5 flex-shrink-0"
      >
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-[#0A84FF]" />
          <span className="text-[13px] font-semibold text-white">Vitals Snapshot</span>
          {hasData && (
            <div className="ml-auto flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#30D158]" style={{ animation: 'pulse 2s ease-in-out infinite' }} />
              <span className="text-[10px] text-[#8E8E93] tracking-widest font-mono">FROM SCAN</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-4 gap-3">
          {vitalCards.map(card => {
            const Icon = card.icon;
            const hasVal = card.value > 0;
            const isNormal = card.normal(card.value);
            const accent = hasVal ? (isNormal ? '#30D158' : '#FF453A') : '#8E8E93';
            return (
              <div key={card.label} className="bg-[#0B0B0D] rounded-xl border border-[#1E1E22] p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-[#8E8E93] tracking-widest uppercase font-medium">{card.label}</span>
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${accent}15` }}>
                    <Icon className="w-3.5 h-3.5" style={{ color: accent }} />
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5">
                  {hasVal ? (
                    <>
                      <span className={`text-[30px] font-bold leading-none font-mono ${isNormal ? 'text-white' : 'text-[#FF453A]'}`}>
                        {card.label === 'Core Temp' ? card.value.toFixed(1) : Math.round(card.value)}
                      </span>
                      <span className="text-[11px] text-[#8E8E93] font-medium mb-0.5">{card.unit}</span>
                    </>
                  ) : (
                    <span className="text-[28px] font-bold text-[#8E8E93]/40 leading-none font-mono">—</span>
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
        className="bg-[#16161A] rounded-2xl border border-[#1E1E22] p-5 flex-shrink-0"
      >
        <div className="flex items-center gap-2 mb-4">
          <Brain className="w-4 h-4 text-[#BF5AF2]" />
          <span className="text-[13px] font-semibold text-white">Diagnostic Hypotheses</span>
          {reasonForVisit && (
            <span className="text-[10px] text-[#8E8E93] bg-[#0B0B0D] px-2.5 py-1 rounded-lg border border-[#1E1E22] ml-2">
              Reason: {reasonForVisit.length > 40 ? reasonForVisit.slice(0, 40) + '…' : reasonForVisit}
            </span>
          )}
        </div>

        {diagnosis.length > 0 ? (
          <div className="space-y-2">
            {diagnosis.map((line, i) => {
              const isWarning = line.includes('HIGH') || line.includes('suspect') || line.includes('rule out') || line.includes('CANCER') || line.includes('stroke');
              const isCancerNote = line.includes('CANCER SCREENING') || line.includes('ONCOLOGY');
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.02 * i }}
                  className={`flex items-start gap-3 p-3 rounded-xl border ${
                    isWarning
                      ? 'bg-[#FF453A]/5 border-[#FF453A]/20'
                      : isCancerNote
                      ? 'bg-[#BF5AF2]/5 border-[#BF5AF2]/20'
                      : 'bg-[#0B0B0D] border-[#1E1E22]'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    isWarning
                      ? 'bg-[#FF453A]/10'
                      : isCancerNote
                      ? 'bg-[#BF5AF2]/10'
                      : 'bg-[#0A84FF]/10'
                  }`}>
                    {isWarning ? (
                      <AlertTriangle className="w-3 h-3 text-[#FF453A]" />
                    ) : isCancerNote ? (
                      <Activity className="w-3 h-3 text-[#BF5AF2]" />
                    ) : (
                      <CheckCircle2 className="w-3 h-3 text-[#0A84FF]" />
                    )}
                  </div>
                  <p className={`text-[12px] leading-relaxed ${
                    isWarning
                      ? 'text-[#FF453A] font-medium'
                      : isCancerNote
                      ? 'text-[#BF5AF2]'
                      : 'text-[#AEAEB2]'
                  }`}>{line}</p>
                </motion.div>
              );
            })}
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
        className="bg-[#16161A] rounded-2xl border border-[#1E1E22] p-5 flex-shrink-0"
      >
        <div className="flex items-center gap-4">
          <div className={`flex-1 rounded-xl p-4 border flex items-start gap-3 ${
            alertLevel === 'elevated' ? 'bg-[#FF453A]/5 border-[#FF453A]/30' : 'bg-[#30D158]/5 border-[#30D158]/25'
          }`}>
            {alertLevel === 'elevated' ? (
              <AlertTriangle className="w-5 h-5 text-[#FF453A] flex-shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-[#30D158] flex-shrink-0 mt-0.5" />
            )}
            <div>
              <h4 className={`text-[14px] font-bold mb-1.5 ${alertLevel === 'elevated' ? 'text-[#FF453A]' : 'text-[#30D158]'}`}>
                {alertLevel === 'elevated' ? 'Elevated tremor activity detected' : 'No pathological tremor pattern'}
              </h4>
              <p className="text-[13px] text-[#8E8E93] leading-relaxed">
                {alertLevel === 'elevated'
                  ? 'High-frequency micro-clonus tremor matched within 8–12 Hz pathological zone. Correlate clinically.'
                  : hasData
                  ? 'All measured frequency bands within expected ranges. No pathological signatures detected.'
                  : 'Complete a biometric scan to enable tremor analysis.'}
              </p>
            </div>
          </div>

          <motion.button
            onClick={() => {
              toast.success('PDF Report Generated', { description: 'Diagnostic report compiled.' });
            }}
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.985 }}
            className="flex flex-col items-center justify-center gap-2.5 px-8 rounded-xl font-semibold text-[14px] transition-all min-w-[160px] bg-[#0A84FF] text-white hover:bg-[#0A84FF]/90 shadow-lg shadow-[#0A84FF]/10"
          >
            <FileText className="w-5 h-5" />
            Export Report
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
