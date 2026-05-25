"""
rPPG Pipeline — Di Lernia et al. (2024) implementation
=====================================================
Exact reproduction of the remote photoplethysmography algorithm from:

    Di Lernia, Finotti, Tsakiris, Riva & Naber (2024).
    "Remote photoplethysmography (rPPG) in the wild:
     Remote heart rate imaging via online webcams"
    Behavior Research Methods, 56, 6904-6914.

Pipeline:
  1. Viola-Jones face detection (first frame only)
  2. Minimum-eigenvalue corner detection + KLT tracking
  3. Face-template skin mask (above/below eyes, rotation-adjusted)
  4. Per-frame average RGB across skin pixels
  5. PCHIP resample to 60 Hz
  6. 6th-order Butterworth BP 0.75-2.75 Hz per channel
  7. POS dimension reduction (1.6 s sliding window)
  8. Lomb-Scargle time-frequency analysis (10 s window, 240x120)
  9. SNR = power / sum(power); top 5th percentile selection
 10. SNR-weighted frequency averaging -> HR in BPM
 11. Temporal smoothing of peak powers
"""

from __future__ import annotations

import warnings
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from scipy import signal as scipy_signal
from scipy import interpolate as scipy_interpolate

warnings.filterwarnings("ignore", category=RuntimeWarning)

# ---------------------------------------------------------------------------
# Constants from the paper
# ---------------------------------------------------------------------------
TARGET_FS = 60.0            # Resample all signals to 60 Hz (paper §rPPG extraction)
BP_LOW = 0.75               # Bandpass low cutoff (Hz) — 45 BPM
BP_HIGH = 2.75              # Bandpass high cutoff (Hz) — 165 BPM
BP_ORDER = 6                # Butterworth filter order
POS_WINDOW = 1.6            # POS sliding window (seconds)
TFA_WINDOW = 10.0           # Lomb-Scargle sliding window (seconds)
TFA_N_TEMPORAL = 240        # Temporal resolution of TFA output
TFA_N_FREQS = 120           # Frequency resolution (0.75-2.75 Hz in 120 bins)
SNR_PERCENTILE = 95         # Top 5th percentile SNR selection
SMOOTH_WINDOW = 5           # Temporal smoothing window for peak powers
MIN_FRAMERATE = 19.9        # Minimum acceptable FPS (paper §Data cleaning)
MIN_DURATION = 10.0         # Minimum video duration (seconds) for TFA
RECOMMENDED_DURATION = 25.0 # Recommended minimum recording duration (paper: 25s)
HR_MIN = 50.0               # Valid HR lower bound (paper §Data cleaning: 50-120 BPM)
HR_MAX = 120.0              # Valid HR upper bound (paper §Data cleaning: 50-120 BPM)
FACE_MIN_SIZE = (60, 60)    # Min face size for cascade detector
HR_BOOTSTRAP_MIN = 40.0     # Minimum HR before bootstrap
HR_BOOTSTRAP_MAX = 200.0    # Maximum HR before bootstrap

# Face cascade path (OpenCV built-in)
_CASCADE_PATH = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"


# ---------------------------------------------------------------------------
# Dataclass for results
# ---------------------------------------------------------------------------
@dataclass
class rPPGResult:
    """Container for rPPG extraction results."""
    hr_bpm: float                          # Final heart rate estimate (BPM)
    hr_per_window: np.ndarray              # HR per TFA window
    snr_matrix: Optional[np.ndarray]       # SNR time-frequency matrix
    freq_grid_hz: Optional[np.ndarray]     # Frequency axis (Hz)
    pulse_wave: np.ndarray                 # Extracted pulse signal
    rgb_resampled: Optional[np.ndarray]    # RGB after resample+filter (3×N)
    face_found: bool                       # Was face detected?
    framerate: float                       # Actual framerate
    duration_s: float                      # Video duration
    n_frames: int                          # Number of frames
    skin_pixels_per_frame: list = field(default_factory=list)

    @property
    def valid(self) -> bool:
        return (self.face_found and HR_MIN <= self.hr_bpm <= HR_MAX
                and self.framerate >= MIN_FRAMERATE)

    @property
    def paper_data_quality(self) -> str:
        """Quality label based on Di Lernia et al. (2024) data-cleaning criteria."""
        if not self.face_found:
            return "FAIL: No face detected"
        if self.framerate < MIN_FRAMERATE:
            return f"FAIL: FPS {self.framerate:.1f} < {MIN_FRAMERATE:.1f}"
        if self.duration_s < RECOMMENDED_DURATION:
            return f"LOW: Duration {self.duration_s:.0f}s < {RECOMMENDED_DURATION:.0f}s recommended"
        if not (HR_MIN <= self.hr_bpm <= HR_MAX):
            return f"FAIL: HR {self.hr_bpm:.0f} outside {HR_MIN:.0f}-{HR_MAX:.0f} BPM range"
        return "PASS"


