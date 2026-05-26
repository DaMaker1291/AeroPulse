import { Heart, Camera, BarChart3, BookOpen, FlaskConical, Users, Shield, Monitor, Activity, ScanLine, ArrowRight, Brain } from 'lucide-react';

const features = [
  {
    icon: Monitor,
    label: 'No wearables required',
    desc: 'Uses the participant\'s webcam',
    color: '#0A84FF',
  },
  {
    icon: Shield,
    label: 'GDPR-compliant',
    desc: 'Client-side processing, no data leaves the device',
    color: '#30D158',
  },
  {
    icon: Users,
    label: 'Remote & scalable',
    desc: 'Suitable for remote participation on personal devices',
    color: '#BF5AF2',
  },
];

const dataCollected = [
  { label: 'Heart Rate (BPM)', desc: 'Real-time cardiac pulse measurement', color: '#FF453A' },
  { label: 'Time-stamped events', desc: 'Aligned with experimental conditions', color: '#FF9F0A' },
  { label: 'Confidence intervals', desc: 'Measurement reliability metrics', color: '#0A84FF' },
  { label: 'Exportable data', desc: 'Compatible with standard analysis tools', color: '#30D158' },
];

const applications = [
  {
    icon: FlaskConical,
    title: 'Emotional & Affective Processing',
    desc: 'Assessing physiological responses to emotional stimuli, stress, or arousal',
    color: '#FF453A',
  },
  {
    icon: Brain,
    title: 'Cognitive Load & Attention',
    desc: 'Tracking heart rate changes associated with task difficulty or attentional demands',
    color: '#FF9F0A',
  },
  {
    icon: Monitor,
    title: 'Human-Computer Interaction',
    desc: 'Evaluating user responses during interaction with digital interfaces or environments',
    color: '#0A84FF',
  },
  {
    icon: Users,
    title: 'Remote & Longitudinal Studies',
    desc: 'Collecting physiological data across extended time periods or distributed samples',
    color: '#BF5AF2',
  },
  {
    icon: BarChart3,
    title: 'Multimodal Experimental Designs',
    desc: 'Integrating heart rate data with behavioral, cognitive, and self-report measures',
    color: '#30D158',
  },
];

