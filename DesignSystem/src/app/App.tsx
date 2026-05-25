import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Activity, Scan, Brain, Building2, Lock, LogOut, ChevronRight } from 'lucide-react';
import { Toaster } from 'sonner';
import { AccountCreation } from './components/AccountCreation';
import { Page1AdaptiveIntake } from './components/Page1AdaptiveIntake';
import { Page2Biometric } from './components/Page2Biometric';
import { Page3Triage } from './components/Page3Triage';
import { Page4Enterprise } from './components/Page4Enterprise';
import { useWebSocket } from '../useWebSocket';

type PageKey = 'intake' | 'biometric' | 'triage' | 'enterprise';

interface UserData {
  name: string;
  org: string;
  role: string;
}

const pages = [
  { key: 'intake' as PageKey, name: 'Adaptive Intake', step: '01', icon: Activity, desc: 'AI Clinical Screener' },
  { key: 'biometric' as PageKey, name: 'Biometric Scanner', step: '02', icon: Scan, desc: 'Multimodal Interrogation' },
  { key: 'triage' as PageKey, name: 'Predictive Triage', step: '03', icon: Brain, desc: 'FFT Risk Analysis' },
  { key: 'enterprise' as PageKey, name: 'Enterprise Fleet', step: '04', icon: Building2, desc: 'Audit Dashboard' },
];

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<UserData | null>(null);
  const [currentPage, setCurrentPage] = useState<PageKey>('intake');
  const [unlockedPages, setUnlockedPages] = useState<Set<PageKey>>(new Set(['intake']));
  const [completedPages, setCompletedPages] = useState<Set<PageKey>>(new Set());

  const backend = useWebSocket();

  const handleAuth = (userData: UserData) => {
    setUser(userData);
    setAuthenticated(true);
  };

  const handleUnlockNavigation = () => {
    setUnlockedPages(new Set(['intake', 'biometric', 'triage', 'enterprise']));
    setCompletedPages(prev => new Set([...prev, 'intake']));
  };

  const handleScanComplete = () => {
    setCompletedPages(prev => new Set([...prev, 'biometric']));
    setCurrentPage('triage');
  };

  const navigate = (key: PageKey) => {
    if (unlockedPages.has(key)) setCurrentPage(key);
  };

  const ActivePageComponent = pages.find(p => p.key === currentPage)?.component;

  if (!authenticated) {
    return <AccountCreation onComplete={handleAuth} />;
  }

  return (
    <div className="w-screen h-screen bg-[#0B0B0D] flex flex-col overflow-hidden" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <Toaster position="top-right" theme="dark" toastOptions={{
        style: { background: '#16161A', border: '1px solid #2C2C2E', color: '#fff' }
      }} />

      {/* Top Header */}
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
          <button
            onClick={() => { setAuthenticated(false); setUser(null); setUnlockedPages(new Set(['intake'])); setCompletedPages(new Set()); setCurrentPage('intake'); }}
            className="flex items-center gap-1.5 text-[#8E8E93] hover:text-white transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="text-[12px]">Sign out</span>
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">

        {/* Sidebar */}
        <aside className="w-60 bg-[#0B0B0D] border-r border-[#1E1E22] flex flex-col flex-shrink-0">

          {/* Patient session indicator */}
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

          {/* Navigation */}
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
                  {/* Active left border */}
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-[#0A84FF] rounded-r-full" />
                  )}

                  {/* Step number */}
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

          {/* Bottom info */}
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

        {/* Main viewport */}
        <main className="flex-1 flex flex-col overflow-hidden bg-[#0D0D10]">
          <div className="flex-1 p-5 overflow-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentPage}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="h-full"
              >
                {currentPage === 'intake' && (
                  <Page1AdaptiveIntake
                    onUnlockNavigation={handleUnlockNavigation}
                    targetStatus={backend.targetStatus}
                    streamUrl={backend.streamUrl}
                  />
                )}
                {currentPage === 'biometric' && (
                  <Page2Biometric
                    onScanComplete={handleScanComplete}
                    backendVitals={backend.vitals}
                    backendRppgWave={backend.rppgWave}
                    backendM3Wave={backend.m3Wave}
                    backendM4Wave={backend.m4Wave}
                    cameraConnected={backend.cameraConnected}
                  />
                )}
                {currentPage === 'triage' && (
                  <Page3Triage
                    backendTriage={backend.triage}
                    backendFft={backend.fft}
                  />
                )}
                {currentPage === 'enterprise' && <Page4Enterprise />}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* Bottom Telemetry HUD */}
      <footer className="h-9 bg-[#0B0B0D] border-t border-[#1E1E22] flex items-center justify-between px-6 flex-shrink-0">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#30D158]" style={{ animation: 'pulse 2s ease-in-out infinite' }} />
            <span className="text-[10px] text-[#8E8E93] tracking-widest uppercase font-mono">USB COM · 115200 BAUD</span>
          </div>
          <div className="h-3 w-px bg-[#2C2C2E]" />
          <span className="text-[10px] text-[#30D158] font-mono">CONNECTED</span>
        </div>
        <div className="flex items-center gap-5">
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