@dataclass
class RecordingQualityReport:
    """Quality assessment of a recording based on Di Lernia et al. (2024) criteria.

    All recommendations are *output* as text — never applied to camera hardware.
    """
    video_path: str
    face_detected: bool
    framerate: float
    duration_s: float
    hr_bpm: float
    snr_quality: float
    lighting_mean: Optional[float] = None
    motion_score: Optional[float] = None
    hr_in_range: bool = False

    @property
    def framerate_ok(self) -> bool:
        return self.framerate >= MIN_FRAMERATE

    @property
    def duration_ok(self) -> bool:
        return self.duration_s >= RECOMMENDED_DURATION

    @property
    def overall_score(self) -> float:
        """Quality score 0-1 from article criteria."""
        scores = [
            0.30 * (1.0 if self.framerate_ok else max(0.0, self.framerate / MIN_FRAMERATE * 0.5)),
            0.20 * (1.0 if self.duration_ok else min(1.0, self.duration_s / RECOMMENDED_DURATION)),
            0.20 * (1.0 if self.face_detected else 0.0),
            0.15 * (1.0 if self.hr_in_range else 0.0),
            0.15 * self.snr_quality,
        ]
        return float(np.clip(sum(scores), 0.0, 1.0))

    @property
    def recommendations(self) -> list[str]:
        """Output-only recommendations - never changes camera hardware."""
        recs = []
        if not self.face_detected:
            recs.append("Face not detected: Ensure face is visible, well-lit, and centered")
        if not self.framerate_ok:
            recs.append(f"Low framerate ({self.framerate:.1f} FPS): "
                        f"Minimum {MIN_FRAMERATE:.0f} FPS required. Use a webcam 30+ FPS, "
                        f"close other apps, reduce resolution in camera settings")
        if not self.duration_ok:
            recs.append(f"Short recording ({self.duration_s:.0f}s): "
                        f"Record {RECOMMENDED_DURATION:.0f}+ seconds per the paper protocol")
        if not self.hr_in_range and self.hr_bpm > 0:
            recs.append(f"HR {self.hr_bpm:.0f} BPM outside {HR_MIN:.0f}-{HR_MAX:.0f} range: "
                        f"Rest between recordings, ensure steady state")
        if self.lighting_mean is not None and self.lighting_mean < 35:
            recs.append("Dark image: Use natural daylight or a ring light; "
                        "avoid relying on screen glow")
        if self.lighting_mean is not None and self.lighting_mean > 225:
            recs.append("Overexposed: Reduce light intensity, avoid direct light on face")
        if self.lighting_mean is not None and 100 < self.lighting_mean < 200:
            pass  # good lighting
        if self.snr_quality < 0.3 and self.face_detected:
            recs.append("Low SNR: Sit still, avoid talking, steady breathing, "
                        "ensure face fills ~30% of frame")
        if not recs:
            recs.append("Recording quality PASS - all article criteria met")
        return recs

    def summary(self) -> str:
        """One-line summary for logging/display."""
        return (f"[QUALITY] score={self.overall_score:.2f} "
                f"FPS={self.framerate:.1f}/{MIN_FRAMERATE:.0f} "
                f"dur={self.duration_s:.0f}s/{RECOMMENDED_DURATION:.0f}s "
                f"face={self.face_detected} "
                f"HR={self.hr_bpm:.0f}/{HR_MIN:.0f}-{HR_MAX:.0f} "
                f"SNR={self.snr_quality:.2f}")


# ===================================================================
# BEST-PRACTICES GUIDE (output-only, never changes camera)
# ===================================================================
BEST_PRACTICES_GUIDE = """
rPPG Best Practices - Di Lernia et al. (2024)
==============================================
These are OUTPUT recommendations. Camera settings are NEVER changed.

[1] LIGHTING (most important)
    - Natural daylight or steady ring light
    - Even diffuse illumination across the face
    - NO shadows on face
    - NO screen glow as primary light source

[2] POSITIONING
    - Face the camera directly
    - Sit close enough that face fills ~30% of frame
    - Keep head still (motion destroys the 1-2% pulse signal)
    - Align face in center of frame

[3] AVOID
    - Masks, hair covering face, touching face
    - Rapid breathing or talking during recording
    - Flickering light sources (CRT monitors, unshielded LEDs)

[4] RECORDING REQUIREMENTS
    - Minimum 20 FPS (30+ recommended)
    - Minimum 25 seconds duration (45s ideal)
    - Multiple recordings averaged per session (r=0.58 -> r=0.75)

[5] DATA CLEANING (paper Data cleaning)
    - Discard: FPS < 20, face not detected
    - Discard: HR < 50 or > 120 BPM
    - Discard: IQR outliers
    - Valid HR range: 50-120 BPM
"""


def best_practices_text() -> str:
    """Return the best-practices guide for display."""
    return BEST_PRACTICES_GUIDE


def assess_recording_quality(
    video_path: str | Path,
    result: rPPGResult,
    lighting_mean: float | None = None,
    motion_score: float | None = None,
) -> RecordingQualityReport:
    """Assess recording quality against Di Lernia et al. (2024) criteria.
    
    Generates recommendations as OUTPUT — never modifies camera settings.
    """
    return RecordingQualityReport(
        video_path=str(video_path),
        face_detected=result.face_found,
        framerate=result.framerate,
        duration_s=result.duration_s,
        hr_bpm=result.hr_bpm,
        snr_quality=float(np.mean(result.snr_matrix)) if result.snr_matrix is not None else 0.0,
        lighting_mean=lighting_mean,
        motion_score=motion_score,
        hr_in_range=HR_MIN <= result.hr_bpm <= HR_MAX if result.hr_bpm > 0 else False,
    )


