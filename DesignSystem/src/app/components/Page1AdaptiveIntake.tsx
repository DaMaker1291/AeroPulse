import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Brain, ChevronRight } from 'lucide-react';

interface Page1Props {
  onUnlockNavigation: () => void;
  targetStatus?: 'locked' | 'acquiring' | 'standby';
  streamUrl?: string;
  cameraStream?: MediaStream | null;
}

const questions = [
  { id: 1, text: "Are you experiencing any acute pain, numbness, or muscle weakness today?", category: "Motor Function" },
  { id: 2, text: "Have you noticed any recent changes in your balance or coordination?", category: "Vestibular" },
  { id: 3, text: "Do you experience tremors or involuntary muscle movements?", category: "Neuromuscular" },
  { id: 4, text: "Have you had difficulty with fine motor tasks like writing or buttoning clothes?", category: "Dexterity" },
];

export function Page1AdaptiveIntake({ onUnlockNavigation, targetStatus: propTargetStatus }: Page1Props) {
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [targetStatus, setTargetStatus] = useState<'acquiring' | 'locked' | 'standby'>(propTargetStatus ?? 'standby');
  const [panValue, setPanValue] = useState(50);
  const [tiltValue, setTiltValue] = useState(50);
  const [aiConfidence, setAiConfidence] = useState(0.74);
  const [scanAngle, setScanAngle] = useState(0);
  const [streamError, setStreamError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const rotInterval = setInterval(() => {
      setScanAngle(a => (a + 0.8) % 360);
    }, 30);
    return () => clearInterval(rotInterval);
  }, []);

  useEffect(() => {
    if (propTargetStatus === 'locked') {
      setTargetStatus('locked');
      onUnlockNavigation();
      return;
    }
    if (propTargetStatus === 'acquiring') {
      setTargetStatus('acquiring');
      return;
    }
    const timer = setTimeout(() => {
      setTargetStatus('acquiring');
      setTimeout(() => {
        setTargetStatus('locked');
        onUnlockNavigation();
      }, 2200);
    }, 2800);
    return () => clearTimeout(timer);
  }, [propTargetStatus]);

  const handleAnswer = (answer: string) => {
    setAnswers(prev => [...prev, answer]);
    if (currentQ < questions.length - 1) {
      setCurrentQ(currentQ + 1);
      setAiConfidence(prev => Math.min(0.97, prev + 0.05 + Math.random() * 0.02));
    }
  };

  const progress = ((currentQ) / questions.length) * 100;

  const statusColor = {
    locked: '#30D158',
    acquiring: '#FF9F0A',
    standby: '#8E8E93',
  }[targetStatus];

  const statusLabel = {
    locked: 'TARGET LOCKED — OPTICAL STABLE',
    acquiring: 'ACQUIRING — HOLD POSITION',
    standby: 'STANDBY — AWAITING SIGNAL',
  }[targetStatus];

  return (
    <div className="flex gap-4 h-full">

      {/* Left: AI Clinical Screener */}
      <div className="flex-1 bg-[#16161A] rounded-2xl border border-[#1E1E22] flex flex-col overflow-hidden">

        {/* Card header */}
        <div className="px-6 pt-5 pb-4 border-b border-[#1E1E22] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-[#0A84FF]/15 border border-[#0A84FF]/20 flex items-center justify-center">
              <Brain className="w-3.5 h-3.5 text-[#0A84FF]" />
            </div>
            <span className="text-[13px] font-semibold text-white">AI Adaptive Clinical Screener</span>
          </div>

          {/* AI Confidence badge */}
          <div className="flex items-center gap-2.5 bg-[#0B0B0D] px-4 py-2 rounded-xl border border-[#2C2C2E]">
            <div className="w-1.5 h-1.5 rounded-full bg-[#30D158]" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
            <span className="text-[10px] text-[#8E8E93] tracking-widest uppercase font-medium">AI Confidence</span>
            <span className="text-[22px] font-bold text-white font-mono leading-none ml-1">{aiConfidence.toFixed(2)}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-0.5 bg-[#1E1E22]">
          <motion.div
            className="h-full bg-[#0A84FF]"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>

        {/* Question counter */}
        <div className="px-6 pt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#8E8E93] tracking-widest uppercase font-medium">Question</span>
            <span className="text-[10px] font-mono text-[#0A84FF] font-bold">{String(currentQ + 1).padStart(2, '0')}</span>
            <span className="text-[10px] text-[#8E8E93]/50">/ {String(questions.length).padStart(2, '0')}</span>
          </div>
          <span className="text-[10px] text-[#8E8E93] tracking-widest uppercase font-medium bg-[#0B0B0D] px-2.5 py-1 rounded-lg border border-[#2C2C2E]">
            {questions[currentQ].category}
          </span>
        </div>

        {/* Question */}
        <div className="flex-1 flex items-center justify-center px-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentQ}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="max-w-xl text-center"
            >
              <p className="text-[22px] font-semibold text-white leading-relaxed tracking-tight">
                {questions[currentQ].text}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Answer buttons */}
        <div className="px-6 pb-6 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Yes', value: 'yes', style: 'border-2 border-[#30D158]/40 bg-[#30D158]/5 text-white hover:bg-[#30D158]/10 hover:border-[#30D158]' },
              { label: 'No', value: 'no', style: 'bg-[#0A84FF] text-white hover:bg-[#0A84FF]/90' },
              { label: "Don't Know", value: 'idk', style: 'border border-[#2C2C2E] bg-[#0B0B0D] text-[#8E8E93] hover:bg-[#1E1E22] hover:text-white' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => handleAnswer(opt.value)}
                className={`h-14 rounded-xl font-semibold text-[14px] transition-all duration-150 ${opt.style}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Status strip */}
          <div className="flex items-center justify-between bg-[#0B0B0D] rounded-xl px-4 py-2.5 border border-[#1E1E22]">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#FF9F0A]" />
              <span className="text-[10px] text-[#8E8E93] tracking-widest uppercase font-medium">Hardware Calibration</span>
            </div>
            <span className="text-[10px] font-mono font-bold text-[#FF9F0A] tracking-wider">STANDBY</span>
          </div>
        </div>
      </div>

      {/* Right: Optical Targeting Viewport */}
      <div className="flex-1 bg-[#16161A] rounded-2xl border border-[#1E1E22] flex flex-col overflow-hidden">

        {/* Card header */}
        <div className="px-6 pt-5 pb-4 border-b border-[#1E1E22] flex items-center justify-between">
          <span className="text-[13px] font-semibold text-white">Optical Targeting Viewport</span>
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
            <span style={{ color: statusColor }} className="tracking-widest uppercase font-bold">{statusLabel}</span>
          </div>
        </div>

        {/* Viewport */}
        <div className="flex-1 mx-5 mt-4 mb-4 bg-[#0B0B0D] rounded-xl relative overflow-hidden border border-[#1E1E22]">
          {/* Live camera feed */}
          {cameraStream && (
            <video
              ref={videoRef}
              srcObject={cameraStream}
              autoPlay playsInline muted
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: 'brightness(0.9) contrast(1.05)' }}
            />
          )}
          {/* Gradient atmosphere */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#0A84FF]/5 via-transparent to-[#30D158]/3" />

          {/* Corner brackets */}
          {[
            'top-3 left-3 border-t-2 border-l-2 rounded-tl',
            'top-3 right-3 border-t-2 border-r-2 rounded-tr',
            'bottom-3 left-3 border-b-2 border-l-2 rounded-bl',
            'bottom-3 right-3 border-b-2 border-r-2 rounded-br',
          ].map((cls, i) => (
            <div key={i} className={`absolute w-5 h-5 ${cls}`} style={{ borderColor: `${statusColor}60` }} />
          ))}

          {/* Scan lines */}
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: 'repeating-linear-gradient(0deg, #0A84FF 0px, #0A84FF 1px, transparent 1px, transparent 4px)',
          }} />

          {/* Grid overlay */}
          <div className="absolute inset-0 opacity-[0.04]" style={{
            backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }} />

          {/* Reticle */}
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              animate={{
                opacity: targetStatus === 'locked' ? 1 : targetStatus === 'acquiring' ? 0.8 : 0.4,
                scale: targetStatus === 'standby' ? 1.08 : 1,
              }}
              transition={{ duration: 0.5 }}
              className="relative w-52 h-52"
            >
              <svg className="w-full h-full" viewBox="0 0 120 120">
                {/* Outer dashed ring */}
                <circle
                  cx="60" cy="60" r="54"
                  fill="none"
                  stroke={statusColor}
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  opacity="0.5"
                  style={{
                    transformOrigin: '60px 60px',
                    transform: `rotate(${scanAngle}deg)`,
                  }}
                />
                {/* Inner solid ring */}
                <circle cx="60" cy="60" r="36" fill="none" stroke={statusColor} strokeWidth="1.5" opacity="0.8" />
                {/* Center dot */}
                <circle cx="60" cy="60" r="2.5" fill={statusColor} />

                {/* Crosshairs */}
                <line x1="60" y1="10" x2="60" y2="24" stroke={statusColor} strokeWidth="1.5" strokeLinecap="round" />
                <line x1="60" y1="96" x2="60" y2="110" stroke={statusColor} strokeWidth="1.5" strokeLinecap="round" />
                <line x1="10" y1="60" x2="24" y2="60" stroke={statusColor} strokeWidth="1.5" strokeLinecap="round" />
                <line x1="96" y1="60" x2="110" y2="60" stroke={statusColor} strokeWidth="1.5" strokeLinecap="round" />

                {/* Tick marks */}
                {[30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360].map(angle => {
                  const r = 54;
                  const x1 = 60 + r * Math.cos((angle * Math.PI) / 180);
                  const y1 = 60 + r * Math.sin((angle * Math.PI) / 180);
                  const x2 = 60 + (r - 5) * Math.cos((angle * Math.PI) / 180);
                  const y2 = 60 + (r - 5) * Math.sin((angle * Math.PI) / 180);
                  return <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2} stroke={statusColor} strokeWidth="1" opacity="0.4" />;
                })}

                {/* Locked face mesh */}
                {targetStatus === 'locked' && (
                  <>
                    <path d="M42,48 L60,44 L78,48 M38,60 L60,57 L82,60 M42,72 L60,76 L78,72" stroke="#30D158" strokeWidth="0.8" fill="none" opacity="0.7" />
                    <circle cx="50" cy="52" r="2" fill="#30D158" opacity="0.9" />
                    <circle cx="70" cy="52" r="2" fill="#30D158" opacity="0.9" />
                    <path d="M54,68 Q60,72 66,68" stroke="#30D158" strokeWidth="0.8" fill="none" opacity="0.8" />
                  </>
                )}
              </svg>
            </motion.div>
          </div>

          {/* Data readouts */}
          <div className="absolute top-3 left-3 right-3 flex justify-between">
            <div className="bg-[#0B0B0D]/80 backdrop-blur px-2.5 py-1.5 rounded-lg border border-[#1E1E22]">
              <span className="text-[9px] font-mono text-[#8E8E93]">PAN</span>
              <span className="text-[10px] font-mono text-white ml-2">{panValue}°</span>
            </div>
            <div className="bg-[#0B0B0D]/80 backdrop-blur px-2.5 py-1.5 rounded-lg border border-[#1E1E22]">
              <span className="text-[9px] font-mono text-[#8E8E93]">TILT</span>
              <span className="text-[10px] font-mono text-white ml-2">{tiltValue}°</span>
            </div>
          </div>
        </div>

        {/* Motor controls */}
        <div className="px-5 pb-5 space-y-4">
          {[
            { label: 'Tower Panning', sub: 'Motor 1', value: panValue, set: setPanValue },
            { label: 'Device Tilting', sub: 'Motor 2', value: tiltValue, set: setTiltValue },
          ].map(ctrl => (
            <div key={ctrl.label}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-[#8E8E93] tracking-widest uppercase">{ctrl.label}</span>
                  <span className="text-[10px] text-[#8E8E93]/50 font-mono">{ctrl.sub}</span>
                </div>
                <span className="text-[11px] font-mono text-[#0A84FF] font-bold">{ctrl.value}°</span>
              </div>
              <div className="relative h-2 bg-[#1E1E22] rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-[#0A84FF] rounded-full"
                  style={{ width: `${ctrl.value}%` }}
                />
              </div>
              <input
                type="range" min="0" max="100" value={ctrl.value}
                onChange={e => ctrl.set(Number(e.target.value))}
                className="w-full h-2 opacity-0 -mt-2 cursor-pointer relative z-10"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
