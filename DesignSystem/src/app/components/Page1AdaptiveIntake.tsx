import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Brain, ChevronRight } from 'lucide-react';
import { FACE_MESH_CONNECTIONS } from '../../cameraPipeline';
import { useIsMobile } from './ui/use-mobile';

interface PatientInfo {
  reasonForVisit: string;
  age: string;
  gender: string;
}

interface Page1Props {
  onUnlockNavigation: () => void;
  targetStatus?: 'locked' | 'acquiring' | 'standby';
  streamUrl?: string;
  cameraStream?: MediaStream | null;
  faceMesh?: number[] | null;
  onPatientInfo?: (info: PatientInfo) => void;
  patientInfo?: PatientInfo;
}

const questions = [
  { id: 1, text: "Are you experiencing any acute pain, numbness, or muscle weakness today? If yes, describe onset, location, severity (1-10), and duration.", category: "Motor Function" },
  { id: 2, text: "Have you noticed any recent changes in your balance or coordination? Any falls or near-falls in the past month?", category: "Vestibular" },
  { id: 3, text: "Do you experience tremors or involuntary muscle movements? At rest or with action? Affecting one or both sides?", category: "Neuromuscular" },
  { id: 4, text: "Have you had difficulty with fine motor tasks like writing, buttoning clothes, or picking up small objects? Any change in handwriting?", category: "Dexterity" },
  { id: 5, text: "Any unexplained weight loss (>5% in 6 months), night sweats, or persistent fever? Any new lumps, moles, or skin changes?", category: "Constitutional" },
  { id: 6, text: "Do you have a history of hypertension, diabetes, heart disease, or stroke? Any current medications (anticoagulants, beta-blockers)?", category: "Medical History" },
];

const MESH_COLOR = '#30D158';
const MESH_LINE_WIDTH = 1.5;
const MESH_DOT_RADIUS = 2;

