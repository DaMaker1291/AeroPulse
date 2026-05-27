import { motion } from 'motion/react';
import { Usb, Cable, Activity, Gauge, RotateCw, AlertTriangle, CheckCircle2, Plug, Monitor, ChevronRight, Terminal, WifiOff } from 'lucide-react';
import { useIsMobile } from './ui/use-mobile';
import type { VexState } from '../../useVexSerial';

interface PageVexProps {
  vex: {
    state: VexState;
    connect: () => void;
    disconnect: () => void;
    calibrate: () => void;
  };
  m3Wave?: number[];
  m4Wave?: number[];
}

export function PageVexBridge({ vex, m3Wave, m4Wave }: PageVexProps) {
  const isMobile = useIsMobile();
  const hasData = vex.state.connected && vex.state.data !== null;

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

        {/* Error message */}
        {vex.state.error && (
          <div className="bg-[#FF453A]/10 border border-[#FF453A]/20 rounded-xl p-2 sm:p-3 mb-3 text-[10px] sm:text-[11px] text-[#FF9F0A] font-mono">
            {vex.state.error}
          </div>
        )}

        <div className="flex gap-2">
          {vex.state.connected ? (
            <>
              <button
                onClick={vex.disconnect}
                className="flex-1 py-2 sm:py-2.5 rounded-xl bg-[#FF453A]/10 border border-[#FF453A]/20 text-[#FF453A] text-[11px] sm:text-[12px] font-semibold hover:bg-[#FF453A]/20 transition-colors flex items-center justify-center gap-1.5"
              >
                <Plug className="w-3 h-3" /> Disconnect
              </button>
              <button
                onClick={vex.calibrate}
                className="flex-1 py-2 sm:py-2.5 rounded-xl bg-[#0A84FF]/10 border border-[#0A84FF]/20 text-[#0A84FF] text-[11px] sm:text-[12px] font-semibold hover:bg-[#0A84FF]/20 transition-colors flex items-center justify-center gap-1.5"
              >
                <RotateCw className="w-3 h-3" /> Calibrate
              </button>
            </>
          ) : (
            <button
              onClick={vex.connect}
              className="w-full py-2.5 sm:py-3 rounded-xl bg-[#0A84FF] text-white text-[12px] sm:text-[13px] font-semibold hover:bg-[#0A84FF]/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!vex.state.webSerialAvailable}
            >
              <Usb className="w-4 h-4" />
              {vex.state.webSerialAvailable ? 'Connect VEX Brain' : 'Web Serial API Unavailable'}
            </button>
          )}
        </div>
      </div>

      {/* Live Torque Gauges */}
      <div className={`bg-[#16161A] rounded-2xl border border-[#1E1E22] p-3 sm:p-5 ${isMobile ? '' : 'flex-1 min-h-0'}`}>
        <div className="flex items-center gap-2 mb-3 sm:mb-4">
          <Gauge className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#0A84FF]" />
          <span className="text-[12px] sm:text-[13px] font-semibold text-white">Live Motor Torque</span>
          {hasData && (
            <span className="ml-auto text-[10px] text-[#8E8E93] font-mono tracking-wider">
              {vex.state.data!.m3Pos.toFixed(1)}° / {vex.state.data!.m4Pos.toFixed(1)}°
            </span>
          )}
        </div>

        {/* Placeholder when no data */}
        {!hasData && !vex.state.connected && (
          <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-[#8E8E93]/40">
            <WifiOff className="w-8 h-8 sm:w-10 sm:h-10 mb-2" />
            <span className="text-[11px] sm:text-[12px] font-mono">Not connected</span>
          </div>
        )}

        {!hasData && vex.state.connected && (
          <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-[#FF9F0A]/60">
            <Activity className="w-8 h-8 sm:w-10 sm:h-10 mb-2" />
            <span className="text-[11px] sm:text-[12px] font-mono">Waiting for data...</span>
          </div>
        )}

        {hasData && (
          <div className={`grid ${isMobile ? 'grid-cols-2 gap-2' : 'grid-cols-2 gap-4'} ${isMobile ? '' : 'flex-1'}`}>
            <div className="bg-[#0B0B0D] rounded-xl border border-[#1E1E22] p-3 sm:p-4 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] sm:text-[11px] text-[#8E8E93] tracking-widest uppercase font-medium">Left Motor</span>
                <span className="text-[9px] sm:text-[10px] text-[#8E8E93] font-mono">M3</span>
              </div>
              <div className="flex items-baseline gap-1.5 sm:gap-2 mb-2">
                <span className="text-[28px] sm:text-[42px] font-bold text-white leading-none font-mono">{vex.state.data!.m3Torque.toFixed(2)}</span>
                <span className="text-[10px] sm:text-[12px] text-[#8E8E93] font-medium">Nm</span>
              </div>
              <div className="h-2 sm:h-2.5 bg-[#1E1E22] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-[#0A84FF]" style={{
                  width: `${Math.min(100, Math.abs(vex.state.data!.m3Torque) * 50)}%`,
                  opacity: 0.7,
                  transition: 'width 0.1s ease',
                }} />
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-[8px] sm:text-[9px] text-[#8E8E93]/60 font-mono">CUR: {vex.state.data!.m3Current.toFixed(2)}A</span>
                <span className="text-[8px] sm:text-[9px] text-[#8E8E93]/60 font-mono">POS: {vex.state.data!.m3Pos.toFixed(1)}°</span>
              </div>
            </div>
            <div className="bg-[#0B0B0D] rounded-xl border border-[#1E1E22] p-3 sm:p-4 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] sm:text-[11px] text-[#8E8E93] tracking-widest uppercase font-medium">Right Motor</span>
                <span className="text-[9px] sm:text-[10px] text-[#8E8E93] font-mono">M4</span>
              </div>
              <div className="flex items-baseline gap-1.5 sm:gap-2 mb-2">
                <span className="text-[28px] sm:text-[42px] font-bold text-white leading-none font-mono">{vex.state.data!.m4Torque.toFixed(2)}</span>
                <span className="text-[10px] sm:text-[12px] text-[#8E8E93] font-medium">Nm</span>
              </div>
              <div className="h-2 sm:h-2.5 bg-[#1E1E22] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-[#BF5AF2]" style={{
                  width: `${Math.min(100, Math.abs(vex.state.data!.m4Torque) * 50)}%`,
                  opacity: 0.7,
                  transition: 'width 0.1s ease',
                }} />
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-[8px] sm:text-[9px] text-[#8E8E93]/60 font-mono">CUR: {vex.state.data!.m4Current.toFixed(2)}A</span>
                <span className="text-[8px] sm:text-[9px] text-[#8E8E93]/60 font-mono">POS: {vex.state.data!.m4Pos.toFixed(1)}°</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Setup Steps */}
      <div className="bg-[#16161A] rounded-2xl border border-[#1E1E22] p-3 sm:p-5 flex-shrink-0">
        <div className="flex items-center gap-2 mb-3 sm:mb-4">
          <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#30D158]" />
          <span className="text-[12px] sm:text-[13px] font-semibold text-white">Setup & Operation Guide</span>
        </div>
        <div className="space-y-2">
          {[
            { icon: Monitor, label: 'Upload Firmware', detail: 'Run `pros upload` to flash brain_stream.cpp to the VEX Brain' },
            { icon: Terminal, label: 'Select "Driver Control"', detail: 'On the VEX Brain screen, choose "Driver Control" — this runs opcontrol()' },
            { icon: Usb, label: 'Connect USB Cable', detail: 'Keep the VEX Brain connected via USB to your computer' },
            { icon: Plug, label: 'Click "Connect VEX Brain"', detail: 'Use the button above, or the banner at the top of any page, then select the VEX port from the browser list' },
            { icon: Activity, label: 'Verify', detail: 'Turn the motor by hand — you should feel resistance (position hold). Torque values appear live below.' },
          ].map((step, i) => {
            const Icon = step.icon;
            const done =
              i === 3 ? vex.state.connected :
              i === 4 ? (vex.state.connected && vex.state.data !== null) :
              false;
            return (
              <div key={i} className={`flex items-start gap-2.5 p-2 sm:p-3 rounded-xl ${done ? 'bg-[#30D158]/05' : 'bg-[#0B0B0D]'} border ${done ? 'border-[#30D158]/10' : 'border-[#1E1E22]'}`}>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${done ? 'bg-[#30D158]/15' : 'bg-[#1E1E22]'}`}>
                  {done ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#30D158]" />
                  ) : (
                    <Icon className="w-3.5 h-3.5 text-[#8E8E93]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-[11px] sm:text-[12px] font-semibold ${done ? 'text-[#30D158]' : 'text-white'}`}>
                    {i + 1}. {step.label}
                  </div>
                  <div className="text-[10px] sm:text-[11px] text-[#8E8E93] mt-0.5">{step.detail}</div>
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
            'After uploading, you MUST select "Driver Control" on the VEX Brain screen',
            'Motor should feel stiff when turned by hand (position-hold PID fights back)',
            'Use Chrome or Edge (Web Serial API required) with HTTPS or localhost',
            'If no COM port appears in the browser list, check Device Manager for "VEX V5" drivers',
            'Restart the VEX Brain if the program seems stuck (battery power cycle)',
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
