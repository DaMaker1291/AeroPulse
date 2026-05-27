import { useState } from 'react';
import { motion } from 'motion/react';
import { Usb, Cable, Activity, RotateCw, AlertTriangle, CheckCircle2, Plug, ChevronRight, WifiOff, Stethoscope, ArrowLeftRight, Monitor } from 'lucide-react';
import { useIsMobile } from './ui/use-mobile';
import type { VexState, VexDiagnosis } from '../../useVexSerial';

interface PageVexProps {
  vex: {
    state: VexState;
    connect: () => void;
    disconnect: () => void;
    calibrate: () => void;
    setPosition: (deg: number) => void;
    runDiagnose: () => void;
    sendCommand: (cmd: string) => void;
  };
}

export function PageVexBridge({ vex }: PageVexProps) {
  const isMobile = useIsMobile();
  const hasData = vex.state.connected && vex.state.data !== null;
  const diag = vex.state.diagnosis;
  const [targetPos, setTargetPos] = useState('0');

  return (
    <div className={`flex flex-col gap-3 sm:gap-4 ${isMobile ? 'pb-4' : 'min-h-0 flex-1'}`}>

      {/* Connection Status */}
      <div className={`bg-[#16161A] rounded-2xl border ${vex.state.connected ? 'border-[#30D158]/30' : 'border-[#1E1E22]'} p-3 sm:p-5 flex-shrink-0`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Cable className="w-4 h-4 sm:w-5 sm:h-5 text-[#0A84FF]" />
            <span className="text-[12px] sm:text-[13px] font-semibold text-white">VEX Brain Bridge</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${vex.state.connected ? 'bg-[#30D158]' : 'bg-[#FF453A]'}`}
                 style={vex.state.connected ? { animation: 'pulse 2s ease-in-out infinite' } : {}} />
            <span className={`text-[10px] sm:text-[11px] font-mono tracking-wider ${vex.state.connected ? 'text-[#30D158]' : 'text-[#FF453A]'}`}>
              {vex.state.connected ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
          </div>
        </div>

        {vex.state.connected && (
          <div className="bg-[#0B0B0D] rounded-xl border border-[#1E1E22] p-2 sm:p-3 mb-3">
            <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-[#8E8E93] font-mono">
              <span>{vex.state.portInfo}</span>
              <span className="text-[#30D158]">{vex.state.streaming ? 'STREAMING 50 Hz' : 'PAUSED'}</span>
            </div>
          </div>
        )}

        {vex.state.error && (
          <div className="bg-[#FF453A]/10 border border-[#FF453A]/20 rounded-xl p-2 sm:p-3 mb-3 text-[10px] sm:text-[11px] text-[#FF9F0A] font-mono">
            {vex.state.error}
          </div>
        )}

        <div className="flex gap-2">
          {vex.state.connected ? (
            <>
              <button onClick={vex.disconnect}
                className="flex-1 py-2 sm:py-2.5 rounded-xl bg-[#FF453A]/10 border border-[#FF453A]/20 text-[#FF453A] text-[11px] sm:text-[12px] font-semibold hover:bg-[#FF453A]/20 transition-colors flex items-center justify-center gap-1.5">
                <Plug className="w-3 h-3" /> Disconnect
              </button>
              <button onClick={vex.calibrate}
                className="flex-1 py-2 sm:py-2.5 rounded-xl bg-[#0A84FF]/10 border border-[#0A84FF]/20 text-[#0A84FF] text-[11px] sm:text-[12px] font-semibold hover:bg-[#0A84FF]/20 transition-colors flex items-center justify-center gap-1.5">
                <RotateCw className="w-3 h-3" /> Calibrate
              </button>
            </>
          ) : (
            <button onClick={vex.connect}
              className="w-full py-2.5 sm:py-3 rounded-xl bg-[#0A84FF] text-white text-[12px] sm:text-[13px] font-semibold hover:bg-[#0A84FF]/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!vex.state.webSerialAvailable}>
              <Usb className="w-4 h-4" />
              {vex.state.webSerialAvailable ? 'Connect VEX Brain' : 'Web Serial API Unavailable'}
            </button>
          )}
        </div>
      </div>

      {/* Command Controls — visible whenever connected */}
      {vex.state.connected && (
        <div className="bg-[#16161A] rounded-2xl border border-[#1E1E22] p-3 sm:p-5 flex-shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <Stethoscope className="w-3.5 h-3.5 text-[#30D158]" />
            <span className="text-[11px] sm:text-[12px] font-semibold text-white">Motor Commands</span>
            {hasData && (
              <span className="ml-auto text-[10px] text-[#8E8E93] font-mono">
                {vex.state.data!.m3Pos.toFixed(1)}° / {vex.state.data!.m4Pos.toFixed(1)}°
              </span>
            )}
          </div>

          {/* SETPOS input */}
          <div className="flex items-center gap-2 mb-3">
            <input type="number" value={targetPos} onChange={e => setTargetPos(e.target.value)}
              className="w-20 h-8 bg-[#16161A] border border-[#2C2C2E] rounded-lg px-2 text-white text-[12px] font-mono focus:outline-none focus:border-[#0A84FF]" />
            <span className="text-[10px] text-[#8E8E93] font-mono">deg</span>
            <button onClick={() => vex.setPosition(parseFloat(targetPos) || 0)}
              className="h-8 px-3 rounded-lg bg-[#0A84FF]/10 border border-[#0A84FF]/20 text-[#0A84FF] text-[10px] font-semibold hover:bg-[#0A84FF]/20 transition-colors">
              SETPOS
            </button>
            <button onClick={() => { setTargetPos('0'); vex.setPosition(0); }}
              className="h-8 px-3 rounded-lg bg-[#8E8E93]/10 border border-[#8E8E93]/20 text-[#8E8E93] text-[10px] font-semibold hover:bg-[#8E8E93]/20 transition-colors ml-auto">
              Return 0°
            </button>
          </div>

          {/* DIAGNOSE button */}
          <button onClick={vex.runDiagnose}
            className="w-full py-2.5 rounded-xl bg-[#30D158]/10 border border-[#30D158]/20 text-[#30D158] text-[11px] font-semibold hover:bg-[#30D158]/20 transition-colors flex items-center justify-center gap-2">
            <ArrowLeftRight className="w-3.5 h-3.5" />
            Run Full Diagnosis (Tension + Compression)
          </button>

          {/* Empty state when connected but no data yet */}
          {!hasData && (
            <div className="flex items-center justify-center py-4 mt-2 text-[#FF9F0A]/60">
              <Activity className="w-4 h-4 mr-2" />
              <span className="text-[10px] sm:text-[11px] font-mono">Connected — waiting for motor data stream...</span>
            </div>
          )}
        </div>
      )}

      {/* Not connected */}
      {!vex.state.connected && (
        <div className="bg-[#16161A] rounded-2xl border border-[#1E1E22] p-3 sm:p-5 flex-shrink-0">
          <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-[#8E8E93]/40">
            <WifiOff className="w-8 h-8 sm:w-10 sm:h-10 mb-2" />
            <span className="text-[11px] sm:text-[12px] font-mono">Not connected</span>
          </div>
        </div>
      )}

      {/* Diagnosis Results */}
      {diag && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-[#16161A] rounded-2xl border border-[#30D158]/20 p-3 sm:p-5 flex-shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#30D158]" />
            <span className="text-[12px] sm:text-[13px] font-semibold text-white">Diagnosis Results</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#0B0B0D] rounded-xl border border-[#1E1E22] p-3">
              <span className="text-[9px] text-[#8E8E93] tracking-widest uppercase font-medium">Tension (Pull)</span>
              <div className="mt-1 text-[11px] font-mono text-[#30D158]">
                L: {diag.tensionTorqueL.toFixed(2)} Nm
              </div>
              <div className="text-[11px] font-mono text-[#BF5AF2]">
                R: {diag.tensionTorqueR.toFixed(2)} Nm
              </div>
            </div>
            <div className="bg-[#0B0B0D] rounded-xl border border-[#1E1E22] p-3">
              <span className="text-[9px] text-[#8E8E93] tracking-widest uppercase font-medium">Compression</span>
              <div className="mt-1 text-[11px] font-mono text-[#FF9F0A]">
                L: {diag.compressionTorqueL.toFixed(2)} Nm
              </div>
              <div className="text-[11px] font-mono text-[#FF453A]">
                R: {diag.compressionTorqueR.toFixed(2)} Nm
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Operation Guide */}
      <div className="bg-[#16161A] rounded-2xl border border-[#1E1E22] p-3 sm:p-5 flex-shrink-0">
        <div className="flex items-center gap-2 mb-3 sm:mb-4">
          <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#30D158]" />
          <span className="text-[12px] sm:text-[13px] font-semibold text-white">Operation Guide</span>
        </div>
        <div className="space-y-2">
          {[
            { ic: Monitor, label: 'Upload Firmware', detail: 'pros build && pros upload — loop starts instantly' },
            { ic: Usb, label: 'Connect USB', detail: 'Keep VEX Brain connected via USB-C to computer' },
            { ic: Plug, label: 'Click "Connect VEX Brain"', detail: 'Previously-authorized ports connect automatically' },
            { ic: ArrowLeftRight, label: 'Run Diagnosis', detail: 'Click "Run Full Diagnosis" — moves to ±45°, measures torque' },
          ].map((s, i) => {
            const Icon = s.ic;
            const done = i === 2 ? vex.state.connected : false;
            return (
              <div key={i} className={`flex items-start gap-2.5 p-2 sm:p-3 rounded-xl ${done ? 'bg-[#30D158]/05' : 'bg-[#0B0B0D]'} border ${done ? 'border-[#30D158]/10' : 'border-[#1E1E22]'}`}>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${done ? 'bg-[#30D158]/15' : 'bg-[#1E1E22]'}`}>
                  {done ? <CheckCircle2 className="w-3.5 h-3.5 text-[#30D158]" /> : <Icon className="w-3.5 h-3.5 text-[#8E8E93]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-[11px] sm:text-[12px] font-semibold ${done ? 'text-[#30D158]' : 'text-white'}`}>{i + 1}. {s.label}</div>
                  <div className="text-[10px] sm:text-[11px] text-[#8E8E93] mt-0.5">{s.detail}</div>
                </div>
                <ChevronRight className={`w-3.5 h-3.5 flex-shrink-0 mt-1 ${done ? 'text-[#30D158]' : 'text-[#8E8E93]/30'}`} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Troubleshooting */}
      <div className="bg-[#16161A] rounded-2xl border border-[#1E1E22] p-3 sm:p-5 flex-shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#FF9F0A]" />
          <span className="text-[12px] sm:text-[13px] font-semibold text-white">Troubleshooting</span>
        </div>
        <div className="space-y-1.5">
          {[
            'New firmware streams ~1s after upload — no screen tapping needed',
            'Motor uses BRAKE mode: gentle resistance when turned by hand',
            'Use Chrome/Edge with HTTPS or localhost for Web Serial API',
            'Send SETPOS:90 to move, DIAGNOSE for full tension/compression cycle',
          ].map((tip, i) => (
            <div key={i} className="flex items-start gap-2 text-[10px] sm:text-[11px] text-[#8E8E93]">
              <span className={`mt-0.5 flex-shrink-0 ${i === 0 ? 'text-[#FF453A]' : 'text-[#FF9F0A]'}`}>▸</span>
              {tip}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
