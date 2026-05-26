import { Server, Activity, TrendingUp, Globe, ArrowUpRight, WifiOff } from 'lucide-react';

interface VitalsData {
  heartRate: number;
  respiration: number;
  bloodOxygen: number;
  temperature: number;
}

interface Page4Props {
  backendVitals?: VitalsData;
  backendRppgWave?: number[];
}

export function Page4Enterprise({ backendVitals, backendRppgWave }: Page4Props) {
  const hasSessionData = backendVitals?.heartRate && backendVitals.heartRate > 0;
  const sessionHr = backendVitals?.heartRate ?? 0;

  return (
    <div className="flex flex-col gap-4 h-full">

      {/* Fleet telemetry stat cards */}
      <div className="bg-[#16161A] rounded-2xl border border-[#1E1E22] p-5 flex-shrink-0">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-4 h-4 text-[#0A84FF]" />
          <span className="text-[13px] font-semibold text-white">Terminal Overview</span>
          <div className="ml-auto flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${hasSessionData ? 'bg-[#30D158]' : 'bg-[#8E8E93]'}`} style={{ animation: hasSessionData ? 'pulse 2s ease-in-out infinite' : 'none' }} />
            <span className="text-[10px] text-[#8E8E93] tracking-widest font-mono">{hasSessionData ? 'SESSION ACTIVE' : 'NO FLEET DATA'}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            { icon: Server, label: 'This Session', value: hasSessionData ? '1 Terminal' : '0 Terminals', sub: 'Local node only', color: '#0A84FF' },
            { icon: Activity, label: 'Heart Rate', value: hasSessionData ? `${sessionHr} BPM` : '—', sub: hasSessionData ? 'Current reading' : 'Awaiting scan', color: '#30D158' },
            { icon: TrendingUp, label: 'Fleet Network', value: 'Offline', sub: 'Requires distributed nodes', color: '#BF5AF2' },
          ].map(card => {
            const Icon = card.icon;
            const isActive = hasSessionData || card.label === 'Fleet Network';
            return (
              <div key={card.label} className="bg-[#0B0B0D] rounded-xl border border-[#1E1E22] p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${card.color}15` }}>
                    <Icon className="w-4 h-4" style={{ color: card.color }} />
                  </div>
                </div>
                <div className="text-[32px] font-bold text-white leading-none font-mono mb-1">{card.value}</div>
                <div className="text-[10px] text-[#8E8E93] tracking-widest uppercase font-medium">{card.label}</div>
                <div className="text-[11px] text-[#8E8E93]/60 mt-0.5">{card.sub}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Empty state - no fleet data available */}
      <div className="flex-1 bg-[#16161A] rounded-2xl border border-[#1E1E22] flex flex-col min-h-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1E1E22] flex-shrink-0">
          <span className="text-[13px] font-semibold text-white">Clinical Audit Data Log</span>
          <p className="text-[11px] text-[#8E8E93] mt-0.5">Real-time distributed screening events</p>
        </div>

        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-2xl bg-[#0A84FF]/5 border border-[#0A84FF]/15 flex items-center justify-center mx-auto mb-4">
              <WifiOff className="w-7 h-7 text-[#0A84FF]/50" />
            </div>
            <h3 className="text-[16px] font-bold text-white mb-2">No Fleet Nodes Connected</h3>
            <p className="text-[13px] text-[#8E8E93] leading-relaxed">
              The Enterprise Fleet dashboard displays data from distributed screening terminals.
              Connect additional nodes to view aggregated audit logs, risk analysis, and network-wide telemetry.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
