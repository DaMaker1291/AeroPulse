import { motion } from 'motion/react';
import { Heart, Camera, BarChart3, Shield, Monitor, Activity, Brain, Github, ExternalLink } from 'lucide-react';

const pipelineSteps = [
  { icon: Camera, label: 'Capture', desc: 'Webcam feed at 60 FPS', color: '#0A84FF' },
  { icon: Monitor, label: 'Detect', desc: 'MediaPipe face mesh (478 pts)', color: '#30D158' },
  { icon: Activity, label: 'Process', desc: 'POS algorithm + FFT', color: '#BF5AF2' },
  { icon: BarChart3, label: 'Estimate', desc: 'HR, respiration, signal quality', color: '#FF9F0A' },
];

const metrics = [
  { label: 'Heart Rate', range: '40–180 BPM', accuracy: '±2 BPM', color: '#FF453A' },
  { label: 'Respiration', range: '6–30 Br/min', accuracy: '±1 Br/min', color: '#0A84FF' },
  { label: 'Window Size', range: '10 seconds', accuracy: '60 Hz', color: '#30D158' },
  { label: 'Signal Freq', range: '0.75–2.75 Hz', accuracy: 'Bandpass', color: '#BF5AF2' },
];

export function Page5Labvanced() {
  return (
    <div className="flex flex-col gap-4 h-full overflow-auto">

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#16161A] rounded-2xl border border-[#1E1E22] p-6 flex-shrink-0"
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FF453A] to-[#BF5AF2] flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#FF453A]/20">
            <Heart className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <span className="text-[11px] text-[#FF453A] font-bold tracking-widest uppercase">Remote PPG Engine</span>
              <span className="text-[10px] text-[#8E8E93] font-mono bg-[#0B0B0D] px-2 py-0.5 rounded border border-[#1E1E22]">Client-Side</span>
            </div>
            <h1 className="text-[22px] font-bold text-white">Browser-Based rPPG Pipeline</h1>
            <p className="text-[13px] text-[#8E8E93] mt-1 max-w-2xl">
              Real-time heart rate and respiration estimation from webcam video using the POS algorithm,
              running entirely in the browser with no server upload.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Pipeline + Metrics row */}
      <div className="grid grid-cols-5 gap-4 flex-shrink-0">
        {/* Pipeline steps */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="col-span-3 bg-[#16161A] rounded-2xl border border-[#1E1E22] p-5"
        >
          <span className="text-[13px] font-semibold text-white mb-4 block">Signal Pipeline</span>
          <div className="grid grid-cols-4 gap-3">
            {pipelineSteps.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.05 }}
                  className="bg-[#0B0B0D] rounded-xl border border-[#1E1E22] p-4 text-center"
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2.5" style={{ backgroundColor: `${step.color}15` }}>
                    <Icon className="w-5 h-5" style={{ color: step.color }} />
                  </div>
                  <span className="text-[12px] font-semibold text-white block">{step.label}</span>
                  <span className="text-[10px] text-[#8E8E93] block mt-0.5">{step.desc}</span>
                  {i < 3 && (
                    <div className="hidden md:block mt-2 text-[10px] text-[#8E8E93]/30">→</div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Specs */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="col-span-2 bg-[#16161A] rounded-2xl border border-[#1E1E22] p-5"
        >
          <span className="text-[13px] font-semibold text-white mb-4 block">Performance Specs</span>
          <div className="space-y-3">
            {metrics.map(m => (
              <div key={m.label} className="bg-[#0B0B0D] rounded-xl border border-[#1E1E22] p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
                  <span className="text-[11px] text-[#8E8E93] tracking-widest uppercase font-medium">{m.label}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[18px] font-bold text-white font-mono">{m.range}</span>
                  <span className="text-[10px] text-[#8E8E93]/60 font-mono">{m.accuracy}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Algorithm details */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-[#16161A] rounded-2xl border border-[#1E1E22] p-5 flex-shrink-0"
      >
        <div className="flex items-center gap-2 mb-4">
          <Brain className="w-4 h-4 text-[#BF5AF2]" />
          <span className="text-[13px] font-semibold text-white">Algorithm: POS (Plane Orthogonal to Skin)</span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[#0B0B0D] rounded-xl border border-[#1E1E22] p-4">
            <h4 className="text-[12px] font-semibold text-white mb-2">How it works</h4>
            <ul className="space-y-2">
              {[
                'Face detected via MediaPipe 478-point mesh',
                'Skin ROI extracted from cheek/forehead region',
                'RGB channels normalized by mean (DC removal)',
                'POS projection separates pulse from motion',
                '6th-order Butterworth bandpass (0.75–2.75 Hz)',
                'Hanning window + FFT + quadratic peak interpolation',
                'EMA temporal smoothing (α = 0.35) for stable HR',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-[12px] text-[#AEAEB2]">
                  <div className="w-1 h-1 rounded-full bg-[#BF5AF2] mt-1.5 flex-shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-[#0B0B0D] rounded-xl border border-[#1E1E22] p-4">
            <h4 className="text-[12px] font-semibold text-white mb-2">Key advantages</h4>
            <ul className="space-y-2">
              {[
                'No data leaves the device — fully client-side',
                'Works with any standard webcam (no IR/medical cam)',
                'Real-time: ~15ms per frame at 60 FPS',
                'Respiration derived from intensity envelope FFT',
                'Signal quality metric from R/G channel contrast',
                'Fallback to flat line — never shows fake data',
                'Open source, no external API dependencies',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-[12px] text-[#AEAEB2]">
                  <div className="w-1 h-1 rounded-full bg-[#30D158] mt-1.5 flex-shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </motion.div>

      {/* Architecture + CTA */}
      <div className="grid grid-cols-3 gap-4 flex-shrink-0">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="col-span-2 bg-[#16161A] rounded-2xl border border-[#1E1E22] p-5"
        >
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-[#30D158]" />
            <span className="text-[13px] font-semibold text-white">Privacy Architecture</span>
          </div>
          <div className="bg-[#0B0B0D] rounded-xl border border-[#1E1E22] p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-3 h-3 rounded-full bg-[#30D158]" />
              <span className="text-[13px] font-semibold text-white">100% Client-Side Processing</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Camera Feed', desc: 'Never uploaded', color: '#30D158' },
                { label: 'Face Mesh', desc: 'Local only', color: '#0A84FF' },
                { label: 'Vital Signs', desc: 'Kept in memory', color: '#BF5AF2' },
              ].map(item => (
                <div key={item.label} className="bg-[#16161A] rounded-lg border border-[#1E1E22] p-3 text-center">
                  <div className="w-2 h-2 rounded-full mx-auto mb-1.5" style={{ backgroundColor: item.color }} />
                  <span className="text-[12px] font-semibold text-white block">{item.label}</span>
                  <span className="text-[10px] text-[#8E8E93]">{item.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-[#16161A] rounded-2xl border border-[#1E1E22] p-5 flex flex-col"
        >
          <div className="flex items-center gap-2 mb-3">
            <Github className="w-4 h-4 text-[#8E8E93]" />
            <span className="text-[13px] font-semibold text-white">Open Source</span>
          </div>
          <div className="flex-1 bg-[#0B0B0D] rounded-xl border border-[#1E1E22] p-4 flex flex-col items-center justify-center text-center">
            <Github className="w-8 h-8 text-[#8E8E93] mb-3" />
            <p className="text-[12px] text-[#AEAEB2] mb-3">Built with MediaPipe Tasks-Vision, React, Recharts</p>
            <a
              href="https://github.com/DaMaker1291/AeroPulse"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0A84FF] text-white text-[12px] font-semibold hover:bg-[#0A84FF]/90 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>View on GitHub</span>
            </a>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
