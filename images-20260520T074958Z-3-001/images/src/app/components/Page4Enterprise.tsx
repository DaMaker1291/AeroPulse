import { Activity, Server, TrendingUp } from 'lucide-react';

export function Page4Enterprise() {
  // Mock audit data
  const auditLogs = [
    {
      timestamp: '20:38:14',
      nodeId: 'Node-UK-0842',
      biomarker: 'Asymmetrical Lateral Extensor Lag (-34%)',
      riskTier: 'HIGH RISK',
      action: 'EHR Alert Sent to On-Call Neurology'
    },
    {
      timestamp: '20:35:22',
      nodeId: 'Node-US-2104',
      biomarker: 'Elevated rPPG Arterial Stiffness Index',
      riskTier: 'MODERATE RISK',
      action: 'Follow-Up Appointment Scheduled'
    },
    {
      timestamp: '20:32:41',
      nodeId: 'Node-CA-0573',
      biomarker: 'Normal Bilateral Symmetry (96%)',
      riskTier: 'LOW RISK',
      action: 'Cleared - Routine Health Checkup'
    },
    {
      timestamp: '20:29:18',
      nodeId: 'Node-AU-1829',
      biomarker: 'Micro-Tremor Frequency Spike (9.2 Hz)',
      riskTier: 'HIGH RISK',
      action: 'Urgent Lab Panel Ordered'
    },
    {
      timestamp: '20:24:55',
      nodeId: 'Node-JP-0391',
      biomarker: 'Subclinical Neuromuscular Lag (68 ms)',
      riskTier: 'MODERATE RISK',
      action: 'Physical Therapy Referral Initiated'
    },
    {
      timestamp: '20:21:03',
      nodeId: 'Node-DE-1456',
      biomarker: 'Optimal Force Recruitment Pattern',
      riskTier: 'LOW RISK',
      action: 'Report Archived - No Action Required'
    },
    {
      timestamp: '20:17:39',
      nodeId: 'Node-BR-2673',
      biomarker: 'Vascular Compliance Below Threshold',
      riskTier: 'MODERATE RISK',
      action: 'Cardiology Consult Recommended'
    },
    {
      timestamp: '20:14:22',
      nodeId: 'Node-IN-0918',
      biomarker: 'Critical Hand Strength Asymmetry (-42%)',
      riskTier: 'HIGH RISK',
      action: 'Emergency Stroke Protocol Activated'
    },
    {
      timestamp: '20:11:47',
      nodeId: 'Node-FR-1234',
      biomarker: 'Baseline Vitals Within Range',
      riskTier: 'LOW RISK',
      action: 'Preventative Care Plan Updated'
    },
    {
      timestamp: '20:08:11',
      nodeId: 'Node-SG-0755',
      biomarker: 'Tremor Amplitude Exceeds Safe Threshold',
      riskTier: 'HIGH RISK',
      action: 'Neurological Assessment Fast-Tracked'
    }
  ];

  const getRiskColor = (tier: string) => {
    switch (tier) {
      case 'HIGH RISK':
        return 'bg-[#FF453A]/20 text-[#FF453A] border border-[#FF453A]';
      case 'MODERATE RISK':
        return 'bg-[#FF9F0A]/20 text-[#FF9F0A] border border-[#FF9F0A]';
      case 'LOW RISK':
        return 'bg-[#8E8E93]/20 text-[#8E8E93] border border-[#8E8E93]';
      default:
        return 'bg-[#8E8E93]/20 text-[#8E8E93]';
    }
  };

  return (
    <div className="flex flex-col gap-5 h-full">
      {/* Top: Core Operational Cards */}
      <div className="bg-[#16161A] rounded-xl p-6 border border-[#2C2C2E]">
        <h3 className="text-[14px] text-[#8E8E93] tracking-wider uppercase mb-4">Global Network Telemetry</h3>
        <div className="grid grid-cols-3 gap-6">
          {/* Active Fleet Nodes */}
          <div className="bg-[#0B0B0D] rounded-lg p-5 border border-[#2C2C2E]">
            <div className="flex items-center gap-3 mb-3">
              <Server className="w-5 h-5 text-[#0A84FF]" />
              <span className="text-[11px] text-[#8E8E93] tracking-wider uppercase">Active Fleet Nodes</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-medium text-white">1,240</span>
            </div>
            <p className="text-[11px] text-[#8E8E93] mt-2">Active Global Terminals</p>
          </div>

          {/* Total Screenings */}
          <div className="bg-[#0B0B0D] rounded-lg p-5 border border-[#2C2C2E]">
            <div className="flex items-center gap-3 mb-3">
              <Activity className="w-5 h-5 text-[#30D158]" />
              <span className="text-[11px] text-[#8E8E93] tracking-wider uppercase">Total Screenings</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-medium text-white">412,905</span>
            </div>
            <p className="text-[11px] text-[#8E8E93] mt-2">Valid Digital Triage Paths</p>
          </div>

          {/* Preventative Capture Rate */}
          <div className="bg-[#0B0B0D] rounded-lg p-5 border border-[#2C2C2E]">
            <div className="flex items-center gap-3 mb-3">
              <TrendingUp className="w-5 h-5 text-[#0A84FF]" />
              <span className="text-[11px] text-[#8E8E93] tracking-wider uppercase">Intervention Rate</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-medium text-white">84.2</span>
              <span className="text-[14px] text-[#8E8E93]">%</span>
            </div>
            <p className="text-[11px] text-[#8E8E93] mt-2">Capture Efficiency</p>
          </div>
        </div>
      </div>

      {/* Main: Clinical Audit Data Logging Table */}
      <div className="flex-1 bg-[#16161A] rounded-xl p-6 border border-[#2C2C2E] overflow-hidden flex flex-col">
        <div className="mb-4">
          <h3 className="text-[14px] text-[#8E8E93] tracking-wider uppercase">Clinical Audit Data Log</h3>
          <p className="text-[11px] text-[#8E8E93] mt-1">Real-time distributed screening events</p>
        </div>

        {/* Table Container with Scroll */}
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-[#0B0B0D] border-b border-[#2C2C2E]">
              <tr>
                <th className="text-left py-3 px-4 text-[11px] text-[#8E8E93] tracking-wider uppercase font-medium">
                  Timestamp
                </th>
                <th className="text-left py-3 px-4 text-[11px] text-[#8E8E93] tracking-wider uppercase font-medium">
                  Kiosk Node ID
                </th>
                <th className="text-left py-3 px-4 text-[11px] text-[#8E8E93] tracking-wider uppercase font-medium">
                  Primary Biomarker Signal
                </th>
                <th className="text-left py-3 px-4 text-[11px] text-[#8E8E93] tracking-wider uppercase font-medium">
                  Risk Tier
                </th>
                <th className="text-left py-3 px-4 text-[11px] text-[#8E8E93] tracking-wider uppercase font-medium">
                  Automated Action
                </th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log, idx) => (
                <tr
                  key={idx}
                  className="border-b border-[#1C1C1E] hover:bg-[#0B0B0D]/50 transition-colors"
                >
                  <td className="py-4 px-4 text-[14px] text-white font-mono">
                    {log.timestamp}
                  </td>
                  <td className="py-4 px-4 text-[14px] text-[#0A84FF]">
                    {log.nodeId}
                  </td>
                  <td className="py-4 px-4 text-[14px] text-white">
                    {log.biomarker}
                  </td>
                  <td className="py-4 px-4">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-medium tracking-wider ${getRiskColor(log.riskTier)}`}>
                      {log.riskTier}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-[14px] text-[#8E8E93]">
                    {log.action}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Table Footer Stats */}
        <div className="mt-4 pt-4 border-t border-[#2C2C2E] flex items-center justify-between">
          <div className="text-[11px] text-[#8E8E93]">
            Displaying {auditLogs.length} most recent events
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#30D158] animate-pulse"></div>
              <span className="text-[11px] text-[#8E8E93]">Live Stream Active</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