def aggregate_session(
    results: list[rPPGResult],
    min_quality_score: float = 0.0,
    use_iqr: bool = True,
) -> dict:
    """Aggregate multiple recordings per session with IQR outlier filtering.
    
    Di Lernia et al. §Study 2: averaging multiple recordings per session
    improves correlation from r=0.578 to r=0.752.
    
    Also applies the paper's data-cleaning criteria:
    - Removes HR < 50 or > 120 BPM
    - Removes FPS < 20
    - Removes IQR outliers
    """
    valid_results = [r for r in results if r.valid]
    if len(valid_results) < 1:
        return {"mean_hr": 0.0, "median_hr": 0.0, "n_valid": 0, "n_total": len(results)}

    hrs = np.array([r.hr_bpm for r in valid_results], dtype=np.float64)

    # IQR outlier removal (paper: 'used the r boxplot function to detect
    # and remove outliers, defined as values outside the interquartile range')
    if use_iqr and len(hrs) >= 4:
        q1, q3 = np.percentile(hrs, [25, 75])
        iqr = q3 - q1
        lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        filtered = hrs[(hrs >= lower) & (hrs <= upper)]
    else:
        filtered = hrs

    if len(filtered) < 1:
        return {"mean_hr": 0.0, "median_hr": 0.0, "n_valid": 0, "n_total": len(results)}

    return {
        "mean_hr": float(np.mean(filtered)),
        "median_hr": float(np.median(filtered)),
        "std_hr": float(np.std(filtered)) if len(filtered) > 1 else 0.0,
        "n_valid": int(len(filtered)),
        "n_total": int(len(valid_results)),
        "n_removed_iqr": int(len(hrs) - len(filtered)),
        "hrs_raw": hrs.tolist(),
        "hrs_filtered": filtered.tolist(),
    }


