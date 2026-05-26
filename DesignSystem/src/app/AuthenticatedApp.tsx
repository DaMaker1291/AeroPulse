import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Activity, Scan, Brain, Building2, Heart, Lock, LogOut, ChevronRight, ArrowRight, CheckCircle2, Cable, Usb } from 'lucide-react';
import { Toaster } from 'sonner';
import { Page1AdaptiveIntake } from './components/Page1AdaptiveIntake';
import { Page2Biometric } from './components/Page2Biometric';
import { Page3Triage } from './components/Page3Triage';
import { Page4Enterprise } from './components/Page4Enterprise';
import { Page5Labvanced } from './components/Page5Labvanced';
import { Page6Onboarding } from './components/Page6Onboarding';
import { useWebSocket } from '../useWebSocket';
import { useVexSerial } from '../useVexSerial';
import { useIsMobile } from './components/ui/use-mobile';

type PageKey = 'intake' | 'biometric' | 'triage' | 'enterprise' | 'labvanced' | 'onboarding';

interface UserData {
  name: string;
  org: string;
  role: string;
  reasonForVisit: string;
}

const pages = [
  { key: 'intake' as PageKey, name: 'Adaptive Intake', step: '01', icon: Activity, desc: 'AI Clinical Screener' },
  { key: 'biometric' as PageKey, name: 'Biometric Scanner', step: '02', icon: Scan, desc: 'Multimodal Interrogation' },
  { key: 'triage' as PageKey, name: 'Predictive Triage', step: '03', icon: Brain, desc: 'Diagnostic Analysis' },
  { key: 'enterprise' as PageKey, name: 'Enterprise Fleet', step: '04', icon: Building2, desc: 'Audit Dashboard' },
  { key: 'labvanced' as PageKey, name: 'LabVanced', step: '05', icon: Heart, desc: 'rPPG Technology' },
];

const stepGuides: Record<PageKey, { title: string; instructions: string[]; action: string }> = {
  intake: {
    title: 'Step 1: Face Positioning & Screening',
    instructions: [
      'Position your face centered in the camera viewport below',
      'Ensure good lighting — avoid backlight or shadows on your face',
      'Complete the screening questions (Yes / No / Don\'t Know)',
      'Wait for the green "TARGET LOCKED" status to appear',
    ],
    action: 'Hold still until lock',
  },
  biometric: {
    title: 'Step 2: Biometric Scan',
    instructions: [
      'Press the "Execute 10-Second Compliance Scan" button',
      'Remain completely still during the 10-second countdown',
      'Keep your face visible in the camera throughout',
      'Vitals will appear automatically after scanning',
    ],
    action: 'Press scan button below',
  },
  triage: {
    title: 'Step 3: Review Analysis',
    instructions: [
      'Review your vital signs and physiological observations',
      'Check the Planetary Health environmental correlation',
      'Export your report as PDF if needed',
      'Share results with your healthcare provider',
    ],
    action: 'Review complete →',
  },
  enterprise: {
    title: 'Step 4: Enterprise Fleet',
    instructions: [
      'View the enterprise fleet audit dashboard',
      'Monitor connected devices and patient sessions',
    ],
    action: 'View dashboard',
  },
  labvanced: {
    title: 'Step 5: Technology Overview',
    instructions: [
      'Learn about rPPG (remote photoplethysmography) technology',
      'Understand how camera-based vital sign extraction works',
    ],
    action: 'Learn more',
  },
  onboarding: {
    title: 'Setup Complete',
    instructions: [],
    action: '',
  },
};

interface AuthenticatedAppProps {
  user: UserData;
  onSignOut: () => void;
}

