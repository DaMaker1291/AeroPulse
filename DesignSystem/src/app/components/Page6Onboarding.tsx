import { motion } from 'motion/react';
import { Camera, Monitor, Activity, BarChart3, Brain, FileText, Shield, ChevronRight } from 'lucide-react';

const steps = [
  {
    icon: Camera, label: 'Position your face', desc: 'Sit directly facing the camera at arm\'s length. Ensure even, diffuse lighting — avoid strong shadows or backlight. Remove glasses if they cause glare.',
    color: '#0A84FF',
  },
  {
    icon: Monitor, label: 'Check the face mesh', desc: 'On the Intake page, confirm the green wireframe overlay tracks your face contours. The mesh should cover eyes, brows, nose, lips, and face oval. If missing, check lighting.',
    color: '#30D158',
  },
  {
    icon: Activity, label: 'Wait for target lock', desc: 'The reticle status changes from STANDBY → ACQUIRING → TARGET LOCKED. Wait for the green "TARGET LOCKED" indicator before proceeding to the scan.',
    color: '#FF9F0A',
  },
  {
    icon: BarChart3, label: 'Run the compliance scan', desc: 'Navigate to Biometric Scanner and press "Execute 10-Second Compliance Scan". Remain perfectly still for 10 seconds. Both hands are measured simultaneously.',
    color: '#BF5AF2',
  },
  {
    icon: Brain, label: 'Review diagnostic analysis', desc: 'After the scan, the Predictive Triage page shows your vitals, FFT power spectrum, and a diagnostic hypothesis based on your data and stated reason for visit.',
    color: '#FF453A',
  },
  {
    icon: Shield, label: 'Data privacy', desc: 'All processing is client-side. No video, face mesh, or vital data leaves your device. The page works fully offline after the initial model download.',
    color: '#30D158',
  },
];

export function Page6Onboarding() {
  return (
    <div className="flex flex-col gap-4 h-full overflow-auto">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#16161A] rounded-2xl border border-[#1E1E22] p-6 flex-shrink-0"
      >
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0A84FF] to-[#30D158] flex items-center justify-center shadow-lg shadow-[#0A84FF]/20">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-[11px] text-[#0A84FF] font-bold tracking-widest uppercase">Quick Start</span>
            <h1 className="text-[20px] font-bold text-white">How to Use AeroPulse AI</h1>
          </div>
        </div>
        <p className="text-[13px] text-[#8E8E93] mt-2 max-w-2xl">
          Six simple steps to get an accurate rPPG-based vital sign reading and diagnostic analysis.
        </p>
      </motion.div>

      <div className="grid grid-cols-2 gap-4">
        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <motion.div
              key={step.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.06 }}
              className="bg-[#16161A] rounded-2xl border border-[#1E1E22] p-5 flex items-start gap-4"
            >
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${step.color}15` }}>
                  <Icon className="w-4 h-4" style={{ color: step.color }} />
                </div>
                <div className="text-[16px] font-bold text-[#8E8E93]/30 font-mono">0{i + 1}</div>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[14px] font-semibold text-white mb-1">{step.label}</h3>
                <p className="text-[12px] text-[#8E8E93] leading-relaxed">{step.desc}</p>
              </div>
            </motion.div>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="bg-gradient-to-r from-[#0A84FF]/5 to-[#BF5AF2]/5 rounded-2xl border border-[#0A84FF]/15 p-5 flex-shrink-0 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#30D158]" style={{ animation: 'pulse 2s ease-in-out infinite' }} />
          <span className="text-[13px] text-[#AEAEB2]">All processing is done locally — nothing is uploaded</span>
        </div>
        <div className="flex items-center gap-1.5 text-[12px] text-[#0A84FF] font-medium">
          <span>Ready to start</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </div>
      </motion.div>
    </div>
  );
}
