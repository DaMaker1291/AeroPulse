import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Brain, ChevronRight } from 'lucide-react';

const FACE_CONNECTIONS: [number, number][] = [
  [10,338],[338,297],[297,332],[332,284],[284,251],[251,389],[389,356],[356,454],[454,323],[323,361],[361,288],[288,397],[397,365],[365,379],[379,378],[378,400],[400,377],[377,152],[152,148],[148,176],[176,149],[149,150],[150,136],[136,172],[172,58],[58,132],[132,93],[93,234],[234,127],[127,162],[162,21],[21,54],[54,103],[103,67],[67,109],[109,10],
  [46,53],[53,52],[52,65],[65,55],[70,63],[63,105],[105,66],[66,107],
  [276,283],[283,282],[282,295],[295,285],[300,293],[293,334],[334,296],[296,336],
  [33,7],[7,163],[163,144],[144,145],[145,153],[153,154],[154,155],[155,133],[33,246],[246,161],[161,160],[160,159],[159,158],[158,157],[157,173],[173,133],
  [263,249],[249,390],[390,373],[373,374],[374,380],[380,381],[381,382],[382,362],[263,466],[466,388],[388,387],[387,386],[386,385],[385,384],[384,398],[398,362],
  [61,146],[146,91],[91,181],[181,84],[84,17],[17,314],[314,405],[405,321],[321,375],[375,291],[61,185],[185,40],[40,39],[39,37],[37,0],[0,267],[267,269],[269,270],[270,409],[409,291],
  [78,95],[95,88],[88,178],[178,87],[87,14],[14,317],[317,402],[402,318],[318,324],[324,308],[78,191],[191,80],[80,81],[81,82],[82,13],[13,312],[312,311],[311,310],[310,415],[415,308],
  [168,6],[6,197],[197,195],[195,5],[5,4],[4,1],[1,19],[19,94],[94,2],
  [2,326],[326,327],[327,294],[294,278],[278,279],[279,429],[429,436],[436,437],[437,416],[416,2],
];

interface Page1Props {
  onUnlockNavigation: () => void;
  targetStatus?: 'locked' | 'acquiring' | 'standby';
  streamUrl?: string;
  cameraStream?: MediaStream | null;
  faceLandmarksRef?: React.MutableRefObject<Array<{ x: number; y: number; z?: number }> | null>;
}

const questions = [
  { id: 1, text: "Are you experiencing any acute pain, numbness, or muscle weakness today?", category: "Motor Function" },
  { id: 2, text: "Have you noticed any recent changes in your balance or coordination?", category: "Vestibular" },
  { id: 3, text: "Do you experience tremors or involuntary muscle movements?", category: "Neuromuscular" },
  { id: 4, text: "Have you had difficulty with fine motor tasks like writing or buttoning clothes?", category: "Dexterity" },
];

export function Page1AdaptiveIntake({ onUnlockNavigation, targetStatus: propTargetStatus, streamUrl, cameraStream, faceLandmarksRef }: Page1Props) {
  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [targetStatus, setTargetStatus] = useState<'acquiring' | 'locked' | 'standby'>(propTargetStatus ?? 'standby');
  const [panValue, setPanValue] = useState(50);
  const [tiltValue, setTiltValue] = useState(50);
  const [aiConfidence, setAiConfidence] = useState(0.74);
  const [scanAngle, setScanAngle] = useState(0);
  const [streamError, setStreamError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rotInterval = setInterval(() => {
      setScanAngle(a => (a + 0.8) % 360);
    }, 30);
    return () => clearInterval(rotInterval);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = viewportRef.current;
    if (!canvas || !container) return;
    let id = 0;
    const draw = () => {
      id = requestAnimationFrame(draw);
      const lms = faceLandmarksRef?.current;
      if (!lms || lms.length === 0) return;
      const rect = container.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(48, 209, 88, 0.3)';
      ctx.lineWidth = 0.6;
      for (const [i, j] of FACE_CONNECTIONS) {
        const a = lms[i]; const b = lms[j];
        if (a && b) { ctx.beginPath(); ctx.moveTo(a.x * w, a.y * h); ctx.lineTo(b.x * w, b.y * h); ctx.stroke(); }
      }
      ctx.fillStyle = 'rgba(48, 209, 88, 0.5)';
      for (const p of lms) { ctx.beginPath(); ctx.arc(p.x * w, p.y * h, 1, 0, 2 * Math.PI); ctx.fill(); }
    };
    id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, [faceLandmarksRef]);

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
        <div ref={viewportRef} className="flex-1 mx-5 mt-4 mb-4 bg-[#0B0B0D] rounded-xl relative overflow-hidden border border-[#1E1E22]">
          {/* Live camera feed */}
          {cameraStream && (
            <video
              ref={videoRef}
              autoPlay playsInline muted
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: 'brightness(0.9) contrast(1.05)' }}
            />
          )}
          {/* Face mesh overlay */}
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-10" />
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
