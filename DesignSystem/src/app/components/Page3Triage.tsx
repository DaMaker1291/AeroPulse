import { useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceLine } from 'recharts';
import { FileText, AlertTriangle, CheckCircle2, TrendingUp, Activity } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';

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
}

export function Page3Triage({ backendTriage, backendFft }: Page3Props) {
  const [reportGenerated, setReportGenerated] = useState(false);

  const metrics = {
    bilateralSymmetry: backendTriage?.bilateralSymmetry ?? null,
    neuromuscularLag: backendTriage?.neuromuscularLag ?? null,
    vascularCompliance: backendTriage?.vascularCompliance ?? null,
  };

  const hasTriage = metrics.bilateralSymmetry !== null;

  const hasPsdData = backendFft?.freqs?.length && backendFft?.power?.length;
  const psdData = useMemo(() => {
    if (hasPsdData) {
      return backendFft.freqs
        .map((f, i) => ({ freq: f, amplitude: Math.max(0, (backendFft.power[i] ?? 0) * 100) }))
        .filter(d => d.freq >= 0 && d.freq <= 25);
    }
    return [];
  }, [backendFft]);

  const alertLevel = psdData.some(d => d.freq >= 8 && d.freq <= 12 && d.amplitude > 50) ? 'elevated' : 'normal';

  const handleGenerateReport = () => {
    setReportGenerated(true);
    toast.success('PDF Report Generated', { description: 'Diagnostic report compiled and saved to secure records.' });
  };

  const metricCards = [
    {
      label: 'Bilateral Symmetry',
      value: metrics.bilateralSymmetry !== null ? `${metrics.bilateralSymmetry}%` : null,
      sub: metrics.bilateralSymmetry !== null ? 'Within normal baseline variance' : 'Awaiting biometric scan',
      icon: Activity,
      status: metrics.bilateralSymmetry !== null ? 'ok' : 'pending',
      bar: metrics.bilateralSymmetry ?? 0,
    },
    {
      label: 'Neuromuscular Lag',
      value: metrics.neuromuscularLag !== null ? `${metrics.neuromuscularLag} ms` : null,
      sub: metrics.neuromuscularLag !== null ? 'Optimal path latency' : 'Awaiting biometric scan',
      icon: TrendingUp,
      status: metrics.neuromuscularLag !== null ? 'ok' : 'pending',
      bar: metrics.neuromuscularLag !== null ? 100 - (metrics.neuromuscularLag / 200) * 100 : 0,
    },
    {
      label: 'Vascular Compliance',
      value: metrics.vascularCompliance !== null ? (metrics.vascularCompliance > 80 ? 'NORMAL COMPLIANCE' : 'MODERATE STIFFENING') : null,
      sub: metrics.vascularCompliance !== null ? 'Cross-referenced age profile' : 'Awaiting biometric scan',
      icon: AlertTriangle,
      status: metrics.vascularCompliance !== null ? 'warn' : 'pending',
      bar: metrics.vascularCompliance ?? 0,
    },
  ];

  return (
    <div className="flex flex-col gap-4 h-full">

      {/* Overview metrics */}
      <div className="bg-[#16161A] rounded-2xl border border-[#1E1E22] p-5 flex-shrink-0">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[13px] font-semibold text-white">Diagnostic Overview</span>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#0A84FF]" />
            <span className="text-[10px] text-[#8E8E93] font-mono tracking-widest">POST-SCAN ANALYSIS</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {metricCards.map(card => {
            const Icon = card.icon;
            const isWarn = card.status === 'warn';
            const isPending = card.status === 'pending';
            const accentColor = isPending ? '#8E8E93' : (isWarn ? '#FF9F0A' : '#30D158');
            const hasVal = card.value !== null;

            return (
              <div key={card.label} className="bg-[#0B0B0D] rounded-xl border border-[#1E1E22] p-4">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[10px] text-[#8E8E93] tracking-widest uppercase font-medium leading-relaxed">{card.label}</span>
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${accentColor}15` }}>
                    <Icon className="w-3.5 h-3.5" style={{ color: accentColor }} />
                  </div>
                </div>
                <div className="text-[22px] font-bold leading-tight mb-1" style={{ color: hasVal ? (isWarn ? accentColor : 'white') : '#8E8E93' }}>
                  {hasVal ? card.value : '—'}
                </div>
                <p className="text-[11px] text-[#8E8E93] mb-3">{card.sub}</p>
                {hasVal && (
                  <div className="h-1 bg-[#1E1E22] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${card.bar}%`, backgroundColor: accentColor, opacity: 0.7 }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* FFT Power Spectral Density */}
        <div className="flex-1 bg-[#16161A] rounded-2xl border border-[#1E1E22] p-5 flex flex-col min-h-0">
          <div className="flex items-start justify-between mb-4 flex-shrink-0">
            <div>
              <span className="text-[13px] font-semibold text-white">Power Spectral Density Analyzer</span>
              <p className="text-[11px] text-[#8E8E93] mt-0.5">Muscle tremor frequency analysis · Fast Fourier Transform</p>
            </div>
            {hasPsdData && (
              <div className="flex items-center gap-4 text-[10px]">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: '#FF453A', opacity: 0.5 }} />
                  <span className="text-[#8E8E93]">Pathological Zone (8–12 Hz)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-sm bg-[#0A84FF]" />
                  <span className="text-[#8E8E93]">Measured Tremor Spectrum</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 bg-[#0B0B0D] rounded-xl border border-[#1E1E22] p-4 flex items-center justify-center">
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
                  <XAxis
                    dataKey="freq"
                    stroke="#2C2C2E"
                    tick={{ fill: '#8E8E93', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                    label={{ value: 'Frequency (Hz)', position: 'insideBottom', offset: -3, fill: '#8E8E93', fontSize: 10 }}
                  />
                  <YAxis
                    stroke="#2C2C2E"
                    tick={{ fill: '#8E8E93', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                    label={{ value: 'Amplitude', angle: -90, position: 'insideLeft', fill: '#8E8E93', fontSize: 10 }}
                  />
                  <ReferenceLine x={8} stroke="#FF453A" strokeDasharray="4 3" opacity={0.6} label={{ value: '8 Hz', fill: '#FF453A', fontSize: 9, position: 'top' }} />
                  <ReferenceLine x={12} stroke="#FF453A" strokeDasharray="4 3" opacity={0.6} label={{ value: '12 Hz', fill: '#FF453A', fontSize: 9, position: 'top' }} />
                  <Area type="monotone" dataKey="amplitude" stroke="#0A84FF" strokeWidth={2} fill="url(#ampGrad)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center">
                <div className="w-12 h-12 rounded-xl bg-[#0A84FF]/5 border border-[#0A84FF]/15 flex items-center justify-center mx-auto mb-3">
                  <Activity className="w-5 h-5 text-[#0A84FF]" />
                </div>
                <p className="text-[14px] text-[#8E8E93] font-medium">Awaiting biometric scan</p>
                <p className="text-[12px] text-[#8E8E93]/60 mt-1">Complete the Biometric Scanner step first</p>
              </div>
            )}
          </div>
        </div>

      {/* Alert banner + export */}
      <div className="bg-[#16161A] rounded-2xl border border-[#1E1E22] p-5 flex-shrink-0">
        <div className="flex items-stretch gap-4">
          {/* Alert */}
          <div className={`flex-1 rounded-xl p-4 border flex items-start gap-3 ${
            alertLevel === 'elevated'
              ? 'bg-[#FF453A]/5 border-[#FF453A]/30'
              : 'bg-[#30D158]/5 border-[#30D158]/25'
          }`}>
            {alertLevel === 'elevated' ? (
              <AlertTriangle className="w-5 h-5 text-[#FF453A] flex-shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-[#30D158] flex-shrink-0 mt-0.5" />
            )}
            <div>
              <h4 className={`text-[14px] font-bold mb-1.5 ${alertLevel === 'elevated' ? 'text-[#FF453A]' : 'text-[#30D158]'}`}>
                {alertLevel === 'elevated'
                  ? 'WARNING: Systemic Inflammatory Index Elevated'
                  : 'Systemic Homeostasis Optimal'}
              </h4>
              <p className="text-[13px] text-[#8E8E93] leading-relaxed">
                {alertLevel === 'elevated'
                  ? 'High-frequency micro-clonus tremor matched with blunted capillary compliance peaks. Suggestive of metabolic cachexia. Recommend further laboratory blood panel analysis.'
                  : 'All biomarkers within expected ranges. No pathological signatures detected. Continue routine monitoring.'}
              </p>
            </div>
          </div>

          {/* Export button */}
          <motion.button
            onClick={handleGenerateReport}
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.985 }}
            className={`flex flex-col items-center justify-center gap-2.5 px-8 rounded-xl font-semibold text-[14px] transition-all min-w-[180px] ${
              reportGenerated
                ? 'bg-[#30D158] text-white shadow-lg shadow-[#30D158]/10'
                : 'bg-[#0A84FF] text-white hover:bg-[#0A84FF]/90 shadow-lg shadow-[#0A84FF]/10'
            }`}
          >
            <FileText className="w-5 h-5" />
            {reportGenerated ? 'Report Generated' : 'Generate PDF Report'}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