export default function AuthenticatedApp({ user, onSignOut }: AuthenticatedAppProps) {
  const [currentPage, setCurrentPage] = useState<PageKey>('intake');
  const [unlockedPages, setUnlockedPages] = useState<Set<PageKey>>(new Set(['intake', 'labvanced', 'onboarding']));
  const [completedPages, setCompletedPages] = useState<Set<PageKey>>(new Set());
  const [patientInfo, setPatientInfo] = useState({ reasonForVisit: '', age: '', gender: '' });
  const [showGuide, setShowGuide] = useState(true);

  const backend = useWebSocket();
  const vex = useVexSerial();
  const isMobile = useIsMobile();

  // Build m3/m4 wave arrays from VEX torque data in real time
  const vexWaveLen = 60;
  const vexM3Ref = useRef<number[]>([]);
  const vexM4Ref = useRef<number[]>([]);
  useEffect(() => {
    if (vex.state.connected && vex.state.data) {
      const torqueLeft = vex.state.data.m3Torque;
      const torqueRight = vex.state.data.m4Torque;
      // Map torque to 0-100 display range: 0 Nm → 50 (center), ~2 Nm → 95
      const leftVal = Math.min(95, Math.max(5, 50 + torqueLeft * 22));
      const rightVal = Math.min(95, Math.max(5, 50 + torqueRight * 22));
      vexM3Ref.current = [...vexM3Ref.current.slice(-(vexWaveLen - 1)), leftVal];
      vexM4Ref.current = [...vexM4Ref.current.slice(-(vexWaveLen - 1)), rightVal];
    }
  }, [vex.state.data, vex.state.connected]);

  const vexM3Wave = vex.state.connected ? vexM3Ref.current : undefined;
  const vexM4Wave = vex.state.connected ? vexM4Ref.current : undefined;

  const pageOrder: PageKey[] = ['intake', 'biometric', 'triage', 'enterprise', 'labvanced'];

  const handleUnlockNavigation = () => {
    setUnlockedPages(new Set(['intake', 'biometric', 'triage', 'enterprise', 'labvanced', 'onboarding']));
    setCompletedPages(prev => new Set([...prev, 'intake']));
  };

  const handleScanComplete = () => {
    setCompletedPages(prev => new Set([...prev, 'biometric']));
    setCurrentPage('triage');
  };

  const navigate = (key: PageKey) => {
    if (unlockedPages.has(key)) setCurrentPage(key);
  };

  const currentIdx = pageOrder.indexOf(currentPage);

  const goNext = () => {
    const next = pageOrder[currentIdx + 1];
    if (next && unlockedPages.has(next)) {
      setCurrentPage(next);
    }
  };

  const goPrev = () => {
    const prev = pageOrder[currentIdx - 1];
    if (prev && unlockedPages.has(prev)) {
      setCurrentPage(prev);
    }
  };

  const guide = stepGuides[currentPage];
  const isComplete = completedPages.has(currentPage);

  const renderContent = () => (
    <div className={`flex flex-col gap-3 ${isMobile ? '' : 'min-h-0 flex-1'}`}>
      {/* Step Guide Banner */}
      {showGuide && guide && guide.instructions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#16161A] rounded-2xl border border-[#0A84FF]/20 p-3 sm:p-4"
        >
          <div className="flex items-start gap-3">
            <div className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 ${isComplete ? 'bg-[#30D158]/15' : 'bg-[#0A84FF]/15'}`}>
              {isComplete ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-[#30D158]" />
              ) : (
                <span className="text-[11px] font-bold text-[#0A84FF]">{currentIdx + 1}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <h3 className={`text-[12px] sm:text-[13px] font-semibold ${isComplete ? 'text-[#30D158]' : 'text-white'}`}>
                  {isComplete ? `✓ ${guide.title.replace('Step', 'Step')}` : guide.title}
                </h3>
                {!isMobile && (
                  <button onClick={() => setShowGuide(false)} className="text-[9px] text-[#8E8E93]/50 hover:text-white transition-colors flex-shrink-0">
                    Dismiss
                  </button>
                )}
              </div>
              <ul className="space-y-0.5">
                {guide.instructions.map((inst, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px] sm:text-[12px] text-[#AEAEB2]">
                    <span className="text-[#0A84FF] mt-0.5 flex-shrink-0">▸</span>
                    {inst}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Navigation buttons */}
          {!isMobile && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#1E1E22]">
              <div className="flex items-center gap-2">
                {currentIdx > 0 && (
                  <button onClick={goPrev} className="flex items-center gap-1 text-[11px] text-[#8E8E93] hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-[#1E1E22]">
                    ← Back
                  </button>
                )}
                <span className="text-[10px] text-[#8E8E93]/50 font-mono">
                  Step {currentIdx + 1} of {pageOrder.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-[#8E8E93]/40 italic">{guide.action}</span>
                {currentIdx < pageOrder.length - 1 && unlockedPages.has(pageOrder[currentIdx + 1]) && (
                  <button onClick={goNext} className="flex items-center gap-1 text-[11px] text-[#0A84FF] font-semibold hover:text-white transition-colors px-3 py-1.5 rounded-lg bg-[#0A84FF]/10 hover:bg-[#0A84FF]/20">
                    Next Step <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Page content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentPage}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className={isMobile ? '' : (currentPage === 'intake' ? 'min-h-0' : 'min-h-0 flex-1')}
        >
          {currentPage === 'intake' && (
            <Page1AdaptiveIntake
              onUnlockNavigation={handleUnlockNavigation}
              targetStatus={backend.targetStatus}
              streamUrl={backend.streamUrl}
              cameraStream={backend.cameraStream}
              faceMesh={backend.faceMesh}
              onPatientInfo={setPatientInfo}
              patientInfo={patientInfo}
            />
          )}
          {currentPage === 'biometric' && (
            <Page2Biometric
              onScanComplete={handleScanComplete}
              backendVitals={backend.vitals}
              backendRppgWave={backend.rppgWave}
              backendM3Wave={vexM3Wave ?? backend.m3Wave}
              backendM4Wave={vexM4Wave ?? backend.m4Wave}
              cameraConnected={backend.cameraConnected}
            />
          )}
          {currentPage === 'triage' && (
            <Page3Triage
              backendTriage={backend.triage}
              backendFft={backend.fft}
              backendVitals={backend.vitals}
              reasonForVisit={patientInfo.reasonForVisit}
              patientAge={patientInfo.age}
              patientGender={patientInfo.gender}
            />
          )}
          {currentPage === 'enterprise' && (
            <Page4Enterprise
              backendVitals={backend.vitals}
              backendRppgWave={backend.rppgWave}
            />
          )}
          {currentPage === 'labvanced' && <Page5Labvanced />}
          {currentPage === 'onboarding' && <Page6Onboarding />}
        </motion.div>
      </AnimatePresence>

      {/* Mobile next step button */}
      {isMobile && showGuide && currentIdx < pageOrder.length - 1 && unlockedPages.has(pageOrder[currentIdx + 1]) && (
        <motion.button
          onClick={goNext}
          whileTap={{ scale: 0.97 }}
          className="w-full h-12 rounded-xl bg-[#0A84FF] text-white font-semibold text-[13px] flex items-center justify-center gap-2 shadow-lg shadow-[#0A84FF]/10 flex-shrink-0"
        >
          Next: {pages.find(p => p.key === pageOrder[currentIdx + 1])?.name} <ArrowRight className="w-4 h-4" />
        </motion.button>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <div className="w-screen h-screen bg-[#0B0B0D] flex flex-col overflow-hidden" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <Toaster position="top-right" theme="dark" toastOptions={{
          style: { background: '#16161A', border: '1px solid #2C2C2E', color: '#fff' }
        }} />

        <header className="h-12 bg-[#0B0B0D] border-b border-[#1E1E22] flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-[#0A84FF] flex items-center justify-center">
              <Activity className="w-3 h-3 text-white" />
            </div>
            <span className="text-white font-bold text-[14px] tracking-tight">AeroPulse AI</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="text-[11px] text-white font-medium leading-tight">{user?.name}</div>
              <div className="text-[9px] text-[#8E8E93] leading-tight">{user?.role} · {user?.org}</div>
            </div>
            <button onClick={onSignOut} className="ml-1 p-1.5 text-[#8E8E93] hover:text-white transition-colors">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-[#0D0D10]">
          <div className="p-3 min-h-full">
            {renderContent()}
          </div>
        </main>

        <nav className="h-14 bg-[#0B0B0D] border-t border-[#1E1E22] flex items-center justify-around px-1 flex-shrink-0 pb-1">
          {pages.map(page => {
            const isActive = currentPage === page.key;
            const isLocked = !unlockedPages.has(page.key);
            const isDone = completedPages.has(page.key);
            const Icon = page.icon;
            return (
              <button
                key={page.key}
                onClick={() => navigate(page.key)}
                disabled={isLocked}
                className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg transition-all min-w-0 flex-1 ${
                  isActive ? 'text-[#0A84FF]' : isLocked ? 'text-[#8E8E93]/30' : 'text-[#8E8E93]'
                }`}
              >
                {isLocked ? (
                  <Lock className="w-4 h-4" />
                ) : isDone && !isActive ? (
                  <svg className="w-4 h-4 text-[#30D158]" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <Icon className="w-4 h-4" />
                )}
                <span className="text-[9px] font-medium truncate max-w-full">{page.name}</span>
              </button>
            );
          })}
        </nav>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-[#0B0B0D] flex flex-col overflow-hidden" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <Toaster position="top-right" theme="dark" toastOptions={{
        style: { background: '#16161A', border: '1px solid #2C2C2E', color: '#fff' }
      }} />

      <header className="h-14 bg-[#0B0B0D] border-b border-[#1E1E22] flex items-center justify-between px-6 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#0A84FF] flex items-center justify-center">
              <Activity className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-white font-bold text-[15px] tracking-tight">AeroPulse AI</span>
          </div>
          <div className="h-4 w-px bg-[#2C2C2E]" />
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#30D158]" />
            <span className="text-[11px] text-[#8E8E93] tracking-widest uppercase font-medium">Secure Node Active</span>
          </div>
          <div className="h-4 w-px bg-[#2C2C2E]" />
          <div className="flex items-center gap-2">
            <ChevronRight className="w-3.5 h-3.5 text-[#8E8E93]" />
            <span className="text-[12px] text-[#8E8E93]">{pages.find(p => p.key === currentPage)?.name}</span>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="text-right">
            <div className="text-[13px] text-white font-medium leading-tight">{user?.name}</div>
            <div className="text-[11px] text-[#8E8E93] leading-tight">{user?.role} · {user?.org}</div>
          </div>
          <div className="w-8 h-8 rounded-full bg-[#0A84FF]/15 border border-[#0A84FF]/25 flex items-center justify-center">
            <span className="text-[12px] font-bold text-[#0A84FF]">{user?.name?.charAt(0) || 'U'}</span>
          </div>
          <button onClick={onSignOut} className="flex items-center gap-1.5 text-[#8E8E93] hover:text-white transition-colors">
            <LogOut className="w-3.5 h-3.5" />
            <span className="text-[12px]">Sign out</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-60 bg-[#0B0B0D] border-r border-[#1E1E22] flex flex-col flex-shrink-0">
          <div className="px-4 py-5 border-b border-[#1E1E22]">
            <div className="text-[10px] text-[#8E8E93] tracking-widest uppercase font-medium mb-2">Active Session</div>
            <div className="flex items-center gap-2">
              <div className="flex gap-0.5">
                <div className="w-0.5 h-3 rounded-full" style={{
                  backgroundColor: backend.cameraConnected ? '#30D158' : '#FF453A',
                  animation: backend.cameraConnected ? 'pulse 1.4s ease-in-out infinite' : 'none',
                }} />
                <div className="w-0.5 h-3 rounded-full" style={{
                  backgroundColor: backend.cameraConnected ? '#30D158' : '#FF453A',
                  animation: backend.cameraConnected ? 'pulse 1.4s ease-in-out 0.2s infinite' : 'none',
                }} />
                <div className="w-0.5 h-3 rounded-full" style={{
                  backgroundColor: backend.cameraConnected ? '#30D158' : '#FF453A',
                  animation: backend.cameraConnected ? 'pulse 1.4s ease-in-out 0.4s infinite' : 'none',
                }} />
              </div>
              <span className="text-[12px] text-[#8E8E93]">
                {backend.cameraConnected ? 'Signal Online · 60 Hz' : 'Camera Offline'}
              </span>
            </div>
          </div>

          <nav className="flex-1 p-3 space-y-1">
            {pages.map(page => {
              const isActive = currentPage === page.key;
              const isLocked = !unlockedPages.has(page.key);
              const isDone = completedPages.has(page.key);
              const Icon = page.icon;

              return (
                <motion.button
                  key={page.key}
                  onClick={() => navigate(page.key)}
                  disabled={isLocked}
                  whileTap={!isLocked ? { scale: 0.98 } : {}}
                  className={`w-full rounded-xl px-3 py-3 flex items-center gap-3 transition-all duration-150 relative group ${
                    isActive
                      ? 'bg-[#0A84FF]/10 text-white'
                      : isLocked
                      ? 'text-[#8E8E93]/30 cursor-not-allowed'
                      : 'text-[#8E8E93] hover:bg-[#16161A] hover:text-white'
                  }`}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-[#0A84FF] rounded-r-full" />
                  )}

                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
                    isActive ? 'bg-[#0A84FF]' :
                    isDone ? 'bg-[#30D158]/15 border border-[#30D158]/25' :
                    isLocked ? 'bg-[#1A1A1E]' :
                    'bg-[#16161A] group-hover:bg-[#1E1E22]'
                  }`}>
                    {isLocked ? (
                      <Lock className="w-3 h-3" />
                    ) : isDone && !isActive ? (
                      <svg className="w-3 h-3 text-[#30D158]" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : ''}`} />
                    )}
                  </div>

                  <div className="flex-1 text-left min-w-0">
                    <div className="text-[13px] font-semibold leading-tight truncate">{page.name}</div>
                    <div className={`text-[10px] tracking-wide leading-tight mt-0.5 ${isActive ? 'text-[#0A84FF]/70' : 'text-[#8E8E93]/60'}`}>
                      {isLocked ? 'Locked' : page.desc}
                    </div>
                  </div>

                  <span className={`text-[10px] font-mono font-bold flex-shrink-0 ${
                    isActive ? 'text-[#0A84FF]' : isLocked ? 'text-[#8E8E93]/20' : 'text-[#8E8E93]/40'
                  }`}>{page.step}</span>
                </motion.button>
              );
            })}
          </nav>

          <div className="p-4 border-t border-[#1E1E22]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] text-[#8E8E93]/50 tracking-wide font-mono">v2.4.1 · APS-{7341}</div>
              </div>
              <div className="flex gap-1">
                {pages.map(p => (
                  <div
                    key={p.key}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${
                      currentPage === p.key ? 'bg-[#0A84FF]' :
                      completedPages.has(p.key) ? 'bg-[#30D158]' :
                      unlockedPages.has(p.key) ? 'bg-[#2C2C2E]' : 'bg-[#1E1E22]'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden bg-[#0D0D10]">
          <div className="flex-1 flex flex-col p-5 overflow-auto min-h-0">
            {renderContent()}
          </div>
        </main>
      </div>

      <footer className="h-9 bg-[#0B0B0D] border-t border-[#1E1E22] flex items-center justify-between px-6 flex-shrink-0">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${vex.state.connected ? 'bg-[#30D158]' : 'bg-[#8E8E93]/30'}`}
                 style={vex.state.connected ? { animation: 'pulse 2s ease-in-out infinite' } : {}} />
            <span className="text-[10px] text-[#8E8E93] tracking-widest uppercase font-mono">USB COM · 115200 BAUD</span>
          </div>
          <div className="h-3 w-px bg-[#2C2C2E]" />
          {vex.state.connected ? (
            <>
              <span className="text-[10px] text-[#30D158] font-mono">VEX CONNECTED</span>
              <div className="h-3 w-px bg-[#2C2C2E]" />
              <span className="text-[10px] text-[#8E8E93] font-mono">{vex.state.portInfo}</span>
            </>
          ) : (
            <button
              onClick={vex.connect}
              className="flex items-center gap-1.5 text-[10px] text-[#0A84FF] hover:text-white transition-colors font-mono"
            >
              <Usb className="w-3 h-3" />
              CONNECT VEX
            </button>
          )}
        </div>
        <div className="flex items-center gap-5">
          {vex.state.connected && (
            <>
              <span className="text-[10px] text-[#8E8E93] font-mono tracking-widest">
                L:{vex.state.data?.m3Torque.toFixed(2) ?? '?'}Nm
              </span>
              <div className="h-3 w-px bg-[#2C2C2E]" />
              <span className="text-[10px] text-[#8E8E93] font-mono tracking-widest">
                R:{vex.state.data?.m4Torque.toFixed(2) ?? '?'}Nm
              </span>
              <div className="h-3 w-px bg-[#2C2C2E]" />
            </>
          )}
          <span className="text-[10px] text-[#8E8E93] font-mono tracking-widest">AI PIPELINE</span>
          <div className="h-3 w-px bg-[#2C2C2E]" />
          <span className="text-[10px] text-[#0A84FF] font-mono font-medium">60 FPS · 50 Hz CORE</span>
          <div className="h-3 w-px bg-[#2C2C2E]" />
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#0A84FF]" style={{ animation: 'pulse 1s ease-in-out infinite' }} />
            <span className="text-[10px] text-[#8E8E93] font-mono tracking-widest">SECURE · AES-256</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
