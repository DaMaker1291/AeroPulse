import { useState, useEffect } from 'react';
import { motion } from 'motion/react';

interface Page1Props {
  onUnlockNavigation: () => void;
  videoSrc: string;
  targetStatus: 'standby' | 'acquiring' | 'locked';
  aiConfidence: number;
  sendWs: (cmd: string, data?: any) => void;
}

export function Page1AdaptiveIntake({
  onUnlockNavigation,
  videoSrc,
  targetStatus,
  aiConfidence,
  sendWs
}: Page1Props) {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [panValue, setPanValue] = useState(50);
  const [tiltValue, setTiltValue] = useState(50);

  const questions = [
    "Are you experiencing any acute pain, numbness, or muscle weakness today?",
    "Have you noticed any recent changes in your balance or coordination?",
    "Do you experience tremors or involuntary muscle movements?",
    "Have you had any difficulty with fine motor tasks like writing or buttoning clothes?"
  ];

  const handleAnswer = (answer: string) => {
    const updatedAnswers = [...answers, answer];
    setAnswers(updatedAnswers);
    sendWs("SET_ANSWERS", { answers: updatedAnswers });

    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    }
  };

  // Dispatch Pan/Tilt controls remotely
  useEffect(() => {
    sendWs("PAN_TILT", { pan: panValue, tilt: tiltValue });
  }, [panValue, tiltValue]);

  // Lock navigation based on real face trackers 
  useEffect(() => {
    if (targetStatus === 'locked' && answers.length >= questions.length) {
      onUnlockNavigation();
    }
  }, [targetStatus, answers, onUnlockNavigation]);

  return (
    <div className="flex flex-col lg:flex-row gap-5 h-full min-h-0">
      {/* Left Container: AI Adaptive Clinical Screener */}
      <div className="flex-1 min-w-0 bg-[#16161A] rounded-xl p-4 sm:p-6 flex flex-col min-h-0">
        {/* Header with AI Confidence (fixed) */}
        <div className="flex-shrink-0 mb-4 sm:mb-6">
          <div className="inline-flex items-center gap-2 bg-[#0B0B0D] px-3 sm:px-4 py-2 rounded-lg border border-[#2C2C2E]">
            <div className="w-2 h-2 rounded-full bg-[#30D158] animate-pulse"></div>
            <span className="text-[10px] sm:text-[11px] text-[#8E8E93] tracking-wider uppercase">AI Confidence Index</span>
            <span className="text-[18px] sm:text-[24px] font-medium text-white ml-2">{aiConfidence.toFixed(2)}</span>
          </div>
        </div>

        {/* Main Question (scrollable if needed) */}
        <div className="flex-1 flex items-center justify-center min-h-0 overflow-auto py-2 sm:py-4">
          <motion.div
            key={currentQuestion}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="max-w-lg w-full"
          >
            <h2 className="text-[18px] sm:text-[24px] font-medium text-white leading-relaxed text-center break-words">
              {questions[currentQuestion]}
            </h2>
          </motion.div>
        </div>

        {/* Answer Buttons (fixed) */}
        <div className="flex-shrink-0 flex flex-col sm:flex-row gap-2 sm:gap-4 justify-center mb-4 sm:mb-6">
          <button
            onClick={() => handleAnswer('yes')}
            className="w-full sm:w-44 h-12 sm:h-16 rounded-xl bg-[#16161A] border-2 border-[#30D158] text-white hover:bg-[#30D158]/10 transition-all duration-150 text-[14px] sm:text-[16px]"
          >
            YES
          </button>
          <button
            onClick={() => handleAnswer('no')}
            className="w-full sm:w-44 h-12 sm:h-16 rounded-xl bg-[#0A84FF] text-white hover:bg-[#0A84FF]/90 transition-all duration-150 text-[14px] sm:text-[16px]"
          >
            NO
          </button>
          <button
            onClick={() => handleAnswer('idk')}
            className="w-full sm:w-44 h-12 sm:h-16 rounded-xl bg-[#16161A] border-2 border-[#2C2C2E] text-[#8E8E93] hover:bg-[#2C2C2E]/30 transition-all duration-150 text-[14px] sm:text-[16px]"
          >
            I DON'T KNOW
          </button>
        </div>

        {/* Status Indicator (fixed) */}
        <div className="flex-shrink-0 bg-[#0B0B0D] rounded-lg px-4 py-3 border border-[#2C2C2E]">
          <div className="text-[10px] sm:text-[11px] text-[#8E8E93] tracking-wider">
            TARGET HARDWARE CALIBRATION STATUS: <span className="text-[#FF9F0A]">STANDBY</span>
          </div>
        </div>
      </div>

      {/* Right Container: Targeting Viewport */}
      <div className="flex-1 min-w-0 bg-[#16161A] rounded-xl p-4 sm:p-6 flex flex-col min-h-0">
        {/* Camera Viewport */}
        <div className="flex-1 min-h-0 bg-[#0B0B0D] rounded-lg relative overflow-hidden mb-4 border border-[#2C2C2E]">
          {/* Simulated Camera View */}
          {videoSrc ? (
            <img src={videoSrc} className="absolute inset-0 w-full h-full object-cover" alt="SaMD Clinical Camera" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a2e] via-[#0B0B0D] to-[#16161A]"></div>
          )}

          {/* Targeting Reticle */}
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              animate={{
                opacity: targetStatus === 'locked' ? 1 : targetStatus === 'acquiring' ? 0.7 : 0.4,
                scale: targetStatus === 'locked' ? 1 : targetStatus === 'acquiring' ? 1.05 : 1.1
              }}
              transition={{ duration: 0.3 }}
              className="relative w-48 h-48"
            >
              {/* Circular Reticle */}
              <svg className="w-full h-full" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke={targetStatus === 'locked' ? '#30D158' : targetStatus === 'acquiring' ? '#FF9F0A' : '#8E8E93'}
                  strokeWidth="2"
                  strokeDasharray="5,5"
                  className={targetStatus === 'acquiring' ? 'animate-spin' : ''}
                  style={{ animationDuration: '4s' }}
                />
                <line x1="50" y1="10" x2="50" y2="25" stroke={targetStatus === 'locked' ? '#30D158' : '#8E8E93'} strokeWidth="2" />
                <line x1="50" y1="75" x2="50" y2="90" stroke={targetStatus === 'locked' ? '#30D158' : '#8E8E93'} strokeWidth="2" />
                <line x1="10" y1="50" x2="25" y2="50" stroke={targetStatus === 'locked' ? '#30D158' : '#8E8E93'} strokeWidth="2" />
                <line x1="75" y1="50" x2="90" y2="50" stroke={targetStatus === 'locked' ? '#30D158' : '#8E8E93'} strokeWidth="2" />
                <circle cx="50" cy="50" r="3" fill={targetStatus === 'locked' ? '#30D158' : '#8E8E93'} />
              </svg>

              {/* Face Mesh Overlay (when locked) */}
              {targetStatus === 'locked' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute inset-0"
                >
                  <svg className="w-full h-full" viewBox="0 0 100 100">
                    {/* Simplified geometric mesh */}
                    <path d="M30,40 L50,35 L70,40 M25,50 L50,48 L75,50 M30,60 L50,62 L70,60" stroke="#30D158" strokeWidth="0.5" fill="none" opacity="0.6" />
                    <circle cx="40" cy="45" r="2" fill="#30D158" opacity="0.8" />
                    <circle cx="60" cy="45" r="2" fill="#30D158" opacity="0.8" />
                  </svg>
                </motion.div>
              )}
            </motion.div>
          </div>

          {/* Status Overlay */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
            <div className={`px-6 py-2 rounded-full text-[14px] font-medium ${targetStatus === 'locked'
              ? 'bg-[#30D158]/20 text-[#30D158] border border-[#30D158]'
              : targetStatus === 'acquiring'
                ? 'bg-[#FF9F0A]/20 text-[#FF9F0A] border border-[#FF9F0A] animate-pulse'
                : 'bg-[#8E8E93]/20 text-[#8E8E93] border border-[#8E8E93]'
              }`}>
              {targetStatus === 'locked' && 'TARGET LOCKED: OPTICAL COMPLIANCE STABLE'}
              {targetStatus === 'acquiring' && 'ACQUIRING (Improve lighting / hold steady)'}
              {targetStatus === 'standby' && 'STANDBY - AWAITING SIGNAL'}
            </div>
          </div>
        </div>

        {/* Motor Control Sliders */}
        <div className="flex-shrink-0 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div>
            <label className="block text-[10px] sm:text-[11px] text-[#8E8E93] tracking-wider mb-2 uppercase">
              Tower Panning (Motor 1)
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={panValue}
              onChange={(e) => setPanValue(Number(e.target.value))}
              className="w-full h-2 bg-[#2C2C2E] rounded-lg appearance-none cursor-pointer slider-thumb"
              style={{
                background: `linear-gradient(to right, #0A84FF 0%, #0A84FF ${panValue}%, #2C2C2E ${panValue}%, #2C2C2E 100%)`
              }}
            />
            <div className="text-right text-[10px] sm:text-[11px] text-[#8E8E93] mt-1">{panValue}°</div>
          </div>

          <div>
            <label className="block text-[10px] sm:text-[11px] text-[#8E8E93] tracking-wider mb-2 uppercase">
              Device Tilting (Motor 2)
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={tiltValue}
              onChange={(e) => setTiltValue(Number(e.target.value))}
              className="w-full h-2 bg-[#2C2C2E] rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #0A84FF 0%, #0A84FF ${tiltValue}%, #2C2C2E ${tiltValue}%, #2C2C2E 100%)`
              }}
            />
            <div className="text-right text-[10px] sm:text-[11px] text-[#8E8E93] mt-1">{tiltValue}°</div>
          </div>
        </div>
      </div>
    </div>
  );
}
