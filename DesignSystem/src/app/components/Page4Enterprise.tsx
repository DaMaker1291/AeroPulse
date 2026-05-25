import { Server, Activity, TrendingUp, Globe, ArrowUpRight } from 'lucide-react';

const auditLogs = [
  { timestamp: '20:38:14', nodeId: 'Node-UK-0842', biomarker: 'Asymmetrical Lateral Extensor Lag (−34%)', riskTier: 'HIGH RISK', action: 'EHR Alert Sent to On-Call Neurology' },
  { timestamp: '20:35:22', nodeId: 'Node-US-2104', biomarker: 'Elevated rPPG Arterial Stiffness Index', riskTier: 'MODERATE RISK', action: 'Follow-Up Appointment Scheduled' },
  { timestamp: '20:32:41', nodeId: 'Node-CA-0573', biomarker: 'Normal Bilateral Symmetry (96%)', riskTier: 'LOW RISK', action: 'Cleared — Routine Health Checkup' },
  { timestamp: '20:29:18', nodeId: 'Node-AU-1829', biomarker: 'Micro-Tremor Frequency Spike (9.2 Hz)', riskTier: 'HIGH RISK', action: 'Urgent Lab Panel Ordered' },
  { timestamp: '20:24:55', nodeId: 'Node-JP-0391', biomarker: 'Subclinical Neuromuscular Lag (68 ms)', riskTier: 'MODERATE RISK', action: 'Physical Therapy Referral Initiated' },
  { timestamp: '20:21:03', nodeId: 'Node-DE-1456', biomarker: 'Optimal Force Recruitment Pattern', riskTier: 'LOW RISK', action: 'Report Archived — No Action Required' },
  { timestamp: '20:17:39', nodeId: 'Node-BR-2673', biomarker: 'Vascular Compliance Below Threshold', riskTier: 'MODERATE RISK', action: 'Cardiology Consult Recommended' },
  { timestamp: '20:14:22', nodeId: 'Node-IN-0918', biomarker: 'Critical Hand Strength Asymmetry (−42%)', riskTier: 'HIGH RISK', action: 'Emergency Stroke Protocol Activated' },
  { timestamp: '20:11:47', nodeId: 'Node-FR-1234', biomarker: 'Baseline Vitals Within Normal Range', riskTier: 'LOW RISK', action: 'Preventative Care Plan Updated' },
  { timestamp: '20:08:11', nodeId: 'Node-SG-0755', biomarker: 'Tremor Amplitude Exceeds Safe Threshold', riskTier: 'HIGH RISK', action: 'Neurological Assessment Fast-Tracked' },
];

const riskConfig: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  'HIGH RISK': { bg: '#FF453A08', text: '#FF453A', border: '#FF453A25', dot: '#FF453A' },
  'MODERATE RISK': { bg: '#FF9F0A08', text: '#FF9F0A', border: '#FF9F0A25', dot: '#FF9F0A' },
  'LOW RISK': { bg: '#8E8E9308', text: '#8E8E93', border: '#8E8E9325', dot: '#8E8E93' },
};

const statCards = [
  { icon: Server, label: 'Active Fleet Nodes', value: '1,240', sub: 'Global terminals online', color: '#0A84FF', trend: '+12 this week' },
  { icon: Activity, label: 'Total Screenings', value: '412,905', sub: 'Valid triage paths completed', color: '#30D158', trend: '+2,341 today' },
  { icon: TrendingUp, label: 'Intervention Rate', value: '84.2%', sub: 'Preventative capture efficiency', color: '#BF5AF2', trend: '+1.3% vs last month' },
];

export function Page4Enterprise() {
  const highRiskCount = auditLogs.filter(l => l.riskTier === 'HIGH RISK').length;
  const modRiskCount = auditLogs.filter(l => l.riskTier === 'MODERATE RISK').length;
  const lowRiskCount = auditLogs.filter(l => l.riskTier === 'LOW RISK').length;

  return (
    <div className="flex flex-col gap-4 h-full">

      {/* Fleet telemetry stat cards */}
      <div className="bg-[#16161A] rounded-2xl border border-[#1E1E22] p-5 flex-shrink-0">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-4 h-4 text-[#0A84FF]" />
          <span className="text-[13px] font-semibold text-white">Global Network Telemetry</span>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#30D158]" style={{ animation: 'pulse 2s ease-in-out infinite' }} />
            <span className="text-[10px] text-[#8E8E93] tracking-widest font-mono">LIVE FEED</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {statCards.map(card => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="bg-[#0B0B0D] rounded-xl border border-[#1E1E22] p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${card.color}15` }}>
                    <Icon className="w-4 h-4" style={{ color: card.color }} />
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-[#30D158]">
                    <ArrowUpRight className="w-3 h-3" />
                    <span className="font-mono">{card.trend}</span>
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

      {/* Audit log table */}
      <div className="flex-1 bg-[#16161A] rounded-2xl border border-[#1E1E22] flex flex-col min-h-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1E1E22] flex items-center gap-4 flex-shrink-0">
          <div>
            <span className="text-[13px] font-semibold text-white">Clinical Audit Data Log</span>
            <p className="text-[11px] text-[#8E8E93] mt-0.5">Real-time distributed screening events</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {/* Risk summary pills */}
            {[
              { label: 'High', count: highRiskCount, color: '#FF453A' },
              { label: 'Moderate', count: modRiskCount, color: '#FF9F0A' },
              { label: 'Low', count: lowRiskCount, color: '#8E8E93' },
            ].map(r => (
              <div key={r.label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border" style={{ borderColor: `${r.color}25`, backgroundColor: `${r.color}08` }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: r.color }} />
                <span className="text-[10px] font-mono" style={{ color: r.color }}>{r.count}</span>
                <span className="text-[10px] text-[#8E8E93]">{r.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-[#111115] border-b border-[#1E1E22] z-10">
              <tr>
                {['Timestamp', 'Kiosk Node ID', 'Primary Biomarker Signal', 'Risk Tier', 'Automated Action'].map(col => (
                  <th key={col} className="text-left py-3 px-5 text-[10px] text-[#8E8E93] tracking-widest uppercase font-semibold whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log, idx) => {
                const risk = riskConfig[log.riskTier];
                return (
                  <tr
                    key={idx}
                    className="border-b border-[#1A1A1E] hover:bg-[#0B0B0D]/60 transition-colors group"
                  >
                    <td className="py-3.5 px-5 text-[12px] font-mono text-[#8E8E93] whitespace-nowrap">
                      {log.timestamp}
                    </td>
                    <td className="py-3.5 px-5">
                      <span className="text-[12px] font-mono font-medium text-[#0A84FF]">{log.nodeId}</span>
                    </td>
                    <td className="py-3.5 px-5 text-[13px] text-white max-w-[280px] truncate">
                      {log.biomarker}
                    </td>
                    <td className="py-3.5 px-5">
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-widest border"
                        style={{ backgroundColor: risk.bg, color: risk.text, borderColor: risk.border }}
                      >
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: risk.dot }} />
                        {log.riskTier}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-[12px] text-[#8E8E93] group-hover:text-[#AEAEB2] transition-colors">
                      {log.action}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#1E1E22] flex items-center justify-between flex-shrink-0">
          <span className="text-[11px] text-[#8E8E93]">
            Showing <span className="text-white font-mono">{auditLogs.length}</span> most recent events
          </span>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#30D158]" style={{ animation: 'pulse 2s ease-in-out infinite' }} />
            <span className="text-[11px] text-[#8E8E93]">Live stream active</span>
          </div>
        </div>
      </div>
    </div>
  );
}
