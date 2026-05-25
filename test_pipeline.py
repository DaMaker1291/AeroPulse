"""Comprehensive test of the rPPG pipeline with synthetic signals."""
import numpy as np
from rppg_pipeline import (
    resample_pchip, butterworth_bp_6th, pos_batch,
    lomb_scargle_tfa, smooth_peak_powers, compute_accuracy_metrics,
    TARGET_FS
)

fs = 30.0
duration = 30.0
t = np.arange(0, duration, 1 / fs)
np.random.seed(42)

dc_r, dc_g, dc_b = 140.0, 120.0, 100.0
ac_r, ac_g, ac_b = 0.7, 2.5, 1.2

results = []
for hr_true in [50, 60, 72, 80, 90, 100, 120]:
    hr_hz = hr_true / 60.0
    for trial in range(3):
        pulse_gen = np.sin(2 * np.pi * hr_hz * t) + \
            0.2 * np.sin(4 * np.pi * hr_hz * t + np.pi / 4)
        r = dc_r + ac_r * pulse_gen + 0.3 * np.random.randn(len(t))
        g = dc_g + ac_g * pulse_gen + 0.2 * np.random.randn(len(t))
        b = dc_b + ac_b * pulse_gen + 0.4 * np.random.randn(len(t))
        drift = 3.0 * np.sin(2 * np.pi * 0.05 * (t + trial))
        r += drift
        g += drift * 0.7
        b += drift * 0.5

        rgb60 = np.zeros((3, 0))
        for ch, sig in enumerate([r, g, b]):
            sig60 = resample_pchip(sig, fs, TARGET_FS)
            if ch == 0:
                rgb60 = np.zeros((3, len(sig60)))
            rgb60[ch] = sig60

        pulse = pos_batch(rgb60, TARGET_FS)
        pulse = butterworth_bp_6th(pulse, TARGET_FS)
        hr_bpm, _, _ = lomb_scargle_tfa(pulse, TARGET_FS)
        if hr_bpm is not None:
            hr_s = smooth_peak_powers(hr_bpm)
            results.append((hr_true, float(hr_s[-1])))

est_arr = np.array([r[1] for r in results])
gt_arr = np.array([r[0] for r in results])

for hr_true, hr_est in results:
    err = abs(hr_est - hr_true)
    marker = "OK" if err < 3.0 else "WARN" if err < 6.0 else "FAIL"
    print(f"True={hr_true:>5.1f} BPM  Est={hr_est:>7.2f} BPM  "
          f"Err={err:>5.2f} BPM  [{marker}]")

metrics = compute_accuracy_metrics(est_arr, gt_arr)
print(f"\nOverall metrics ({len(results)} trials):")
for k, v in metrics.items():
    if isinstance(v, float):
        print(f"  {k}: {v:.4f}")
    else:
        print(f"  {k}: {v}")
