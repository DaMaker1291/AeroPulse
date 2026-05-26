import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity, ArrowRight, Check, Shield, Eye, EyeOff,
  Building2, User, Mail, Lock, Key, ChevronDown
} from 'lucide-react';
import { useIsMobile } from './ui/use-mobile';

interface AccountCreationProps {
  onComplete: (userData: { name: string; org: string; role: string; reasonForVisit: string }) => void;
}

const ROLES = [
  'Neurologist', 'Cardiologist', 'General Practitioner',
  'Clinical Researcher', 'Radiologist', 'Emergency Medicine', 'System Administrator'
];

const REGIONS = ['North America', 'Europe', 'Asia Pacific', 'Latin America', 'Middle East & Africa'];

function FormField({
  icon, label, placeholder, value, onChange, type = 'text', mono = false
}: {
  icon: React.ReactNode; label: string; placeholder: string;
  value: string; onChange: (v: string) => void; type?: string; mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-[11px] text-[#8E8E93] tracking-widest mb-2 uppercase font-medium">{label}</label>
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8E8E93]">{icon}</div>
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          className={`w-full h-12 bg-[#16161A] border border-[#2C2C2E] rounded-xl pl-11 pr-4 text-white text-[14px] focus:outline-none focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF]/20 transition-all placeholder:text-[#8E8E93]/40 ${mono ? "font-mono tracking-widest text-[13px]" : ""}`}
        />
      </div>
    </div>
  );
}

