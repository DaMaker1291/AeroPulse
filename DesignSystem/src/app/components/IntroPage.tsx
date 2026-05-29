import { motion } from 'motion/react';
import { Activity, ArrowRight, Check, Shield } from 'lucide-react';
import { useIsMobile } from './ui/use-mobile';

interface IntroPageProps {
  onEnter: () => void;
}

export function IntroPage({ onEnter }: IntroPageProps) {
  const isMobile = useIsMobile();

  return (
    <div className="w-screen h-screen bg-[#0B0B0D] flex overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.02] pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(#0A84FF 1px, transparent 1px), linear-gradient(90deg, #0A84FF 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* Left: Brand Panel — hidden on mobile */}
      {!isMobile && (
        <div className="w-[460px] flex-shrink-0 relative flex flex-col p-12 overflow-hidden">
          <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-[#0A84FF]/20 to-transparent" />

          <div className="flex items-center gap-3 mb-16 relative z-10">
            <div className="w-10 h-10 rounded-2xl bg-[#0A84FF] flex items-center justify-center shadow-lg shadow-[#0A84FF]/20">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-white font-bold text-[18px] leading-tight tracking-tight">AeroPulse AI</div>
              <div className="text-[#0A84FF] text-[10px] tracking-[0.16em] uppercase font-semibold mt-0.5">Enterprise Medical Platform</div>
            </div>
          </div>

          <div className="relative z-10 flex-1">
            <h1 className="text-[36px] font-bold text-white leading-[1.15] mb-5 tracking-tight">
              Clinical-grade<br />
              <span className="text-[#0A84FF]">diagnostic</span><br />
              intelligence.
            </h1>
            <p className="text-[#8E8E93] text-[14px] leading-relaxed mb-12 max-w-[300px]">
              Secure, real-time biomarker analysis with AI-driven triage pathways. Built for enterprise healthcare infrastructure.
            </p>

            <div className="space-y-3">
              {[
                'FDA Class II Software Cleared',
                'HIPAA & GDPR Compliant Infrastructure',
                'Real-time Neural Signal Processing',
                'Enterprise Audit Trail & Logging',
              ].map(feature => (
                <div key={feature} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-[#0A84FF]/10 border border-[#0A84FF]/25 flex items-center justify-center flex-shrink-0">
                    <Check className="w-2.5 h-2.5 text-[#0A84FF]" />
                  </div>
                  <span className="text-[13px] text-[#8E8E93]">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10">
            <div className="flex items-center gap-3 p-4 bg-[#16161A] rounded-xl border border-[#2C2C2E]">
              <div className="w-8 h-8 rounded-lg bg-[#30D158]/10 border border-[#30D158]/20 flex items-center justify-center flex-shrink-0">
                <Shield className="w-4 h-4 text-[#30D158]" />
              </div>
              <div>
                <div className="text-[12px] text-white font-medium">Enterprise-Grade Security</div>
                <div className="text-[11px] text-[#8E8E93] mt-0.5">256-bit AES · SOC 2 Type II · ISO 27001</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Right: Welcome Panel */}
      <div className={`flex-1 flex flex-col items-center justify-center bg-[#0D0D10] ${isMobile ? 'p-6' : 'p-12'}`}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="flex flex-col items-center text-center max-w-[420px]"
        >
          {isMobile && (
            <div className="flex items-center gap-3 mb-12">
              <div className="w-10 h-10 rounded-2xl bg-[#0A84FF] flex items-center justify-center shadow-lg shadow-[#0A84FF]/20">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <div className="text-left">
                <div className="text-white font-bold text-[18px] leading-tight tracking-tight">AeroPulse AI</div>
                <div className="text-[#0A84FF] text-[10px] tracking-[0.16em] uppercase font-semibold mt-0.5">Enterprise Medical Platform</div>
              </div>
            </div>
          )}

          <div className="w-16 h-16 rounded-2xl bg-[#0A84FF]/10 border border-[#0A84FF]/20 flex items-center justify-center mb-6">
            <Activity className="w-8 h-8 text-[#0A84FF]" />
          </div>

          <h1 className="text-[32px] sm:text-[40px] font-bold text-white leading-[1.1] mb-4 tracking-tight">
            Welcome to<br />
            <span className="text-[#0A84FF]">AeroPulse AI</span>
          </h1>

          <p className="text-[#8E8E93] text-[15px] leading-relaxed mb-2">
            Enterprise-grade clinical screening platform with real-time biomarker analysis, AI-driven triage, and secure patient monitoring.
          </p>

          <div className="flex items-center gap-2 mb-10 text-[12px] text-[#8E8E93]">
            <div className="w-1.5 h-1.5 rounded-full bg-[#30D158]" />
            <span>System ready — v2.4.1</span>
          </div>

          <motion.button
            onClick={onEnter}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full h-14 bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white rounded-2xl font-bold text-[16px] flex items-center justify-center gap-3 transition-all shadow-xl shadow-[#0A84FF]/15"
          >
            Enter Application <ArrowRight className="w-5 h-5" />
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}