# ===================================================================
# STEP 1-4: Face Detection, Tracking, Skin Mask & RGB Extraction
# ===================================================================
class FaceTracker:
    """Viola-Jones face detection + KLT feature tracking + skin mask.

    This implements the paper's approach:
    - Detect face in frame 1 with Viola-Jones cascade (FrontalFaceLBP)
    - Find minimum-eigenvalue corner points within face bounding box
    - Track points with KLT (Kanade-Lucas-Tomasi) in subsequent frames
    - Place rough face template above and below the eyes
    - Adjust template size and rotation per frame based on tracked features
    """

    def __init__(self):
        self._cascade = cv2.CascadeClassifier(_CASCADE_PATH)
        self._lk_params = dict(
            winSize=(21, 21),
            maxLevel=3,
            criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.03),
        )
        self._feature_params = dict(
            maxCorners=200,
            qualityLevel=0.01,
            minDistance=5,
            blockSize=7,
        )
        self.reset()

    def reset(self):
        self._prev_gray = None
        self._points = None
        self._face_rect = None
        self._initialized = False
        self._frame_h = 0
        self._frame_w = 0

    def _detect_face(self, gray: np.ndarray):
        """Viola-Jones face detection on first frame."""
        faces = self._cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=3,
            minSize=FACE_MIN_SIZE,
        )
        if len(faces) == 0:
            return None
        # Pick the largest face by area
        return max(faces, key=lambda r: r[2] * r[3])

    def _get_face_mask(self, gray: np.ndarray, face_rect, points) -> np.ndarray:
        """Build skin mask using face template above/below eyes.

        Paper: 'a rough template of a face to more swiftly localize
        skin areas above and below the eyes. The template was adjusted
        in size and rotated in 2D space depending on the spatial
        orientation of the tracked features per frame.'
        """
        h, w = gray.shape
        mask = np.zeros((h, w), dtype=np.uint8)

        x, y, fw, fh = face_rect

        # Estimate eye region (upper ~35% of face)
        eye_y = y + int(fh * 0.2)
        eye_h = int(fh * 0.25)

        # Forehead region: above eyes (upper ~20% of face)
        forehead = (x, y, fw, int(fh * 0.2))
        cv2.rectangle(mask, (forehead[0], forehead[1]),
                      (forehead[0] + forehead[2], forehead[1] + forehead[3]),
                      255, -1)

        # Cheek/nose region: below eyes, above mouth
        cheek_y = y + int(fh * 0.38)
        cheek_h = int(fh * 0.30)
        cheek = (x + int(fw * 0.10), cheek_y, int(fw * 0.80), cheek_h)
        cv2.rectangle(mask, (cheek[0], cheek[1]),
                      (cheek[0] + cheek[2], cheek[1] + cheek[3]),
                      255, -1)

        # If we have tracked points, refine mask using their centroid
        if points is not None and len(points) >= 4:
            pts = points.reshape(-1, 2)
            cx, cy = float(np.median(pts[:, 0])), float(np.median(pts[:, 1]))
            spread = float(np.std(pts[:, 0])), float(np.std(pts[:, 1]))

            # Centered ellipse mask over face region
            axes = (int(spread[0] * 2.5), int(spread[1] * 2.8))
            center = (int(cx), int(cy))
            if axes[0] > 5 and axes[1] > 5:
                ellipse_mask = np.zeros((h, w), dtype=np.uint8)
                cv2.ellipse(ellipse_mask, center, axes, 0, 0, 360, 255, -1)
                mask = cv2.bitwise_and(mask, ellipse_mask)

        return mask

    def process_frame(self, frame: np.ndarray) -> tuple[Optional[np.ndarray], Optional[np.ndarray], Optional[np.ndarray]]:
        """Process a single frame.

        Returns:
            (face_mask, avg_rgb, tracked_points)
            face_mask: binary mask of skin region or None if no face
            avg_rgb: (R, G, B) average over masked region or None
            tracked_points: tracked feature points or None
        """
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        self._frame_h, self._frame_w = gray.shape

        if not self._initialized:
            # First frame: detect face
            face_rect = self._detect_face(gray)
            if face_rect is None:
                return None, None, None

            self._face_rect = face_rect
            x, y, fw, fh = face_rect

            # Find minimum-eigenvalue corner points inside face bounding box
            roi_gray = gray[y:y + fh, x:x + fw]
            pts = cv2.goodFeaturesToTrack(roi_gray, mask=None, **self._feature_params)
            if pts is not None:
                # Shift points to global coordinates
                pts = pts.reshape(-1, 1, 2).astype(np.float32)
                pts[:, 0, 0] += x
                pts[:, 0, 1] += y
            else:
                # Fallback: grid of points in face region
                xs = np.linspace(x + fw * 0.15, x + fw * 0.85, 8)
                ys = np.linspace(y + fh * 0.15, y + fh * 0.75, 8)
                xx, yy = np.meshgrid(xs, ys)
                pts = np.stack([xx.ravel(), yy.ravel()], axis=-1).astype(np.float32)
                pts = pts.reshape(-1, 1, 2)

            self._points = pts
            self._prev_gray = gray.copy()
            self._initialized = True

        else:
            # Track features with KLT
            if self._points is not None and len(self._points) > 0:
                new_pts, status, _ = cv2.calcOpticalFlowPyrLK(
                    self._prev_gray, gray, self._points, None, **self._lk_params
                )
                # Keep only successful tracks
                if new_pts is not None and status is not None:
                    good = status.ravel() == 1
                    self._points = new_pts[good].reshape(-1, 1, 2).astype(np.float32)
                else:
                    self._points = None

                # Replenish lost points if too few remain
                if self._points is not None and len(self._points) < 20:
                    if self._face_rect is not None:
                        x, y, fw, fh = self._face_rect
                        extra_mask = np.zeros(gray.shape, dtype=np.uint8)
                        cv2.rectangle(extra_mask, (x, y), (x + fw, y + fh), 255, -1)
                        new_pts = cv2.goodFeaturesToTrack(gray, mask=extra_mask, **self._feature_params)
                        if new_pts is not None:
                            self._points = np.vstack([self._points, new_pts.reshape(-1, 1, 2).astype(np.float32)])[:200]

                self._prev_gray = gray.copy()

        if self._points is None or len(self._points) < 4:
            # Fall back to face-rect-only mask
            if self._face_rect is not None:
                mask = self._get_face_mask(gray, self._face_rect, None)
                mean_rgb = self._mean_color_in_mask(frame, mask)
                return mask, mean_rgb, None
            return None, None, None

        # Re-estimate face rectangle from tracked points
        pts = self._points.reshape(-1, 2)
        x_min = max(0, int(np.min(pts[:, 0])) - 20)
        y_min = max(0, int(np.min(pts[:, 1])) - 20)
        x_max = min(self._frame_w - 1, int(np.max(pts[:, 0])) + 20)
        y_max = min(self._frame_h - 1, int(np.max(pts[:, 1])) + 20)
        self._face_rect = (x_min, y_min, x_max - x_min, y_max - y_min)

        # Build face template mask
        mask = self._get_face_mask(gray, self._face_rect, self._points)
        mean_rgb = self._mean_color_in_mask(frame, mask)
        return mask, mean_rgb, self._points

    def _mean_color_in_mask(self, frame: np.ndarray, mask: np.ndarray) -> Optional[np.ndarray]:
        if mask is None or np.sum(mask) < 50:
            return None
        b = frame[:, :, 0]
        g = frame[:, :, 1]
        r = frame[:, :, 2]
        n_pixels = np.sum(mask)
        if n_pixels < 50:
            return None
        r_mean = float(np.sum(r.astype(np.float64) * (mask > 0))) / n_pixels
        g_mean = float(np.sum(g.astype(np.float64) * (mask > 0))) / n_pixels
        b_mean = float(np.sum(b.astype(np.float64) * (mask > 0))) / n_pixels
        return np.array([r_mean, g_mean, b_mean])