export function AccountCreation({ onComplete }: AccountCreationProps) {
  const isMobile = useIsMobile();
  const [step, setStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [form, setForm] = useState({
    fullName: '', organization: '', role: '', email: '',
    password: '', confirmPassword: '', mfa: true,
    licenseKey: '', region: '', acceptTerms: false,
    reasonForVisit: '', // kept for interface compat
  });

  const update = (field: string, value: string | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleComplete = () => {
    setCompleting(true);
    setTimeout(() => {
      onComplete({ name: form.fullName || 'Dr. Sarah Chen', org: form.organization || 'Memorial Hospital', role: form.role || 'Neurologist', reasonForVisit: '' });
    }, 1800);
  };

  const steps = [
    { n: 1, label: 'Organization' },
    { n: 2, label: 'Security' },
    { n: 3, label: 'License' },
  ];

  return (
    <div className="w-screen h-screen bg-[#0B0B0D] flex overflow-hidden">

      {/* Left: Brand Panel — hidden on mobile */}
      {!isMobile && (
        <div className="w-[460px] flex-shrink-0 relative flex flex-col p-12 overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.025]"
            style={{
              backgroundImage: 'linear-gradient(#0A84FF 1px, transparent 1px), linear-gradient(90deg, #0A84FF 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }}
          />
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

      {/* Right: Form Panel */}
      <div className={`flex-1 flex flex-col items-center justify-center overflow-auto bg-[#0D0D10] ${isMobile ? 'p-4' : 'p-12'}`}>
        {!completing ? (
          <div className="w-full max-w-[400px]">

            {/* Step indicator */}
            <div className="flex items-center gap-1 mb-10">
              {steps.map((s, i) => (
                <div key={s.n} className="flex items-center gap-1">
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-300 ${
                    s.n === step
                      ? 'bg-[#0A84FF]/10 border border-[#0A84FF]/30'
                      : s.n < step
                      ? 'bg-transparent'
                      : 'bg-transparent'
                  }`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 transition-all duration-300 ${
                      s.n < step ? 'bg-[#0A84FF] text-white' :
                      s.n === step ? 'bg-[#0A84FF] text-white' :
                      'bg-[#1E1E22] border border-[#2C2C2E] text-[#8E8E93]'
                    }`}>
                      {s.n < step ? <Check className="w-2.5 h-2.5" /> : s.n}
                    </div>
                    <span className={`text-[12px] font-medium transition-colors ${
                      s.n === step ? 'text-[#0A84FF]' : s.n < step ? 'text-[#8E8E93]' : 'text-[#8E8E93]/50'
                    }`}>{s.label}</span>
                  </div>
                  {i < 2 && (
                    <div className={`h-px w-5 transition-all duration-500 ${s.n < step ? 'bg-[#0A84FF]/40' : 'bg-[#2C2C2E]'}`} />
                  )}
                </div>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                >
                  <h2 className="text-[26px] font-bold text-white mb-1.5 tracking-tight">Create your account</h2>
                  <p className="text-[14px] text-[#8E8E93] mb-8 leading-relaxed">
                    Enter your organization details to get started.
                  </p>

                  <div className="space-y-4">
                    <FormField icon={<User className="w-4 h-4" />} label="Full Name" placeholder="Dr. Sarah Chen" value={form.fullName} onChange={v => update('fullName', v)} />
                    <FormField icon={<Building2 className="w-4 h-4" />} label="Organization" placeholder="Memorial General Hospital" value={form.organization} onChange={v => update('organization', v)} />
                    <div>
                      <label className="block text-[11px] text-[#8E8E93] tracking-widest mb-2 uppercase font-medium">Clinical Role</label>
                      <div className="relative">
                        <select
                          value={form.role}
                          onChange={e => update('role', e.target.value)}
                          className="w-full h-12 bg-[#16161A] border border-[#2C2C2E] rounded-xl px-4 text-[14px] focus:outline-none focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF]/20 transition-all appearance-none text-white"
                          style={{ colorScheme: 'dark' }}
                        >
                          <option value="" className="text-[#8E8E93]">Select role…</option>
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E8E93] pointer-events-none" />
                      </div>
                    </div>
                    <FormField icon={<Mail className="w-4 h-4" />} label="Work Email" placeholder="s.chen@memorialhospital.org" value={form.email} onChange={v => update('email', v)} type="email" />
                  </div>

                  <button
                    onClick={() => setStep(2)}
                    className="mt-8 w-full h-12 bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white rounded-xl font-semibold text-[14px] flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#0A84FF]/10"
                  >
                    Continue <ArrowRight className="w-4 h-4" />
                  </button>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                >
                  <h2 className="text-[26px] font-bold text-white mb-1.5 tracking-tight">Secure your account</h2>
                  <p className="text-[14px] text-[#8E8E93] mb-8">Set credentials and enable multi-factor authentication.</p>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-[11px] text-[#8E8E93] tracking-widest mb-2 uppercase font-medium">Password</label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E8E93]" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Min. 12 characters"
                          value={form.password}
                          onChange={e => update('password', e.target.value)}
                          className="w-full h-12 bg-[#16161A] border border-[#2C2C2E] rounded-xl pl-11 pr-12 text-white text-[14px] focus:outline-none focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF]/20 transition-all placeholder:text-[#8E8E93]/40"
                        />
                        <button onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8E8E93] hover:text-white transition-colors">
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {form.password.length > 0 && (
                        <div className="mt-2 flex gap-1">
                          {[1, 2, 3, 4].map(i => (
                            <div key={i} className={`h-1 flex-1 rounded-full transition-all ${
                              form.password.length >= i * 4 ? 'bg-[#0A84FF]' : 'bg-[#2C2C2E]'
                            }`} />
                          ))}
                        </div>
                      )}
                    </div>

                    <FormField icon={<Lock className="w-4 h-4" />} label="Confirm Password" placeholder="Re-enter password" value={form.confirmPassword} onChange={v => update('confirmPassword', v)} type="password" />

                    <div className="flex items-center justify-between p-4 bg-[#16161A] rounded-xl border border-[#2C2C2E]">
                      <div>
                        <div className="text-[14px] text-white font-medium">Multi-Factor Authentication</div>
                        <div className="text-[12px] text-[#8E8E93] mt-0.5">Required for HIPAA compliance</div>
                      </div>
                      <button
                        onClick={() => update('mfa', !form.mfa)}
                        className={`w-11 h-6 rounded-full relative transition-colors ${form.mfa ? 'bg-[#0A84FF]' : 'bg-[#2C2C2E]'}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${form.mfa ? 'left-[26px]' : 'left-1'}`} />
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => setStep(3)}
                    className="mt-8 w-full h-12 bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white rounded-xl font-semibold text-[14px] flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#0A84FF]/10"
                  >
                    Continue <ArrowRight className="w-4 h-4" />
                  </button>
                  <button onClick={() => setStep(1)} className="mt-3 w-full text-center text-[13px] text-[#8E8E93] hover:text-white transition-colors">
                    ← Back
                  </button>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                >
                  <h2 className="text-[26px] font-bold text-white mb-1.5 tracking-tight">Enterprise license</h2>
                  <p className="text-[14px] text-[#8E8E93] mb-8">Enter your organization license key and deployment region.</p>

                  <div className="space-y-4">
                    <FormField icon={<Key className="w-4 h-4" />} label="License Key" placeholder="APS-XXXX-XXXX-XXXX-XXXX" value={form.licenseKey} onChange={v => update('licenseKey', v)} mono />
                    <div>
                      <label className="block text-[11px] text-[#8E8E93] tracking-widest mb-2 uppercase font-medium">Deployment Region</label>
                      <div className="relative">
                        <select
                          value={form.region}
                          onChange={e => update('region', e.target.value)}
                          className="w-full h-12 bg-[#16161A] border border-[#2C2C2E] rounded-xl px-4 text-[14px] focus:outline-none focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF]/20 transition-all appearance-none text-white"
                          style={{ colorScheme: 'dark' }}
                        >
                          <option value="">Select region…</option>
                          {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E8E93] pointer-events-none" />
                      </div>
                    </div>

                    <label className="flex items-start gap-3 cursor-pointer group">
                      <button
                        onClick={() => update('acceptTerms', !form.acceptTerms)}
                        className={`w-5 h-5 rounded-md flex-shrink-0 mt-0.5 border flex items-center justify-center transition-all ${
                          form.acceptTerms ? 'bg-[#0A84FF] border-[#0A84FF]' : 'border-[#2C2C2E] bg-[#16161A] group-hover:border-[#0A84FF]/40'
                        }`}
                      >
                        {form.acceptTerms && <Check className="w-3 h-3 text-white" />}
                      </button>
                      <span className="text-[13px] text-[#8E8E93] leading-relaxed">
                        I agree to the <span className="text-[#0A84FF] hover:underline cursor-pointer">Terms of Service</span>,{' '}
                        <span className="text-[#0A84FF] hover:underline cursor-pointer">Privacy Policy</span>, and{' '}
                        <span className="text-[#0A84FF] hover:underline cursor-pointer">HIPAA Business Associate Agreement</span>.
                      </span>
                    </label>
                  </div>

                  <button
                    onClick={handleComplete}
                    disabled={!form.acceptTerms}
                    className="mt-8 w-full h-12 bg-[#0A84FF] hover:bg-[#0A84FF]/90 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-[14px] flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#0A84FF]/10"
                  >
                    Initialize System <ArrowRight className="w-4 h-4" />
                  </button>
                  <button onClick={() => setStep(2)} className="mt-3 w-full text-center text-[13px] text-[#8E8E93] hover:text-white transition-colors">
                    ← Back
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <p className="mt-8 text-center text-[13px] text-[#8E8E93]">
              Already have an account?{' '}
              <span className="text-[#0A84FF] cursor-pointer hover:underline">Sign in</span>
            </p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="flex flex-col items-center gap-6"
          >
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-[#0A84FF]/10 border border-[#0A84FF]/30 flex items-center justify-center">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.15, type: 'spring', stiffness: 260, damping: 20 }}>
                  <Check className="w-9 h-9 text-[#0A84FF]" />
                </motion.div>
              </div>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                className="absolute inset-0 rounded-full border-t-2 border-[#0A84FF]/40"
              />
            </div>
            <div className="text-center">
              <h3 className="text-[22px] font-bold text-white mb-2">System Initializing</h3>
              <p className="text-[14px] text-[#8E8E93]">Establishing secure encrypted connection…</p>
            </div>
            <div className="flex gap-1.5">
              {[0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  animate={{ opacity: [0.2, 1, 0.2] }}
                  transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }}
                  className="w-2 h-2 rounded-full bg-[#0A84FF]"
                />
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