export function Page1AdaptiveIntake({ onUnlockNavigation, targetStatus: propTargetStatus, streamUrl, cameraStream, faceMesh, onPatientInfo, patientInfo }: Page1Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const meshRef = useRef<number[] | null>(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [targetStatus, setTargetStatus] = useState<'acquiring' | 'locked' | 'standby'>(propTargetStatus ?? 'standby');
  const [localReason, setLocalReason] = useState(patientInfo?.reasonForVisit || '');
  const [localAge, setLocalAge] = useState(patientInfo?.age || '');
  const [localGender, setLocalGender] = useState(patientInfo?.gender || '');
  const [showPatientForm, setShowPatientForm] = useState(true);
  const [panValue, setPanValue] = useState(50);
  const [tiltValue, setTiltValue] = useState(50);
  const [aiConfidence, setAiConfidence] = useState(0.74);
  const [scanAngle, setScanAngle] = useState(0);
  const [streamError, setStreamError] = useState(false);

  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  // Face mesh render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match container
    const parent = canvas.parentElement;
    if (!parent) return;
    const resize = () => {
      const rect = parent.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    let animId: number;
    const draw = () => {
      const mesh = meshRef.current;
      const cw = canvas.width;
      const ch = canvas.height;
      ctx.clearRect(0, 0, cw, ch);
      if (mesh && mesh.length >= 478 * 2) {
        ctx.strokeStyle = MESH_COLOR;
        ctx.lineWidth = MESH_LINE_WIDTH;
        ctx.fillStyle = MESH_COLOR;
        ctx.globalAlpha = 0.85;

        // Draw connections
        for (const contour of FACE_MESH_CONNECTIONS) {
          ctx.beginPath();
          for (let i = 0; i < contour.length; i++) {
            const idx = contour[i];
            const x = mesh[idx * 2] * cw;
            const y = mesh[idx * 2 + 1] * ch;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }

        // Draw landmark dots
        ctx.globalAlpha = 0.6;
        for (let i = 0; i < 478; i++) {
          const x = mesh[i * 2] * cw;
          const y = mesh[i * 2 + 1] * ch;
          ctx.beginPath();
          ctx.arc(x, y, MESH_DOT_RADIUS, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      animId = requestAnimationFrame(draw);
    };
    animId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, []);

  // Sync faceMesh prop to ref for render loop
  useEffect(() => {
    meshRef.current = faceMesh ?? null;
  }, [faceMesh]);

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

  const isMobile = useIsMobile();

  return (
    <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">

      {/* AI Clinical Screener — 2/3 on desktop, full on mobile */}
      <div className="bg-[#16161A] rounded-2xl border border-[#1E1E22] flex flex-col overflow-y-auto w-full lg:flex-[2] min-w-0">

        {/* Card header */}
        <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-[#1E1E22] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-lg bg-[#0A84FF]/15 border border-[#0A84FF]/20 flex items-center justify-center">
              <Brain className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#0A84FF]" />
            </div>
            <span className="text-[12px] sm:text-[13px] font-semibold text-white">AI Clinical Screener</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2.5 bg-[#0B0B0D] px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl border border-[#2C2C2E]">
            <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-[#30D158]" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
            <span className="text-[8px] sm:text-[10px] text-[#8E8E93] tracking-widest uppercase font-medium">Confidence</span>
            <span className="text-[16px] sm:text-[22px] font-bold text-white font-mono leading-none ml-0.5 sm:ml-1">{aiConfidence.toFixed(2)}</span>
          </div>
        </div>

        {/* Patient info form */}
        {showPatientForm && (
          <div className="px-4 sm:px-6 pt-3 sm:pt-4 pb-2 sm:pb-3 border-b border-[#1E1E22]">
            <div className={`grid ${isMobile ? 'grid-cols-2' : 'grid-cols-3'} gap-2 sm:gap-3 mb-2 sm:mb-3`}>
              <div>
                <label className="block text-[8px] sm:text-[9px] text-[#8E8E93] tracking-widest uppercase font-medium mb-1">Age</label>
                <input
                  type="number" min={0} max={130} placeholder="e.g. 45"
                  value={localAge}
                  onChange={e => { setLocalAge(e.target.value); onPatientInfo?.({ reasonForVisit: localReason, age: e.target.value, gender: localGender }); }}
                  className="w-full h-8 sm:h-9 bg-[#0B0B0D] border border-[#2C2C2E] rounded-lg px-2 sm:px-3 text-white text-[12px] sm:text-[13px] focus:outline-none focus:border-[#0A84FF] transition-all placeholder:text-[#8E8E93]/40"
                />
              </div>
              <div>
                <label className="block text-[8px] sm:text-[9px] text-[#8E8E93] tracking-widest uppercase font-medium mb-1">Gender</label>
                <select
                  value={localGender}
                  onChange={e => { setLocalGender(e.target.value); onPatientInfo?.({ reasonForVisit: localReason, age: localAge, gender: e.target.value }); }}
                  className="w-full h-8 sm:h-9 bg-[#0B0B0D] border border-[#2C2C2E] rounded-lg px-2 sm:px-3 text-white text-[12px] sm:text-[13px] focus:outline-none focus:border-[#0A84FF] transition-all appearance-none"
                >
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              {!isMobile && (
                <div className="flex items-end">
                  <button
                    onClick={() => setShowPatientForm(false)}
                    className="h-8 sm:h-9 px-2 sm:px-3 rounded-lg bg-[#0A84FF]/10 border border-[#0A84FF]/20 text-[#0A84FF] text-[10px] sm:text-[11px] font-semibold hover:bg-[#0A84FF]/20 transition-colors"
                  >
                    Done ✓
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <label className="block text-[8px] sm:text-[9px] text-[#8E8E93] tracking-widest uppercase font-medium mb-1">Reason for Visit</label>
                <textarea
                  placeholder="e.g., Chest pain, shortness of breath..."
                  value={localReason}
                  onChange={e => { setLocalReason(e.target.value); onPatientInfo?.({ reasonForVisit: e.target.value, age: localAge, gender: localGender }); }}
                  rows={isMobile ? 1 : 2}
                  className="w-full bg-[#0B0B0D] border border-[#2C2C2E] rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-white text-[12px] sm:text-[13px] focus:outline-none focus:border-[#0A84FF] transition-all placeholder:text-[#8E8E93]/40 resize-none"
                />
              </div>
              {isMobile && (
                <button
                  onClick={() => setShowPatientForm(false)}
                  className="h-8 mt-5 px-3 rounded-lg bg-[#0A84FF]/10 border border-[#0A84FF]/20 text-[#0A84FF] text-[10px] font-semibold hover:bg-[#0A84FF]/20 transition-colors whitespace-nowrap"
                >
                  Done
                </button>
              )}
            </div>
          </div>
        )}

        {/* Progress bar */}
        <div className="h-0.5 bg-[#1E1E22]">
          <motion.div
            className="h-full bg-[#0A84FF]"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>

        {/* Question counter */}
        <div className="px-4 sm:px-6 pt-3 sm:pt-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-[9px] sm:text-[10px] text-[#8E8E93] tracking-widest uppercase font-medium">Q</span>
            <span className="text-[9px] sm:text-[10px] font-mono text-[#0A84FF] font-bold">{String(currentQ + 1).padStart(2, '0')}</span>
            <span className="text-[9px] sm:text-[10px] text-[#8E8E93]/50">/ {String(questions.length).padStart(2, '0')}</span>
          </div>
          <span className="text-[9px] sm:text-[10px] text-[#8E8E93] tracking-widest uppercase font-medium bg-[#0B0B0D] px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg border border-[#2C2C2E]">
            {questions[currentQ].category}
          </span>
        </div>

        {/* Question */}
        <div className={`flex items-center justify-center ${isMobile ? 'px-3 py-3' : 'flex-1 px-8'}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={currentQ}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="text-center w-full max-w-3xl"
            >
              <p className={`font-semibold text-white leading-relaxed tracking-tight ${isMobile ? 'text-[15px]' : 'text-[22px]'}`}>
                {questions[currentQ].text}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Answer buttons */}
        <div className={`space-y-3 sm:space-y-4 ${isMobile ? 'px-3 pb-3' : 'px-6 pb-6'}`}>
          <div className={`grid grid-cols-3 gap-2 sm:gap-3`}>
            {[
              { label: 'Yes', value: 'yes', style: 'border-2 border-[#30D158]/40 bg-[#30D158]/5 text-white hover:bg-[#30D158]/10 hover:border-[#30D158]' },
              { label: 'No', value: 'no', style: 'bg-[#0A84FF] text-white hover:bg-[#0A84FF]/90' },
              { label: "Don't Know", value: 'idk', style: 'border border-[#2C2C2E] bg-[#0B0B0D] text-[#8E8E93] hover:bg-[#1E1E22] hover:text-white' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => handleAnswer(opt.value)}
                className={`${isMobile ? 'h-11 text-[12px]' : 'h-14 text-[14px]'} rounded-xl font-semibold transition-all duration-150 ${opt.style}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Status strip */}
          <div className="flex items-center justify-between bg-[#0B0B0D] rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 border border-[#1E1E22]">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-[#FF9F0A]" />
              <span className="text-[9px] sm:text-[10px] text-[#8E8E93] tracking-widest uppercase font-medium">Calibration</span>
            </div>
            <span className="text-[9px] sm:text-[10px] font-mono font-bold text-[#FF9F0A] tracking-wider">STANDBY</span>
          </div>
        </div>
      </div>

      {/* Optical Targeting Viewport — 1/3 on desktop, full on mobile */}
      <div className="bg-[#16161A] rounded-2xl border border-[#1E1E22] flex flex-col overflow-hidden w-full lg:flex-[1] min-w-0 min-h-[200px] lg:min-h-0">

        {/* Card header */}
        <div className="px-4 sm:px-6 pt-3 sm:pt-5 pb-2 sm:pb-4 border-b border-[#1E1E22] flex items-center justify-between">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-[11px] sm:text-[13px] font-semibold text-white">Optical Viewport</span>
            <div className="flex items-center gap-1 sm:gap-2 text-[8px] sm:text-[10px] font-mono">
              <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
              <span style={{ color: statusColor }} className="tracking-widest uppercase font-bold">{statusLabel}</span>
            </div>
          </div>
        </div>

        {/* Viewport */}
        <div className={`flex-1 ${isMobile ? 'mx-3 mt-2 mb-3' : 'mx-5 mt-4 mb-4'} bg-[#0B0B0D] rounded-xl relative overflow-hidden border border-[#1E1E22]`}>
          {/* Live camera feed */}
          {cameraStream && (
            <video
              ref={videoRef}
              autoPlay playsInline muted
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: 'brightness(0.9) contrast(1.05)', transform: 'scaleX(-1)' }}
            />
          )}
          {/* Face mesh overlay canvas (flipped to match mirrored video) */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ transform: 'scaleX(-1)' }}
          />
          {/* Gradient atmosphere */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#0A84FF]/5 via-transparent to-[#30D158]/3 pointer-events-none" />

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
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
            backgroundImage: 'repeating-linear-gradient(0deg, #0A84FF 0px, #0A84FF 1px, transparent 1px, transparent 4px)',
          }} />

          {/* Grid overlay */}
          <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{
            backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }} />

          {/* Reticle */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <motion.div
              animate={{
                opacity: targetStatus === 'locked' ? 1 : targetStatus === 'acquiring' ? 0.8 : 0.4,
                scale: targetStatus === 'standby' ? 1.08 : 1,
              }}
              transition={{ duration: 0.5 }}
              className={`relative ${isMobile ? 'w-36 h-36' : 'w-52 h-52'}`}
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
          <div className="absolute top-2 left-2 right-2 flex justify-between pointer-events-none">
            <div className="bg-[#0B0B0D]/80 backdrop-blur px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-lg border border-[#1E1E22]">
              <span className="text-[7px] sm:text-[9px] font-mono text-[#8E8E93]">PAN</span>
              <span className="text-[8px] sm:text-[10px] font-mono text-white ml-1">{panValue}°</span>
            </div>
            <div className="bg-[#0B0B0D]/80 backdrop-blur px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-lg border border-[#1E1E22]">
              <span className="text-[7px] sm:text-[9px] font-mono text-[#8E8E93]">TILT</span>
              <span className="text-[8px] sm:text-[10px] font-mono text-white ml-1">{tiltValue}°</span>
            </div>
          </div>
        </div>

        {/* Motor controls - hide on mobile to save space */}
        {!isMobile && (
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
        )}
      </div>
    </div>
  );
}