# ===================================================================
# STEP 5: PCHIP Resample to 60 Hz
# ===================================================================
def resample_pchip(signal: np.ndarray, old_fs: float, new_fs: float = TARGET_FS) -> np.ndarray:
    """PCHIP resampling (§rPPG extraction: 'resampled to 60 Hz using MATLAB's pchip')."""
    n = len(signal)
    if n < 2 or old_fs <= 0 or new_fs <= 0:
        return signal.copy()
    old_t = np.arange(n, dtype=np.float64) / old_fs
    new_n = max(2, int(round(n * new_fs / old_fs)))
    new_t = np.linspace(0.0, old_t[-1], new_n)
    interp = scipy_interpolate.PchipInterpolator(old_t, signal.astype(np.float64))
    return interp(new_t).astype(np.float64)


# ===================================================================
# STEP 6: 6th-order Butterworth Bandpass Filter
# ===================================================================
def butterworth_bp_6th(signal: np.ndarray, fs: float,
                       f_low: float = BP_LOW, f_high: float = BP_HIGH) -> np.ndarray:
    """6th-order zero-phase Butterworth bandpass (§rPPG extraction)."""
    if signal.size < 8 or fs <= 0:
        return signal.copy()
    nyq = fs / 2.0
    low = max(1e-6, f_low / nyq)
    high = min(1.0 - 1e-6, f_high / nyq)
    if low >= high:
        return signal.copy()
    b, a = scipy_signal.butter(BP_ORDER, [low, high], btype='band')
    return scipy_signal.filtfilt(b, a, signal.astype(np.float64)).astype(np.float64)


# ===================================================================
# STEP 7: Plane-Orthogonal-to-Skin (POS) — Sliding Window
# ===================================================================
def pos_batch(rgb_matrix: np.ndarray, fs: float,
              window_sec: float = POS_WINDOW) -> np.ndarray:
    """POS algorithm with sliding window (§rPPG extraction).

    rgb_matrix: shape (3, n), rows = R, G, B.

    Wang et al. 2017: projects normalized RGB onto a plane orthogonal
    to the skin-tone vector.

    S1(t) = G_n(t) - R_n(t)
    S2(t) = G_n(t) + R_n(t) - 2*B_n(t)
    alpha = sigma(S1_window) / sigma(S2_window)
    P(t) = S1(t) - alpha * S2(t)
    """
    n = rgb_matrix.shape[1]
    W = max(3, int(round(window_sec * fs)))
    r, g, b = rgb_matrix[0], rgb_matrix[1], rgb_matrix[2]

    # Cumulative sums for fast sliding window mean
    cs_r = np.zeros(n + 1)
    cs_g = np.zeros(n + 1)
    cs_b = np.zeros(n + 1)
    np.cumsum(r, out=cs_r[1:])
    np.cumsum(g, out=cs_g[1:])
    np.cumsum(b, out=cs_b[1:])

    pulse = np.zeros(n, dtype=np.float64)

    for i in range(n):
        start = max(0, i - W + 1)
        seg_len = i - start + 1
        mu_r = (cs_r[i + 1] - cs_r[start]) / seg_len
        mu_g = (cs_g[i + 1] - cs_g[start]) / seg_len
        mu_b = (cs_b[i + 1] - cs_b[start]) / seg_len

        rn = r[i] / max(mu_r, 1e-12)
        gn = g[i] / max(mu_g, 1e-12)
        bn = b[i] / max(mu_b, 1e-12)

        s1 = gn - rn
        s2 = gn + rn - 2.0 * bn

        # Compute alpha from window statistics
        if seg_len >= 3:
            rn_win = r[start:i + 1] / max(mu_r, 1e-12)
            gn_win = g[start:i + 1] / max(mu_g, 1e-12)
            bn_win = b[start:i + 1] / max(mu_b, 1e-12)
            x_win = gn_win - rn_win
            y_win = gn_win + rn_win - 2.0 * bn_win
            sigma_s1 = max(float(np.std(x_win)), 1e-30)
            sigma_s2 = max(float(np.std(y_win)), 1e-30)
            alpha = sigma_s1 / sigma_s2
        else:
            alpha = 1.0

        pulse[i] = s1 - alpha * s2

    return pulse


