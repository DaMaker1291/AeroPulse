import { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceLine, LineChart, Line } from 'recharts';
import { FileText, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';

interface Page3Props {
  metrics: {
    bilateralSymmetry: number;
    neuromuscularLag: number;
    vascularCompliance: string;
  };
  psdData: Array<{ freq: number; amplitude: number }>;
  enduranceSummary: string;
  sendWs: (cmd: string, data?: any) => void;
  vitalsTrend: { heartRate: number[]; spo2: number[]; respiration: number[] };
}

export function Page3Triage({
  metrics,
  psdData,
  enduranceSummary,
  sendWs,
  vitalsTrend
}: Page3Props) {
  const [reportGenerated, setReportGenerated] = useState(false);

  // Pathological tremor flag is set if peak in the 8-12 Hz diagnostic range has high frequency amplitude
  const alertLevel = psdData.some(d => d.freq >= 8 && d.freq <= 12 && d.amplitude > 40)
    ? 'elevated'
    : 'normal';

  const handleGenerateReport = () => {
    setReportGenerated(true);
    sendWs("GENERATE_PDF");
    toast.success('PDF Report Generated Successfully', {
      description: 'AeroPulse diagnostic report compiled and saved to Desktop.',
      duration: 3500
    });
  };

  return (
    <div className="flex flex-col gap-5 h-full">
      {/* Top: Overview Metrics Grid */}
      <div className="bg-[#16161A] rounded-xl p-6 border border-[#2C2C2E]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[14px] text-[#8E8E93] tracking-wider uppercase font-medium">Diagnostic Overview</h3>
          <div className="flex gap-2">
            <button
              onClick={() => sendWs("TRIGGER_DEMO", { kind: "HOMEOSTASIS" })}
              className="px-3 py-1 bg-[#1C1C1E] border border-[#2C2C2E] rounded-md text-[11px] text-[#30D158] uppercase hover:bg-[#30D158]/10 cursor-pointer transition-colors"
            >
              Simulate Homeostasis
            </button>
            <button
              onClick={() => sendWs("TRIGGER_DEMO", { kind: "PATHOLOGY" })}
              className="px-3 py-1 bg-[#1C1C1E] border border-[#2C2C2E] rounded-md text-[11px] text-[#FF453A] uppercase hover:bg-[#FF453A]/10 cursor-pointer transition-colors"
            >
              Simulate Pathology
            </button>
            <button
              onClick={() => sendWs("TRIGGER_DEMO", { kind: "LIVE" })}
              className="px-3 py-1 bg-[#1C1C1E] border border-[#2C2C2E] rounded-md text-[11px] text-[#0A84FF] uppercase hover:bg-[#0A84FF]/10 cursor-pointer transition-colors"
            >
              Reset Live
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-6">
          {/* Bilateral Symmetry */}
          <div className="bg-[#0B0B0D] rounded-lg p-5 border border-[#2C2C2E]">
            <div className="flex items-start justify-between mb-3">
              <span className="text-[11px] text-[#8E8E93] tracking-wider uppercase">Bilateral Symmetry</span>
              <CheckCircle2 className="w-4 h-4 text-[#30D158]" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-medium text-white">{metrics.bilateralSymmetry}</span>
              <span className="text-[14px] text-[#8E8E93]">%</span>
            </div>
            <p className="text-[11px] text-[#8E8E93] mt-2">Within normal baseline variance</p>
          </div>

          {/* Neuromuscular Recruitment Lag */}
          <div className="bg-[#0B0B0D] rounded-lg p-5 border border-[#2C2C2E]">
            <div className="flex items-start justify-between mb-3">
              <span className="text-[11px] text-[#8E8E93] tracking-wider uppercase">Neuromuscular Lag</span>
              <CheckCircle2 className="w-4 h-4 text-[#30D158]" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-medium text-white">{metrics.neuromuscularLag}</span>
              <span className="text-[14px] text-[#8E8E93]">ms</span>
            </div>
            <p className="text-[11px] text-[#8E8E93] mt-2">Optimal path latency</p>
          </div>

          {/* Vascular Arterial Compliance */}
          <div className="bg-[#0B0B0D] rounded-lg p-5 border border-[#2C2C2E]">
            <div className="flex items-start justify-between mb-3">
              <span className="text-[11px] text-[#8E8E93] tracking-wider uppercase">Vascular Compliance</span>
              <AlertTriangle className="w-4 h-4 text-[#FF9F0A]" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-medium text-[#FF9F0A]">{metrics.vascularCompliance}</span>
            </div>
            <p className="text-[11px] text-[#8E8E93] mt-2">Cross-referenced profile</p>
          </div>
        </div>
      </div>

      {/* Vitals Trend Chart */}
      <div className="bg-[#16161A] rounded-xl p-6 border border-[#2C2C2E]">
        <div className="mb-3">
          <h3 className="text-[14px] text-[#8E8E93] tracking-wider uppercase">Vitals Trend</h3>
          <p className="text-[11px] text-[#8E8E93] mt-1">Real-time session vitals history</p>
        </div>
        <div className="h-32 bg-[#0B0B0D] rounded-lg p-2 border border-[#2C2C2E]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={vitalsTrend.heartRate.map((hr, i) => ({
                index: i,
                heartRate: hr,
                spo2: vitalsTrend.spo2[i] || 0,
                respiration: vitalsTrend.respiration[i] || 0,
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#2C2C2E" opacity={0.3} />
              <XAxis hide />
              <YAxis hide domain={[40, 180]} />
              <Line
                type="monotone"
                dataKey="heartRate"
                stroke="#30D158"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="spo2"
                stroke="#0A84FF"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="respiration"
                stroke="#BF5AF2"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex items-center gap-4 text-[10px] text-[#8E8E93]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#30D158]" /> HR</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#0A84FF]" /> SpO2</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#BF5AF2]" /> RR</span>
        </div>
      </div>

      {/* Center: Power Spectral Density Analyzer */}
      <div className="flex-1 bg-[#16161A] rounded-xl p-6 border border-[#2C2C2E]">
        <div className="mb-4">
          <h3 className="text-[14px] text-[#8E8E93] tracking-wider uppercase">Power Spectral Density Analyzer</h3>
          <p className="text-[11px] text-[#8E8E93] mt-1">Muscle tremor frequency analysis (FFT)</p>
        </div>

        <div className="h-96 bg-[#0B0B0D] rounded-lg p-4 border border-[#2C2C2E]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={psdData}>
              <defs>
                <linearGradient id="amplitudeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0A84FF" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#0A84FF" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="dangerZoneGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#FF453A" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#FF453A" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2C2C2E" opacity={0.3} />
              <XAxis
                dataKey="freq"
                stroke="#8E8E93"
                tick={{ fill: '#8E8E93', fontSize: 11 }}
                label={{ value: 'Frequency (Hz)', position: 'insideBottom', offset: -5, fill: '#8E8E93', fontSize: 11 }}
              />
              <YAxis
                stroke="#8E8E93"
                tick={{ fill: '#8E8E93', fontSize: 11 }}
                label={{ value: 'Amplitude', angle: -90, position: 'insideLeft', fill: '#8E8E93', fontSize: 11 }}
              />
              <ReferenceLine
                x={8}
                stroke="#FF453A"
                strokeDasharray="3 3"
                opacity={0.5}
                label={{ value: '8 Hz', fill: '#FF453A', fontSize: 10, position: 'top' }}
              />
              <ReferenceLine
                x={12}
                stroke="#FF453A"
                strokeDasharray="3 3"
                opacity={0.5}
                label={{ value: '12 Hz', fill: '#FF453A', fontSize: 10, position: 'top' }}
              />
              <Area
                type="monotone"
                dataKey="amplitude"
                stroke="#0A84FF"
                strokeWidth={2}
                fill="url(#amplitudeGradient)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <div className="flex items-center gap-2 text-[11px]">
            <div className="w-3 h-3 bg-[#FF453A] opacity-30 rounded"></div>
            <span className="text-[#8E8E93]">Pathological Zone (8-12 Hz)</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] ml-4">
            <div className="w-3 h-3 bg-[#0A84FF] rounded"></div>
            <span className="text-[#8E8E93]">Measured Tremor Spectrum</span>
          </div>
        </div>
      </div>

      {/* Bottom: Alert Banner & Export */}
      <div className="bg-[#16161A] rounded-xl p-6 border border-[#2C2C2E]">
        <div className="flex items-center justify-between">
          {/* Alert Status */}
          <div className={`flex-1 rounded-lg px-6 py-4 mr-6 ${alertLevel === 'elevated'
            ? 'bg-[#FF453A]/10 border-2 border-[#FF453A]'
            : 'bg-[#30D158]/10 border-2 border-[#30D158]'
            }`}>
            <div className="flex items-start gap-3">
              {alertLevel === 'elevated' ? (
                <AlertTriangle className="w-6 h-6 text-[#FF453A] flex-shrink-0 mt-1" />
              ) : (
                <CheckCircle2 className="w-6 h-6 text-[#30D158] flex-shrink-0 mt-1" />
              )}
              <div>
                <h4 className={`text-[16px] font-medium mb-1 ${alertLevel === 'elevated' ? 'text-[#FF453A]' : 'text-[#30D158]'
                  }`}>
                  {alertLevel === 'elevated'
                    ? 'WARNING: SYSTEMIC INFLAMMATORY INDEX ELEVATED'
                    : 'SYSTEMIC HOMEOSTASIS OPTIMAL'}
                </h4>
                <p className="text-[14px] text-[#8E8E93] leading-relaxed">
                  {alertLevel === 'elevated'
                    ? 'High frequency micro-clonus tremor matched with blunted capillary compliance peaks. Suggestive of metabolic cachexia metabolic footprints. Recommend further laboratory blood panel analysis.'
                    : 'All biomarkers within expected ranges. No pathological signatures detected. Continue routine monitoring.'}
                </p>
              </div>
            </div>
          </div>

          {/* Export Button */}
          <motion.button
            onClick={handleGenerateReport}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`flex items-center gap-3 px-8 py-6 rounded-xl text-[16px] font-medium transition-all ${reportGenerated
              ? 'bg-[#30D158] text-white'
              : 'bg-[#0A84FF] text-white hover:bg-[#0A84FF]/90'
              }`}
          >
            <FileText className="w-5 h-5" />
            {reportGenerated ? 'REPORT GENERATED' : 'GENERATE OFFICIAL PDF REPORT'}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