export function Page5Labvanced() {
  return (
    <div className="flex flex-col gap-4 h-full overflow-auto">
      {/* Hero section */}
      <div className="bg-[#16161A] rounded-2xl border border-[#1E1E22] p-6 flex-shrink-0">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#FF453A]/15 border border-[#FF453A]/25 flex items-center justify-center flex-shrink-0">
            <Heart className="w-5 h-5 text-[#FF453A]" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[11px] text-[#FF453A] font-bold tracking-widest uppercase">LabVanced · rPPG</span>
              <span className="text-[10px] text-[#8E8E93] font-mono">v2.0</span>
            </div>
            <h1 className="text-[20px] font-bold text-white leading-tight">Remote Heart Rate Detection</h1>
            <p className="text-[13px] text-[#8E8E93] mt-0.5">
              Remote photoplethysmography (rPPG) — contact-free cardiac monitoring via webcam for online experimental research
            </p>
          </div>
        </div>

        <div className="bg-[#0B0B0D] rounded-xl border border-[#1E1E22] p-4">
          <p className="text-[13px] text-[#AEAEB2] leading-relaxed">
            Labvanced supports remote photoplethysmography (rPPG), allowing researchers to collect heart rate (BPM) data using participants' webcams, eliminating the need for physical sensors or lab equipment. Physiological measurements can be recorded remotely or online, during cognitive, behavioral, or affective tasks, without the need for physical sensors.
          </p>
        </div>
      </div>

      {/* What is rPPG */}
      <div className="grid grid-cols-3 gap-4 flex-shrink-0">
        <div className="col-span-2 bg-[#16161A] rounded-2xl border border-[#1E1E22] p-5">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4 text-[#0A84FF]" />
            <span className="text-[13px] font-semibold text-white">What is rPPG?</span>
          </div>
          <p className="text-[13px] text-[#AEAEB2] leading-relaxed mb-3">
            Remote photoplethysmography (rPPG) is a computer-vision-based method for estimating heart rate by analyzing subtle changes in skin color caused by blood flow. These changes are captured using a standard camera, such as a participant's webcam.
          </p>
          <p className="text-[13px] text-[#AEAEB2] leading-relaxed">
            Unlike traditional PPG, which requires contact sensors (e.g., finger clips or wearables), rPPG works without physical contact, making it suitable for remote, online, and naturalistic research settings. rPPG enables the integration of cardiovascular signals into remote and large-scale studies, expanding what can be measured beyond self-report and behavioral data.
          </p>
        </div>

        <div className="bg-[#16161A] rounded-2xl border border-[#1E1E22] p-5">
          <div className="flex items-center gap-2 mb-3">
            <Heart className="w-4 h-4 text-[#FF453A]" />
            <span className="text-[13px] font-semibold text-white">Key Advantage</span>
          </div>
          <div className="space-y-3">
            {features.map(f => {
              const Icon = f.icon;
              return (
                <div key={f.label} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${f.color}15` }}>
                    <Icon className="w-3.5 h-3.5" style={{ color: f.color }} />
                  </div>
                  <div>
                    <div className="text-[12px] font-semibold text-white">{f.label}</div>
                    <div className="text-[11px] text-[#8E8E93]">{f.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-[#16161A] rounded-2xl border border-[#1E1E22] p-5 flex-shrink-0">
        <div className="flex items-center gap-2 mb-4">
          <Camera className="w-4 h-4 text-[#0A84FF]" />
          <span className="text-[13px] font-semibold text-white">rPPG in Labvanced: How It Works</span>
        </div>
        <div className="bg-[#0B0B0D] rounded-xl border border-[#1E1E22] p-4 mb-4">
          <p className="text-[13px] text-[#AEAEB2] leading-relaxed">
            Labvanced integrates rPPG directly into the experimental workflow, allowing researchers to collect physiological data alongside behavioral and task-based measures. Activating remote heart rate detection can be done with just a few simple clicks.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { icon: Activity, label: 'Activated easily', desc: 'Part of study configuration' },
            { icon: ScanLine, label: 'Runs during tasks', desc: 'Stimuli presentation or defined windows' },
            { icon: FlaskConical, label: 'Combine measures', desc: 'Surveys, RT tasks, manipulations' },
          ].map(item => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="bg-[#0B0B0D] rounded-xl border border-[#1E1E22] p-3.5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#0A84FF]/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-[#0A84FF]" />
                </div>
                <div>
                  <div className="text-[12px] font-semibold text-white">{item.label}</div>
                  <div className="text-[11px] text-[#8E8E93]">{item.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Data collected */}
      <div className="bg-[#16161A] rounded-2xl border border-[#1E1E22] p-5 flex-shrink-0">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-[#30D158]" />
          <span className="text-[13px] font-semibold text-white">Data Collected with rPPG in Labvanced</span>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {dataCollected.map(d => (
            <div key={d.label} className="bg-[#0B0B0D] rounded-xl border border-[#1E1E22] p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="text-[11px] text-[#8E8E93] tracking-widest uppercase font-medium">{d.label}</span>
              </div>
              <p className="text-[12px] text-white">{d.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Methodological Foundation */}
      <div className="grid grid-cols-5 gap-4 flex-shrink-0">
        <div className="col-span-3 bg-[#16161A] rounded-2xl border border-[#1E1E22] p-5">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4 text-[#BF5AF2]" />
            <span className="text-[13px] font-semibold text-white">Methodological Foundation</span>
          </div>
          <p className="text-[13px] text-[#AEAEB2] leading-relaxed mb-3">
            Labvanced's rPPG implementation is based on computer-vision and signal-processing methods that demonstrate robust remote heart rate estimation from video recordings under realistic conditions.
          </p>
          <p className="text-[13px] text-[#AEAEB2] leading-relaxed">
            This research-driven foundation ensures that rPPG measurements in Labvanced align with state-of-the-art scientific methods while remaining practical for online experimental use.
          </p>
        </div>

        <div className="col-span-2 bg-[#16161A] rounded-2xl border border-[#1E1E22] p-5">
          <div className="flex items-center gap-2 mb-3">
            <Heart className="w-4 h-4 text-[#30D158]" />
            <span className="text-[13px] font-semibold text-white">Methodological Advantages</span>
          </div>
          <ul className="space-y-2">
            {[
              'Multimodal integration with behavioral & self-report data',
              'Non-intrusive — no physical sensors needed',
              'Remote data collection outside the lab',
              'Scalable study designs with diverse samples',
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] text-[#AEAEB2]">
                <ArrowRight className="w-3 h-3 text-[#0A84FF] mt-0.5 flex-shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Research Applications */}
      <div className="bg-[#16161A] rounded-2xl border border-[#1E1E22] p-5 flex-shrink-0">
        <div className="flex items-center gap-2 mb-4">
          <FlaskConical className="w-4 h-4 text-[#FF9F0A]" />
          <span className="text-[13px] font-semibold text-white">Research Applications</span>
        </div>
        <div className="grid grid-cols-5 gap-3">
          {applications.map(app => {
            const Icon = app.icon;
            return (
              <div key={app.title} className="bg-[#0B0B0D] rounded-xl border border-[#1E1E22] p-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2.5" style={{ backgroundColor: `${app.color}15` }}>
                  <Icon className="w-4 h-4" style={{ color: app.color }} />
                </div>
                <div className="text-[12px] font-semibold text-white leading-snug mb-1.5">{app.title}</div>
                <p className="text-[11px] text-[#8E8E93] leading-relaxed">{app.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* CTA */}
      <div className="bg-[#16161A] rounded-2xl border border-[#1E1E22] p-5 flex-shrink-0 mb-2">
        <div className="bg-gradient-to-r from-[#0A84FF]/10 to-[#BF5AF2]/10 rounded-xl border border-[#0A84FF]/20 p-5 flex items-center justify-between">
          <div>
            <h3 className="text-[15px] font-bold text-white mb-1">Use rPPG in Your Next Study</h3>
            <p className="text-[12px] text-[#8E8E93] max-w-xl">
              Combine heart rate with cognitive tasks and surveys. Run studies remotely at scale. Expand the range of measurable research outcomes.
            </p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0A84FF] text-white text-[12px] font-semibold">
            <span>Explore rPPG</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>
    </div>
  );
}