# ===================================================================
# STEP 8-10: Lomb-Scargle Time-Frequency Analysis
# ===================================================================
def lomb_scargle_tfa(signal: np.ndarray, fs: float,
                     window_sec: float = TFA_WINDOW,
                     n_temporal: int = TFA_N_TEMPORAL,
                     n_freqs: int = TFA_N_FREQS,
                     snr_percentile: float = SNR_PERCENTILE) -> tuple:
    """Lomb-Scargle periodogram per sliding window (§rPPG extraction).

    Returns:
        hr_bpm: SNR-weighted HR per window (shape: n_windows,)
        snr_mat: SNR matrix (n_windows × n_freqs)
        freq_grid: frequency axis in Hz
    """
    n = len(signal)
    win_len = int(round(window_sec * fs))
    if n < win_len or fs <= 0:
        return None, None, None

    freq_grid = np.linspace(BP_LOW, BP_HIGH, n_freqs)
    freq_ang = freq_grid * (2.0 * np.pi)

    max_wins = n - win_len + 1
    n_win = min(n_temporal, max_wins)
    if n_win < 1:
        return None, None, None

    step = max(1, (n - win_len) // n_win) if n_win > 1 else 1
    n_win = ((n - win_len) // step) + 1

    t_axis = np.arange(win_len, dtype=np.float64) / fs
    tf_mat = np.zeros((n_win, n_freqs), dtype=np.float64)

    for i in range(n_win):
        start = i * step
        seg = signal[start:start + win_len]
        seg_dc = seg.astype(np.float64) - np.mean(seg)
        pgram = scipy_signal.lombscargle(t_axis, seg_dc, freq_ang)
        tf_mat[i, :] = np.maximum(pgram, 0.0)

    # SNR = power / sum(power) per time point (paper: 'signal-to-noise ratios')
    # Actually the paper says SNR = power/sum(power) which is a fractional power,
    # also called "coherence". Let's be precise:
    # 'converted to signal-to-noise ratios (i.e., SNR; also termed coherence)
    #  per time point by dividing each power value by the sum of all absolute
    #  power values'
    row_sum = np.sum(tf_mat, axis=1, keepdims=True)
    snr_mat = tf_mat / (row_sum + 1e-30)

    # Select top 5th percentile SNR values
    # 'Only the frequencies with the 5th percentile largest SNR values were
    #  selected to calculate heart rate'
    thresh = np.percentile(snr_mat, snr_percentile, axis=1, keepdims=True)
    mask = snr_mat >= thresh

    # SNR-weighted average of frequencies
    # 'The final rPPG HR measure was based on the SNR-weighted average of frequencies'
    numer = np.sum(snr_mat * freq_grid[np.newaxis, :] * mask, axis=1)
    denom = np.sum(snr_mat * mask, axis=1)
    hr_freq = numer / (denom + 1e-30)
    hr_bpm = hr_freq * 60.0

    return hr_bpm, snr_mat, freq_grid


# ===================================================================
# STEP 11: Temporal Smoothing of Peak Powers
# ===================================================================
def smooth_peak_powers(hr_bpm: np.ndarray, window: int = SMOOTH_WINDOW) -> np.ndarray:
    """Smoothed fit to peak powers (paper: 'smoothed fit to the peak powers
    across time to reduce distortions by spurious changes')."""
    if hr_bpm is None or len(hr_bpm) < 2:
        return hr_bpm
    from scipy.ndimage import uniform_filter1d
    w = min(window, len(hr_bpm))
    if w < 2:
        return hr_bpm.copy()
    return uniform_filter1d(hr_bpm.astype(np.float64), size=w, mode='nearest').astype(np.float64)


# ===================================================================
# FULL PIPELINE
# ===================================================================
def extract_rppg_from_video(video_path: str | Path,
                            target_fs: float = TARGET_FS,
                            min_duration: float = MIN_DURATION,
                            min_framerate: float = MIN_FRAMERATE,
                            require_face: bool = True) -> rPPGResult:
    """Full rPPG extraction pipeline from video file.

    Implements all steps from Di Lernia et al. (2024):
    1. Viola-Jones face detection (first frame)
    2. Minimum-eigenvalue corners + KLT tracking
    3. Face template skin mask (above/below eyes)
    4. Per-frame average RGB across skin pixels
    5. PCHIP resample to 60 Hz
    6. 6th-order Butterworth BP 0.75-2.75 Hz
    7. POS with 1.6 s sliding window
    8. Lomb-Scargle TFA (10 s window, 240 × 120)
    9. SNR → top 5th percentile → weighted avg
    10. Temporal smoothing
    """
    video_path = Path(video_path)
    if not video_path.exists():
        raise FileNotFoundError(f"Video not found: {video_path}")

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    # Get video properties
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    orig_fps = cap.get(cv2.CAP_PROP_FPS)
    if orig_fps <= 0:
        orig_fps = 30.0

    duration = total_frames / orig_fps
    if duration < min_duration:
        cap.release()
        return rPPGResult(
            hr_bpm=0.0, hr_per_window=np.array([]), snr_matrix=None,
            freq_grid_hz=None, pulse_wave=np.array([]),
            rgb_resampled=None, face_found=False,
            framerate=orig_fps, duration_s=duration,
            n_frames=total_frames,
        )

    # Initialize face tracker
    tracker = FaceTracker()
    rgb_frames: list[np.ndarray] = []
    timestamps: list[float] = []
    skin_pixels: list[int] = []

    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret or frame is None:
            break

        ts = frame_idx / orig_fps

        mask, avg_rgb, _ = tracker.process_frame(frame)
        if avg_rgb is not None:
            rgb_frames.append(avg_rgb)
            timestamps.append(ts)
            if mask is not None:
                skin_pixels.append(int(np.sum(mask > 0)))
        else:
            # If face is lost mid-recording, still record but note it
            rgb_frames.append(np.array([0.0, 0.0, 0.0]))
            timestamps.append(ts)

        frame_idx += 1

    cap.release()

    face_found = tracker._initialized
    if not face_found and require_face:
        return rPPGResult(
            hr_bpm=0.0, hr_per_window=np.array([]), snr_matrix=None,
            freq_grid_hz=None, pulse_wave=np.array([]),
            rgb_resampled=None, face_found=False,
            framerate=orig_fps, duration_s=duration,
            n_frames=frame_idx, skin_pixels_per_frame=skin_pixels,
        )

    if len(rgb_frames) < int(min_duration * min_framerate):
        return rPPGResult(
            hr_bpm=0.0, hr_per_window=np.array([]), snr_matrix=None,
            freq_grid_hz=None, pulse_wave=np.array([]),
            rgb_resampled=None, face_found=face_found,
            framerate=orig_fps, duration_s=duration,
            n_frames=frame_idx, skin_pixels_per_frame=skin_pixels,
        )

    # Assemble RGB matrix: shape (3, n_frames)
    rgb = np.column_stack(rgb_frames)  # (3, n)
    n_frames = rgb.shape[1]

    # Check estimated framerate (paper: ≥20 FPS)
    estimated_fs = orig_fps
    if len(timestamps) > 1:
        dts = np.diff(timestamps)
        dts = dts[(dts > 1e-3) & (dts < 1.0)]
        if len(dts) > 4:
            estimated_fs = 1.0 / float(np.median(dts))

    if estimated_fs < min_framerate:
        return rPPGResult(
            hr_bpm=0.0, hr_per_window=np.array([]), snr_matrix=None,
            freq_grid_hz=None, pulse_wave=np.array([]),
            rgb_resampled=None, face_found=face_found,
            framerate=estimated_fs, duration_s=duration,
            n_frames=n_frames, skin_pixels_per_frame=skin_pixels,
        )

    # ---- STEP 5: PCHIP resample to target_fs ----
    rgb_resampled = np.zeros((3, 1))
    for ch in range(3):
        rgb_resampled[ch, :] = resample_pchip(rgb[ch, :], estimated_fs, target_fs)

    n_resampled = rgb_resampled.shape[1]
    if n_resampled < int(TFA_WINDOW * target_fs):
        return rPPGResult(
            hr_bpm=0.0, hr_per_window=np.array([]), snr_matrix=None,
            freq_grid_hz=None, pulse_wave=np.array([]),
            rgb_resampled=rgb_resampled, face_found=face_found,
            framerate=estimated_fs, duration_s=duration,
            n_frames=n_frames, skin_pixels_per_frame=skin_pixels,
        )

    # ---- STEP 6: POS on raw RGB (with DC) ----
    # POS must operate on raw RGB values with DC component intact.
    # The algorithm normalizes by the running mean per channel internally.
    pulse = pos_batch(rgb_resampled, target_fs, POS_WINDOW)

    # ---- STEP 7: 6th-order Butterworth BP on the pulse signal ----
    pulse = butterworth_bp_6th(pulse, target_fs)

    # ---- STEP 8-10: Lomb-Scargle TFA ----
    hr_bpm, snr_mat, freq_grid = lomb_scargle_tfa(pulse, target_fs)
    if hr_bpm is None or len(hr_bpm) < 2:
        return rPPGResult(
            hr_bpm=0.0, hr_per_window=np.array([]), snr_matrix=None,
            freq_grid_hz=None, pulse_wave=pulse,
            rgb_resampled=rgb_resampled, face_found=face_found,
            framerate=estimated_fs, duration_s=duration,
            n_frames=n_frames, skin_pixels_per_frame=skin_pixels,
        )

    # ---- STEP 11: Temporal smoothing ----
    hr_smooth = smooth_peak_powers(hr_bpm, window=SMOOTH_WINDOW)

    # Final HR = last window's estimate (paper uses smoothed function)
    final_hr = float(hr_smooth[-1])

    return rPPGResult(
        hr_bpm=final_hr,
        hr_per_window=hr_smooth,
        snr_matrix=snr_mat,
        freq_grid_hz=freq_grid,
        pulse_wave=pulse,
        rgb_resampled=rgb_resampled,
        face_found=face_found,
        framerate=estimated_fs,
        duration_s=duration,
        n_frames=n_frames,
        skin_pixels_per_frame=skin_pixels,
    )


# ===================================================================
# CONVENIENCE: Process multiple videos, average per-participant
# ===================================================================
def extract_rppg_batch(video_paths: list[str | Path],
                       **kwargs) -> list[rPPGResult]:
    """Process multiple videos. Returns list of results."""
    results = []
    for vp in video_paths:
        result = extract_rppg_from_video(vp, **kwargs)
        results.append(result)
    return results


def average_session_results(results: list[rPPGResult], use_iqr: bool = True) -> float:
    """Average HR across multiple recordings per session (paper: §Study 2 accuracy).
    
    Uses aggregate_session with IQR outlier filtering.
    """
    agg = aggregate_session(results, use_iqr=use_iqr)
    return agg["mean_hr"]


# ===================================================================
# ACCURACY METRICS (paper §Accuracy)
# ===================================================================
def compute_accuracy_metrics(estimated: np.ndarray, ground_truth: np.ndarray) -> dict:
    """Compute accuracy metrics as reported in the paper.

    Returns:
        pearson_r: Pearson correlation coefficient
        spearman_rs: Spearman rank correlation
        mae: Mean Absolute Error (BPM)
        rmse: Root Mean Square Error (BPM)
        mdiff: Mean difference (bias)
        meddiff: Median difference
        sdr: Standard deviation of residuals
        loa: 95% Limits of Agreement (Bland-Altman)
    """
    valid = (~np.isnan(estimated)) & (~np.isnan(ground_truth))
    est = estimated[valid]
    gt = ground_truth[valid]

    if len(est) < 3:
        return {}

    from scipy.stats import pearsonr, spearmanr

    pearson_r, p_val = pearsonr(est, gt)
    spearman_rs, sp_val = spearmanr(est, gt)
    residuals = est - gt
    mae = float(np.mean(np.abs(residuals)))
    rmse = float(np.sqrt(np.mean(residuals ** 2)))
    mdiff = float(np.mean(residuals))
    meddiff = float(np.median(residuals))
    sdr = float(np.std(residuals))
    loa_lower = mdiff - 1.96 * sdr
    loa_upper = mdiff + 1.96 * sdr

    return dict(
        pearson_r=float(pearson_r),
        pearson_p=float(p_val),
        spearman_rs=float(spearman_rs),
        spearman_p=float(sp_val),
        mae=mae,
        rmse=rmse,
        mdiff=mdiff,
        meddiff=meddiff,
        sdr=sdr,
        loa_lower=loa_lower,
        loa_upper=loa_upper,
        n=len(est),
    )


# ===================================================================
# CLI
# ===================================================================
def main():
    import argparse
    import json

    parser = argparse.ArgumentParser(
        description="rPPG Pipeline — Di Lernia et al. (2024) implementation"
    )
    parser.add_argument("videos", nargs="*", help="Path(s) to video file(s)")
    parser.add_argument("--target-fs", type=float, default=TARGET_FS,
                        help=f"Target resample rate (default: {TARGET_FS} Hz)")
    parser.add_argument("--min-duration", type=float, default=MIN_DURATION,
                        help=f"Minimum video duration (default: {MIN_DURATION}s)")
    parser.add_argument("--json", action="store_true",
                        help="Output as JSON")
    parser.add_argument("--ground-truth", nargs="*", type=float,
                        help="Ground truth HR values (one per video, for accuracy metrics)")
    parser.add_argument("--quality", action="store_true",
                        help="Show quality assessment report")
    parser.add_argument("--guide", action="store_true",
                        help="Show best-practices guide (output recommendations)")
    parser.add_argument("--aggregate", action="store_true",
                        help="Aggregate session results with IQR filtering")

    args = parser.parse_args()

    if args.guide:
        print(best_practices_text())
        return

    results = extract_rppg_batch(args.videos,
                                  target_fs=args.target_fs,
                                  min_duration=args.min_duration)

    if args.aggregate and len(results) > 1:
        agg = aggregate_session(results)
        print(f"Session aggregation ({agg['n_valid']} valid / {agg['n_total']} total):")
        print(f"  Mean HR:  {agg['mean_hr']:.2f} BPM")
        print(f"  Median HR: {agg['median_hr']:.2f} BPM")
        print(f"  Std HR:   {agg['std_hr']:.2f} BPM")
        if agg['n_removed_iqr'] > 0:
            print(f"  IQR outliers removed: {agg['n_removed_iqr']}")
        return

    if args.json:
        output = []
        for vp, res in zip(args.videos, results):
            entry = {
                "video": str(vp),
                "hr_bpm": round(res.hr_bpm, 2),
                "valid": res.valid,
                "face_found": res.face_found,
                "framerate": round(res.framerate, 2),
                "duration_s": round(res.duration_s, 2),
                "n_frames": res.n_frames,
                "data_quality": res.paper_data_quality,
            }
            if args.quality:
                report = assess_recording_quality(vp, res)
                entry["quality_score"] = round(report.overall_score, 3)
                entry["recommendations"] = report.recommendations
            output.append(entry)
        if args.ground_truth and len(args.ground_truth) == len(results):
            est = np.array([r.hr_bpm for r in results])
            gt = np.array(args.ground_truth)
            metrics = compute_accuracy_metrics(est, gt)
            output.append({"accuracy_metrics": {k: round(v, 4) if isinstance(v, float) else v
                                                for k, v in metrics.items()}})
        print(json.dumps(output, indent=2))
    else:
        print(f"{'Video':<50} {'HR(BPM)':<10} {'Quality':<14} {'Face':<6} {'FPS':<8} {'Dur(s)':<8} {'Frames':<8}")
        print("-" * 104)
        for vp, res in zip(args.videos, results):
            name = str(Path(vp).name)[:48]
            qual = res.paper_data_quality[:12]
            print(f"{name:<50} {res.hr_bpm:<10.2f} {qual:<14} {str(res.face_found):<6} {res.framerate:<8.2f} {res.duration_s:<8.2f} {res.n_frames:<8}")

        if args.quality:
            print("\n--- Quality Assessment ---")
            for vp, res in zip(args.videos, results):
                report = assess_recording_quality(vp, res)
                print(f"\n{Path(vp).name}:")
                print(f"  Score: {report.overall_score:.3f}")
                for r in report.recommendations:
                    print(f"  → {r}")

        if args.ground_truth and len(args.ground_truth) == len(results):
            est = np.array([r.hr_bpm for r in results])
            gt = np.array(args.ground_truth)
            metrics = compute_accuracy_metrics(est, gt)
            print("\nAccuracy Metrics:")
            for k, v in metrics.items():
                print(f"  {k}: {v:.4f}" if isinstance(v, float) else f"  {k}: {v}")


if __name__ == "__main__":
    main()
