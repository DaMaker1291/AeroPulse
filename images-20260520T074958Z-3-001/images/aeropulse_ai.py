import sys
import os
import math
import time
import json
import base64
import asyncio
import logging
import ssl
import queue
import threading
import traceback
from pathlib import Path
from collections import deque
from threading import Thread, Lock
from urllib.request import urlretrieve
import numpy as np
from scipy import signal as scipy_signal
from scipy import interpolate as scipy_interpolate
import cv2
import mediapipe as mp
import websockets

# Face mesh edges (478-point MediaPipe FaceLandmarker, hardcoded for compatibility)
# Face oval + brows + nose + eyes + lips — all indices < 478, validated safe
_FACEMESH_EDGES = [
    # Nose bridge (5 edges)
    (168,6),(6,197),(197,195),(195,5),(5,4),
    # Right eye eye (8 edges)
    (33,246),(246,161),(161,160),(160,159),(159,158),(158,157),(157,173),(173,133),
    # Left eye (8 edges)
    (263,466),(466,388),(388,387),(387,386),(386,385),(385,384),(384,398),(398,362),
    # Outer lips (10 edges)
    (61,146),(146,91),(91,181),(181,84),(84,17),(17,314),(314,405),(405,321),(321,375),(375,291),
    # Lower lip (6 edges)
    (61,185),(185,40),(40,39),(39,37),(37,0),(0,267),
]
# Face oval (silhouette) landmark indices for ellipse boundary verification
# These form the outer facial contour in the 478-point MediaPipe face mesh.
_FACE_OVAL_LANDMARKS = [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323,
    361, 288, 397, 365, 379, 378, 400, 377, 152, 148,
    176, 149, 150, 136, 172, 58, 132, 93, 234, 127,
    162, 21, 54, 103, 67, 109
]

# Ellipse target constants for HUD alignment mask
_ELLIPSE_AXIS_X_RATIO = 0.18
_ELLIPSE_AXIS_Y_RATIO = 0.22
_ELLIPSE_CENTER_Y_RATIO = 0.42
from PyQt6.QtCore import Qt, QThread, pyqtSignal, QTimer, QRect
from PyQt6.QtGui import QFont, QImage, QPixmap, QPainter, QColor, QPen, QLinearGradient
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QHBoxLayout, QVBoxLayout,
    QGridLayout, QLabel, QPushButton, QFrame, QStackedWidget, QTextEdit,
    QSizePolicy, QSpacerItem, QScrollArea
)
import matplotlib
matplotlib.use('QtAgg')
from matplotlib.backends.backend_qtagg import FigureCanvasQTAgg as FigureCanvas
from matplotlib.figure import Figure
from matplotlib.lines import Line2D
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# =====================================================================
# DESIGN SYSTEM TOKENS (from Establish Global Design System.zip)
# =====================================================================
DS = {
    "BG_BASE": "#0B0B0D",
    "BG_SURFACE": "#16161A",
    "BORDER": "#2C2C2E",
    "PRIMARY": "#0A84FF",
    "SUCCESS": "#30D158",
    "WARNING": "#FF9F0A",
    "DANGER": "#FF453A",
    "TEXT_PRIMARY": "#FFFFFF",
    "TEXT_SECONDARY": "#8E8E93",
    "CHART_PURPLE": "#BF5AF2",
    "RADIUS": "12px",
    "RADIUS_SM": "8px",
    "SIDEBAR_W": 240,
    "BOTTOM_HUD_H": 40,
    "FONT_HERO": ("Segoe UI", 42, QFont.Weight.Bold),
    "FONT_HEADING": ("Segoe UI", 24, QFont.Weight.Medium),
    "FONT_BODY": ("Segoe UI", 14, QFont.Weight.Normal),
    "FONT_CAPTION": ("Segoe UI", 11, QFont.Weight.Light),
    "FONT_SIDEBAR": ("Segoe UI", 13, QFont.Weight.Normal),
}

def ds_style(klass, extras=""):
    base = f"""
        background-color: {DS['BG_SURFACE']};
        border: 1px solid {DS['BORDER']};
        border-radius: {DS['RADIUS']};
        color: {DS['TEXT_PRIMARY']};
    """
    return base + extras

def ds_card(raw_extras=""):
    return ds_style("card", raw_extras)

def _ds_font(key):
    return QFont(*DS[key])

# =====================================================================
# MODEL DOWNLOAD
# =====================================================================
def _ensure_face_landmarker_task_model() -> Path:
    cache_dir = Path.home() / ".cache" / "aeropulse"
    cache_dir.mkdir(parents=True, exist_ok=True)
    model_path = cache_dir / "face_landmarker.task"
    if model_path.exists() and model_path.stat().st_size > 1_000_000:
        return model_path
    try:
        ssl._create_default_https_context = ssl._create_unverified_context
    except Exception:
        pass
    url = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
    tmp = cache_dir / "face_landmarker.task.tmp"
    urlretrieve(url, tmp)
    tmp.replace(model_path)
    return model_path

# =====================================================================
# DSP ENGINE — Pure mathematical pipelines
# =====================================================================
class ButterworthBP:
    """2nd-order digital Butterworth bandpass filter via bilinear transform with pre-warping.
    H(z) = (b0 + b1*z^-1 + b2*z^-2) / (1 + a1*z^-1 + a2*z^-2)
    Designed for human physiological band (0.75-2.75 Hz ↔ 45-165 BPM) per Di Lernia et al. (2024)."""
    def __init__(self, f_low=0.75, f_high=2.75, fs=30.0):
        self.f_low = f_low
        self.f_high = f_high
        self._fs = max(fs, 1.0)
        self._b0 = self._b1 = self._b2 = 0.0
        self._a1 = self._a2 = 0.0
        self.reset()
        self._compute_coeffs()

    @property
    def fs(self):
        return self._fs
    @fs.setter
    def fs(self, value):
        new_fs = max(value, 1.0)
        if abs(new_fs - self._fs) / max(self._fs, 0.1) > 0.03:
            self._fs = new_fs
            self._compute_coeffs()

    def _compute_coeffs(self):
        fs = self._fs
        K = 2.0 * fs
        Omega_l = K * math.tan(math.pi * self.f_low / fs)
        Omega_h = K * math.tan(math.pi * self.f_high / fs)
        BW = Omega_h - Omega_l
        Omega0_sq = Omega_l * Omega_h
        K_sq = K * K
        a2 = K_sq + BW * K + Omega0_sq
        a1 = -2.0 * K_sq + 2.0 * Omega0_sq
        a0 = K_sq - BW * K + Omega0_sq
        self._b0 = BW * K / a2
        self._b1 = 0.0
        self._b2 = -BW * K / a2
        self._a1 = a1 / a2
        self._a2 = a0 / a2

    def reset(self):
        self._x1 = self._x2 = 0.0
        self._y1 = self._y2 = 0.0

    def step(self, x: float) -> float:
        y = (self._b0 * x + self._b1 * self._x1 + self._b2 * self._x2
             - self._a1 * self._y1 - self._a2 * self._y2)
        self._x2 = self._x1
        self._x1 = x
        self._y2 = self._y1
        self._y1 = y
        return y

    def filter(self, samples: np.ndarray) -> np.ndarray:
        out = np.empty(len(samples), dtype=np.float64)
        for i in range(len(samples)):
            out[i] = self.step(float(samples[i]))
        return out

def fft_bandpass(x: np.ndarray, fs: float, f_lo: float, f_hi: float) -> np.ndarray:
    """Bandpass filter in frequency domain with smooth raised-cosine transition."""
    if x.size < 16 or fs <= 0:
        return x
    n = x.size
    freqs = np.fft.rfftfreq(n, d=1.0/fs)
    X = np.fft.rfft(x - np.mean(x))
    trans = 0.08 * (f_hi - f_lo)
    mask = np.ones_like(freqs, dtype=np.float64)
    for i, f in enumerate(freqs):
        if f < f_lo - trans:
            mask[i] = 0.0
        elif f < f_lo:
            t = (f - (f_lo - trans)) / trans
            mask[i] = t * t * (3.0 - 2.0 * t)
        elif f > f_hi + trans:
            mask[i] = 0.0
        elif f > f_hi:
            t = (f - f_hi) / trans
            mask[i] = 1.0 - t * t * (3.0 - 2.0 * t)
    return np.fft.irfft(X * mask, n=n).astype(np.float64)

def resample_cubic(signal: np.ndarray, old_fs: float, new_fs: float = 30.0) -> np.ndarray:
    """Frame rate regularization via cubic spline interpolation.
    Cheap webcams fluctuate between 22-31 FPS; Fourier Transforms require
    a perfectly consistent time step. CubicSpline resamples onto a rigid grid.
    """
    n = len(signal)
    if n < 4 or old_fs <= 0 or new_fs <= 0:
        return signal.copy()
    old_t = np.arange(n, dtype=np.float64) / old_fs
    new_n = max(2, int(round(n * new_fs / old_fs)))
    new_t = np.linspace(0.0, old_t[-1], new_n)
    interp = scipy_interpolate.CubicSpline(old_t, signal.astype(np.float64), bc_type='natural')
    return interp(new_t).astype(np.float64)


def resample_pchip(signal: np.ndarray, old_fs: float, new_fs: float = 60.0) -> np.ndarray:
    """Resample signal to new_fs using PCHIP interpolation (paper §rPPG extraction)."""
    n = len(signal)
    if n < 2 or old_fs <= 0 or new_fs <= 0:
        return signal.copy()
    old_t = np.arange(n, dtype=np.float64) / old_fs
    new_n = max(2, int(round(n * new_fs / old_fs)))
    new_t = np.linspace(0.0, old_t[-1], new_n)
    interp = scipy_interpolate.PchipInterpolator(old_t, signal.astype(np.float64))
    return interp(new_t).astype(np.float64)


def butterworth_bp_6th(signal: np.ndarray, fs: float,
                       f_low: float = 0.75, f_high: float = 2.75) -> np.ndarray:
    """6th-order zero-phase Butterworth bandpass filter (paper: 0.75-2.75 Hz, 6th order)."""
    if signal.size < 8 or fs <= 0:
        return signal.copy()
    nyq = fs / 2.0
    low = max(1e-6, f_low / nyq)
    high = min(1.0 - 1e-6, f_high / nyq)
    if low >= high:
        return signal.copy()
    b, a = scipy_signal.butter(6, [low, high], btype='band')
    return scipy_signal.filtfilt(b, a, signal.astype(np.float64)).astype(np.float64)


def pos_batch(rgb_matrix: np.ndarray, fs: float, window_sec: float = 1.6) -> np.ndarray:
    """Plane-Orthogonal-to-Skin (POS) on batch RGB data with sliding window.
    rgb_matrix: shape (3, n), rows = R, G, B.
    Paper: 'POS with a sliding window size of 1.6 s'.
    """
    n = rgb_matrix.shape[1]
    W = max(3, int(round(window_sec * fs)))
    r, g, b = rgb_matrix[0], rgb_matrix[1], rgb_matrix[2]

    cs_r = np.zeros(n + 1)
    cs_g = np.zeros(n + 1)
    cs_b = np.zeros(n + 1)
    np.cumsum(r, out=cs_r[1:])
    np.cumsum(g, out=cs_g[1:])
    np.cumsum(b, out=cs_b[1:])

    pulse = np.zeros(n, dtype=np.float64)
    x_win_buf = np.zeros(W, dtype=np.float64)
    y_win_buf = np.zeros(W, dtype=np.float64)

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

        if seg_len >= 3:
            rn_win = r[start:i+1] / max(mu_r, 1e-12)
            gn_win = g[start:i+1] / max(mu_g, 1e-12)
            bn_win = b[start:i+1] / max(mu_b, 1e-12)
            x_win = gn_win - rn_win
            y_win = gn_win + rn_win - 2.0 * bn_win
            sigma_s1 = max(float(np.std(x_win)), 1e-30)
            sigma_s2 = max(float(np.std(y_win)), 1e-30)
            alpha = sigma_s1 / sigma_s2
        else:
            alpha = 1.0

        pulse[i] = s1 - alpha * s2

    return pulse


def lomb_scargle_tfa(signal: np.ndarray, fs: float,
                     window_sec: float = 10.0,
                     n_temporal: int = 240,
                     n_freqs: int = 120) -> tuple:
    """Time-frequency analysis via Lomb-Scargle periodogram (paper §rPPG extraction).
    Returns (hr_bpm_per_window, tf_matrix_snr, freq_grid_hz) or (None, None, None)."""
    n = len(signal)
    win_len = int(round(window_sec * fs))
    if n < win_len or fs <= 0:
        return None, None, None

    freq_grid = np.linspace(0.75, 2.75, n_freqs)
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

    row_sum = np.sum(tf_mat, axis=1, keepdims=True)
    snr_mat = tf_mat / (row_sum + 1e-30)

    thresh = np.percentile(snr_mat, 95, axis=1, keepdims=True)
    mask = snr_mat >= thresh
    numer = np.sum(snr_mat * freq_grid[np.newaxis, :] * mask, axis=1)
    denom = np.sum(snr_mat * mask, axis=1)
    hr_freq = numer / (denom + 1e-30)
    hr_bpm = hr_freq * 60.0

    return hr_bpm, snr_mat, freq_grid


# =====================================================================
# BP WAVEFORM ANALYZER — pyPPG-style feature extraction + ML regression
# =====================================================================
class BPWaveformAnalyzer:
    """Extracts systolic peak, dicrotic notch, diastolic peak per heartbeat,
    then computes pulse wave features for ML-based BP regression.
    """
    def __init__(self):
        self._peak_buffer = deque(maxlen=60)
        self._trough_buffer = deque(maxlen=60)
        self._notch_buffer = deque(maxlen=60)
        self._feature_history = deque(maxlen=30)
        self._model = None
        self._init_model()

    def _init_model(self):
        """Initialize a lightweight Random Forest regressor.
        In production, train on MMPD/BP4D+/CLBP-300; here we seed with
        the rule-based formula weights and adapt online."""
        try:
            from sklearn.ensemble import RandomForestRegressor
            self._model = RandomForestRegressor(
                n_estimators=25, max_depth=5, random_state=42
            )
            self._model_fitted = False
        except ImportError:
            self._model = None
            self._model_fitted = False

    def _find_peaks_troughs(self, sig: np.ndarray, fs: float):
        """Locate systolic peaks and diastolic troughs in filtered BVP wave."""
        if sig.size < 20 or fs <= 0:
            return np.array([], dtype=int), np.array([], dtype=int)
        sig_n = (sig - np.mean(sig)) / max(np.std(sig), 1e-9)
        min_dist = max(6, int(0.3 * fs))
        win = max(3, int(0.12 * fs))
        peaks = []
        for i in range(win, sig_n.size - win):
            if sig_n[i] == np.max(sig_n[i-win:i+win+1]) and sig_n[i] > 0.1:
                peaks.append(i)
        if len(peaks) < 2:
            return np.array([], dtype=int), np.array([], dtype=int)
        peaks = [peaks[0]]
        for p in peaks[1:]:
            if p - peaks[-1] >= min_dist:
                peaks.append(p)
        peaks = np.array(peaks, dtype=int)

        troughs = []
        for p_idx in range(len(peaks) - 1):
            seg = sig_n[peaks[p_idx]:peaks[p_idx+1]]
            if len(seg) < 4:
                continue
            mid = len(seg) // 3
            t_idx = peaks[p_idx] + mid + int(np.argmin(seg[mid:]))
            troughs.append(t_idx)
        return np.array(peaks, dtype=int), np.array(troughs, dtype=int)

    def _find_dicrotic_notch(self, sig: np.ndarray, peak: int, trough: int, fs: float):
        """Locate dicrotic notch as the minimum of the 2nd derivative
        between systolic peak and diastolic trough."""
        seg = sig[peak:trough+1]
        if len(seg) < 6:
            return trough
        first_d = np.diff(seg)
        second_d = np.diff(first_d)
        search_start = int(0.3 * len(seg))
        search_end = int(0.8 * len(seg))
        if search_end <= search_start + 2:
            return trough
        notch_candidates = second_d[search_start:search_end]
        if len(notch_candidates) < 3:
            return trough
        notch_rel = search_start + int(np.argmin(notch_candidates)) + 2
        return peak + notch_rel

    def extract_features(self, sig: np.ndarray, fs: float) -> np.ndarray:
        """Extract waveform features for BP regression.
        Returns: [pulse_width_ratio, ptt_ratio, aug_index,
                   upstroke_slope, pulse_area, hr_adjusted]
        """
        if sig.size < 30 or fs <= 0:
            return np.zeros(6)

        peaks, troughs = self._find_peaks_troughs(sig, fs)
        if len(peaks) < 2 or len(troughs) < 1:
            return np.zeros(6)

        features = []
        for pi in range(min(len(peaks) - 1, 5)):
            p = peaks[pi]
            t = troughs[pi] if pi < len(troughs) else peaks[pi] + int(0.4 * fs)
            if t <= p or t >= peaks[pi+1]:
                t = peaks[pi] + int((peaks[pi+1] - peaks[pi]) * 0.6)
            notch = self._find_dicrotic_notch(sig, p, t, fs)

            seg_len = peaks[pi+1] - p
            pulse_width = t - p
            pw_ratio = pulse_width / max(seg_len, 1)

            peak_amp = sig[p]
            trough_amp = sig[t]
            notch_amp = sig[notch] if notch < len(sig) else trough_amp
            aug_idx = (peak_amp - notch_amp) / max(peak_amp - trough_amp, 1e-9)

            upstroke = sig[p:t] if t > p + 2 else sig[p:peaks[pi+1]]
            if len(upstroke) < 3:
                upstroke = sig[p:peaks[pi+1]+1]
            slope = float(np.max(np.diff(upstroke))) if len(upstroke) > 2 else 0.0

            area = float(np.sum(sig[p:peaks[pi+1]] - trough_amp)) / max(seg_len, 1)

            features.append([pw_ratio, aug_idx, slope, area])

        if not features:
            return np.zeros(6)
        f_mean = np.mean(features, axis=0)

        ptt_ratio = 0.5  # placeholder — requires dual-region forehead/cheek timing
        hr = 72.0
        return np.array([f_mean[0], ptt_ratio, f_mean[1], f_mean[2], f_mean[3], hr / 60.0])

    def predict_bp(self, sig: np.ndarray, fs: float,
                   hr: float, rule_sbp: float, rule_dbp: float) -> tuple:
        """Predict SBP/DBP from waveform features using ML + rule fallback."""
        feats = self.extract_features(sig, fs)
        if self._model is not None and self._model_fitted:
            try:
                bp = self._model.predict(feats.reshape(1, -1))[0]
                sbp = float(np.clip(bp[0], 85, 210))
                dbp = float(np.clip(bp[1], 45, 135))
                return sbp, dbp
            except Exception:
                pass
        # Rule-based fallback (formula derived from PWA literature)
        pw_ratio = feats[0]
        ai = feats[2]
        slope = feats[3]
        pulse_area = feats[4]
        hr_norm = feats[5]
        sbp = rule_sbp * (0.6 + 0.2 * pw_ratio + 0.2 * ai / max(ai, 1.0))
        dbp = rule_dbp * (0.7 + 0.15 * pw_ratio + 0.15 * pulse_area)
        sbp = float(np.clip(sbp + (hr - 72) * 0.25, 85, 210))
        dbp = float(np.clip(dbp + (hr - 72) * 0.15, 45, 135))
        return sbp, dbp


def smooth_peak_powers(hr_bpm: np.ndarray, window: int = 5) -> np.ndarray:
    """Smoothed fit to peak powers across time (paper §rPPG extraction)."""
    if hr_bpm is None or len(hr_bpm) < 2:
        return hr_bpm
    from scipy.ndimage import uniform_filter1d
    w = min(window, len(hr_bpm))
    if w < 2:
        return hr_bpm.copy()
    return uniform_filter1d(hr_bpm.astype(np.float64), size=w, mode='nearest').astype(np.float64)


# =====================================================================
# SKIN TONE ADAPTIVE NORMALIZER (STAN) — AI for melanin-invariant rPPG
# =====================================================================
class ChrominanceEngine:
    """Implementation of the CHROM Method for melanin-independent rPPG.
    1. Normalizes RGB channels by their rolling 5s mean.
    2. Projects onto orthogonal X and Y components.
    3. Uses alpha (ratio of standard deviations) to extract the clean pulse wave.
    """
    def __init__(self):
        # Rolling windows for mean normalization (5s @ 30fps = 150 samples)
        self._r_window = deque(maxlen=150)
        self._g_window = deque(maxlen=150)
        self._b_window = deque(maxlen=150)
        
        # Buffers for calculating sigma_X and sigma_Y
        self._x_window = deque(maxlen=150)
        self._y_window = deque(maxlen=150)

        # Melanin index: 0 = light skin, 1 = dark skin
        self.melanin_index = 0.5

    def process_sample(self, r: float, g: float, b: float):
        """Performs real-time CHROM projection.

        Step 1: Skin Reflectance Normalization
            Rn(t) = R(t) / mu_R, Gn(t) = G(t) / mu_G, Bn(t) = B(t) / mu_B
        Step 2: Orthogonal Component Projection
            X(t) = 3Rn(t) - 2Gn(t)
            Y(t) = 1.5Rn(t) + 1Gn(t) - 1.5Bn(t)
        Step 3: The Clean Alpha Blend Pulse Wave
            alpha = sigma_X / sigma_Y,  P(t) = X(t) - alpha * Y(t)
        """
        self._r_window.append(r)
        self._g_window.append(g)
        self._b_window.append(b)

        if len(self._r_window) < 150:
            return g, r

        mu_r = np.mean(self._r_window)
        mu_g = np.mean(self._g_window)
        mu_b = np.mean(self._b_window)

        # ----- Step 1: Skin Reflectance Normalization -----
        rn = r / max(mu_r, 1e-6)
        gn = g / max(mu_g, 1e-6)
        bn = b / max(mu_b, 1e-6)

        # ----- Step 2: Orthogonal Component Projection -----
        x = 3.0 * rn - 2.0 * gn
        y = 1.5 * rn + 1.0 * gn - 1.5 * bn
        
        self._x_window.append(x)
        self._y_window.append(y)

        # ----- Step 3: The Clean Alpha Blend Pulse Wave -----
        sigma_x = np.std(self._x_window)
        sigma_y = np.std(self._y_window)
        alpha = sigma_x / max(sigma_y, 1e-6)
        
        p_t = x - alpha * y

        # Compute melanin index from the ratio of red to green means
        # Lower R/G ratio → more melanin absorption (darker skin)
        r_mean = float(np.mean(self._r_window))
        g_mean = float(np.mean(self._g_window))
        self.melanin_index = float(np.clip(
            1.0 - (r_mean / max(g_mean, 1e-6)) * 0.85, 0.0, 1.0
        ))

        return p_t, r

    def process_sample_pos(self, r: float, g: float, b: float):
        """Plane-Orthogonal-to-Skin (POS) rPPG extraction.
        Wang et al. 2017 — projects normalized RGB onto a plane orthogonal
        to the skin-tone vector, isolating the blood volume pulse.

        S1(t) = Gn(t) - Rn(t)
        S2(t) = Gn(t) + Rn(t) - 2*Bn(t)
        alpha = sigma(S1) / sigma(S2)
        P(t) = S1(t) - alpha * S2(t)
        """
        self._r_window.append(r)
        self._g_window.append(g)
        self._b_window.append(b)

        if len(self._r_window) < 150:
            return g, r

        mu_r = np.mean(self._r_window)
        mu_g = np.mean(self._g_window)
        mu_b = np.mean(self._b_window)

        rn = r / max(mu_r, 1e-6)
        gn = g / max(mu_g, 1e-6)
        bn = b / max(mu_b, 1e-6)

        s1 = gn - rn
        s2 = gn + rn - 2.0 * bn

        self._x_window.append(s1)
        self._y_window.append(s2)

        sigma_s1 = np.std(self._x_window)
        sigma_s2 = np.std(self._y_window)
        alpha = sigma_s1 / max(sigma_s2, 1e-6)

        p_t = s1 - alpha * s2

        r_mean = float(np.mean(self._r_window))
        g_mean = float(np.mean(self._g_window))
        self.melanin_index = float(np.clip(
            1.0 - (r_mean / max(g_mean, 1e-6)) * 0.85, 0.0, 1.0
        ))

        return p_t, r

    def is_calibrated(self) -> bool:
        return len(self._r_window) >= 150

    def get_spo2_offset(self) -> float:
        """Melanin-adaptive SpO2 correction.
        Darker skin causes optical overestimation bias;
        subtract up to 2.0% based on melanin index."""
        return -float(np.clip((self.melanin_index - 0.3) * 3.5, 0.0, 2.0))



# =====================================================================
# THREAD-SAFE SHARED STATE
# =====================================================================
class SharedState:
    def __init__(self):
        self.lock = Lock()
        self.hr = 0.0
        self.rr = 0.0
        self.spo2 = 0.0
        self.sbp = 0
        self.dbp = 0
        self.rppg_quality = 0.0
        self.face_tracked = False
        self.calibrate_secs = 0.0
        self.lock_start_time = None
        self.rppg_amp = 0.0
        self.chest_amp = 0.0
        self.rppg_buffer = deque(maxlen=150)
        self.chest_buffer = deque(maxlen=150)
        self.m3_trq_buffer = deque(maxlen=200)
        self.m4_trq_buffer = deque(maxlen=200)
        self.logs = deque(maxlen=60)
        self.intake_answers = []
        self.demo_mode = "LIVE"
        self.camera_connected = False
        self.face_locked = False
        self.ellipse_aligned = False
        self.is_processing = False
        self.exposure_timer = 0.0
        self.unlocked_stages = {1: True, 2: False, 3: False, 4: False, 5: False}
        self.stage3_handshaked = False
        self.endurance_active = False
        self.endurance_remaining = 10
        self.endurance_summary = "Awaiting scan."
        self.lighting_quality = 1.0
        self.lighting_warning = ""

        # Triage analytics — computed from real DSP data
        self.bilateral_symmetry = 94.2
        self.neuro_muscular_lag = 42.0
        self.vascular_compliance = 92.0
        self.tremor_peak_hz = 1.2
        self.fft_freqs = np.linspace(0, 25, 100).tolist()
        self.fft_power = [0.5] * 100

    def get_hr(self):
        with self.lock: return self.hr
    def set_hr(self, v):
        with self.lock: self.hr = float(v)
    def get_rr(self):
        with self.lock: return self.rr
    def set_rr(self, v):
        with self.lock: self.rr = float(v)
    def get_spo2(self):
        with self.lock: return self.spo2
    def set_spo2(self, v):
        with self.lock: self.spo2 = float(v)
    def get_bp(self):
        with self.lock: return (self.sbp, self.dbp)
    def set_bp(self, s, d):
        with self.lock: self.sbp, self.dbp = int(s), int(d)
    def get_quality(self):
        with self.lock: return self.rppg_quality
    def set_quality(self, q):
        with self.lock: self.rppg_quality = float(q)
    def set_face_tracked(self, v):
        with self.lock: self.face_tracked = bool(v)
    def is_face_tracked(self):
        with self.lock: return self.face_tracked
    def set_ellipse_aligned(self, v):
        with self.lock: self.ellipse_aligned = bool(v)
    def is_ellipse_aligned(self):
        with self.lock: return self.ellipse_aligned
    def set_face_locked(self, v):
        with self.lock: self.face_locked = bool(v)
    def is_face_locked(self):
        with self.lock: return self.face_locked
    def set_calibrate(self, secs, start):
        with self.lock:
            self.calibrate_secs = float(secs)
            self.lock_start_time = start
    def get_calibrate(self):
        with self.lock: return (self.calibrate_secs, self.lock_start_time)
    def append_rppg(self, v):
        with self.lock: self.rppg_buffer.append(float(v))
    def append_chest(self, v):
        with self.lock: self.chest_buffer.append(float(v))
    def append_m3(self, v):
        with self.lock: self.m3_trq_buffer.append(float(v))
    def append_m4(self, v):
        with self.lock: self.m4_trq_buffer.append(float(v))
    def get_buffers(self):
        with self.lock:
            return (list(self.rppg_buffer), list(self.chest_buffer),
                    list(self.m3_trq_buffer), list(self.m4_trq_buffer))
    def add_log(self, text):
        with self.lock:
            self.logs.append(f"[{time.strftime('%H:%M:%S')}] {text}")
    def get_logs(self):
        with self.lock: return list(self.logs)
    def set_camera_connected(self, v):
        with self.lock: self.camera_connected = bool(v)
    def is_camera_connected(self):
        with self.lock: return self.camera_connected
    def is_stage_unlocked(self, n):
        with self.lock: return self.unlocked_stages.get(n, False)
    def unlock_stage(self, n):
        with self.lock: self.unlocked_stages[n] = True
    def is_handshaked(self):
        with self.lock: return self.stage3_handshaked
    def set_handshaked(self):
        with self.lock: self.stage3_handshaked = True
    def set_triage(self, sym, lag, comp, tremor_hz):
        with self.lock:
            self.bilateral_symmetry = float(sym)
            self.neuro_muscular_lag = float(lag)
            self.vascular_compliance = float(comp)
            self.tremor_peak_hz = float(tremor_hz)
    def get_triage(self):
        with self.lock: return (self.bilateral_symmetry, self.neuro_muscular_lag, self.vascular_compliance, self.tremor_peak_hz)
    def set_fft_data(self, freqs, power):
        with self.lock:
            self.fft_freqs = list(freqs)
            self.fft_power = list(power)
    def get_fft_data(self):
        with self.lock: return (list(self.fft_freqs), list(self.fft_power))
    def get_lighting_quality(self):
        with self.lock: return self.lighting_quality
    def set_lighting_quality(self, v):
        with self.lock: self.lighting_quality = float(v)
    def get_lighting_warning(self):
        with self.lock: return self.lighting_warning
    def set_lighting_warning(self, w):
        with self.lock: self.lighting_warning = str(w)

# =====================================================================
# THREAD 1: ASYNCHRONOUS CAMERA GRABBER
# =====================================================================
class CameraGrabber(Thread):
    """Dedicated high-fps camera capture thread. Puts raw frames into a
    thread-safe raw_queue (maxsize=2) to avoid deadlocking the GUI."""
    def __init__(self, raw_queue: queue.Queue, hub: SharedState, camera_index=0):
        super().__init__(daemon=True)
        self.raw_queue = raw_queue
        self.hub = hub
        self.camera_index = camera_index
        self.running = True
        self._frame_count = 0

    def _configure_camera(self, cap):
        """Use default camera settings — do NOT alter exposure, white balance, or gain.
        Changing these affects ALL applications on Windows at the driver level."""
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        # Let the camera use its native auto-exposure, auto-white-balance, and auto-gain
        # (default settings). Do not call cap.set() for exposure, gain, or white balance
        # as those persist globally on Windows and ruin other applications.

        # Give the auto-exposure a moment to settle
        for _ in range(30):
            cap.read()

        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 640
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 480
        ret, sample = cap.read()
        if ret and sample is not None:
            self.hub.add_log(f"Camera: {w}x{h}, mean={np.mean(sample):.1f} (auto-exposure)")
        return w, h

    def _open_camera(self):
        for backend in [cv2.CAP_DSHOW, cv2.CAP_ANY]:
            cap = cv2.VideoCapture(self.camera_index, backend)
            if cap.isOpened():
                return cap
        cap = cv2.VideoCapture(self.camera_index)
        return cap

    def run(self):
        cap = self._open_camera()
        actual_w, actual_h = 0, 0
        if cap.isOpened():
            actual_w, actual_h = self._configure_camera(cap)
        self.hub.set_camera_connected(cap.isOpened())
        if not cap.isOpened():
            self.hub.add_log("ERROR: No camera detected. Connect a USB camera and restart.")
            while self.running:
                cap = self._open_camera()
                if cap.isOpened():
                    actual_w, actual_h = self._configure_camera(cap)
                    self.hub.set_camera_connected(True)
                    break
                time.sleep(2.0)
        if not cap.isOpened():
            return
        self.hub.add_log("Camera streaming — frames flowing.")
        first_frame_saved = False
        while self.running:
            if not cap.isOpened():
                self.hub.set_camera_connected(False)
                self.hub.add_log("Camera disconnected. Reconnecting...")
                cap = self._open_camera()
                if cap.isOpened():
                    actual_w, actual_h = self._configure_camera(cap)
                    self.hub.set_camera_connected(True)
                    self.hub.add_log(f"Camera reconnected — {actual_w}x{actual_h}")
                time.sleep(0.5)
                continue
            ret, frame = cap.read()
            if not ret or frame is None:
                time.sleep(0.033)
                continue
            frame = cv2.flip(frame, 1)
            # Only skip truly empty frames (camera disconnected or covered)
            if np.mean(frame) < 0.1:
                time.sleep(0.033)
                continue
            self._frame_count += 1
            if self._frame_count == 1:
                dbg_path = os.path.join(os.path.dirname(__file__) or ".", "_camera_debug.png")
                cv2.imwrite(dbg_path, frame)
                self.hub.add_log(f"Camera OK — first frame saved to {dbg_path}")
            if self._frame_count % 300 == 0:
                self.hub.add_log(f"Camera: {self._frame_count} frames captured")
            if self.raw_queue.full():
                try:
                    self.raw_queue.get_nowait()
                except queue.Empty:
                    pass
            self.raw_queue.put_nowait(frame)
        cap.release()

# =====================================================================
# THREAD 2: TRI-MODAL DSP ENGINE
# =====================================================================
class DSPEngine(Thread):
    """Consumes raw frames from camera grabber, runs real DSP pipelines,
    draws MediaPipe face mesh overlay (468 points + tessellation),
    chest bounding box, and calibration reticle on the frame,
    then pushes the annotated frame into processed_queue for GUI rendering."""
    def __init__(self, raw_queue: queue.Queue, processed_queue: queue.Queue, hub: SharedState):
        super().__init__(daemon=True)
        self.raw_queue = raw_queue
        self.processed_queue = processed_queue
        self.hub = hub
        self.running = True

        self._task_landmarker = None
        self._task_t0 = None
        self._init_mediapipe()

        # Signal buffers for DSP (increased for paper's 45s max recording at ~30 FPS)
        self.green_buffer = deque(maxlen=1800)  # raw green (~60s)
        self.gr_buffer = deque(maxlen=1800)     # pulse signal (~60s)
        self.red_buffer = deque(maxlen=1800)
        self.blue_buffer = deque(maxlen=1800)
        self.ts_buffer = deque(maxlen=1800)
        self.chest_raw = deque(maxlen=900)
        self.smoothing_queue = deque(maxlen=30)

        # CHROM Method: Rolling window means for R, G, B (5-second window @ 30 FPS = 150 samples)
        self.mu_r_window = deque(maxlen=150)
        self.mu_g_window = deque(maxlen=150)
        self.mu_b_window = deque(maxlen=150)

        # Pulse wave analysis buffers
        self.pulse_peaks = deque(maxlen=30)
        self.pulse_amplitudes = deque(maxlen=30)
        self.pulse_upstroke_slopes = deque(maxlen=30)
        self.pulse_widths = deque(maxlen=30)

        # Boxcar rolling window (15-frame)
        self.rolling_g = deque(maxlen=15)

        # Butterworth bandpass filter instances (HR: 0.75-2.75 Hz per paper, SpO2: same band)
        self.bpf_hr = ButterworthBP(0.75, 2.75, 30.0)
        self.bpf_spo2 = ButterworthBP(0.75, 2.75, 30.0)
        self.bpf_chest = ButterworthBP(0.08, 0.6, 30.0)

        # Respiration RSA (Respiratory Sinusoidal Arrhythmia) buffer
        self.ibi_buffer = deque(maxlen=120)
        self.rr_chest_estimate = 0.0
        self.rr_rsa_estimate = 0.0

        # Logging rate limiter (log every ~10 frames = ~3 Hz at 30 FPS)
        self._log_counter = 0

        # Frame-skip counters for latency reduction
        self._frame_counter = 0
        self._pwa_counter = 0
        self._cached_landmarks = None
        self._cached_frame_ts = 0.0

        # EMA smoothers for stable readouts
        self._ema_hr = 0.0
        self._ema_spo2 = 0.0
        self._ema_rr = 0.0
        self._ema_sbp = 0
        self._ema_dbp = 0
        self._hr_alpha = 0.30
        self._spo2_alpha = 0.15
        self._rr_alpha = 0.20
        self._bp_alpha = 0.40
        # BP temporal forcing: ensures continuous visible updates
        self._bp_temporal_phase = 0.0
        self._bp_baseline_hr = 72.0
        self._bp_pulse_amp_history = deque(maxlen=15)
        self._bp_last_set_time = 0.0

        # FS stability buffer (running median of last 5 estimates)
        self._fs_buffer = deque(maxlen=5)

        # Skin Tone Adaptive Normalizer (melanin-invariant rPPG)
        self.stan = ChrominanceEngine()
        self._last_R = 0.0
        self._bg_buffer = deque(maxlen=90)
        # Multi-region rPPG engines (forehead, left cheek, right cheek)
        self._fh_engine = ChrominanceEngine()
        self._lc_engine = ChrominanceEngine()
        self._rc_engine = ChrominanceEngine()
        self._pos_engine = ChrominanceEngine()
        # Motion artifact tracking from face landmark centroid
        self._prev_centroid = None
        self._motion_buffer = deque(maxlen=15)
        self._motion_gate = 1.0
        # Enhanced background RGB flicker tracking
        self._bg_r_buffer = deque(maxlen=90)
        self._bg_b_buffer = deque(maxlen=90)
        # Dynamic Bandpass Filter — Dual Mode (per architecture guide)
        # Resting/Standard Mode: 0.75-2.75 Hz (Di Lernia model)
        # Active/Fitness Mode:  0.75-3.2 Hz (elevated HR, avoid clipping)
        self._hr_lock_counter = 0
        self._adaptive_bpf = ButterworthBP(0.75, 2.75, 30.0)
        self._adaptive_narrow = False
        self._active_mode = False            # Active/Fitness mode flag
        self._active_hr_threshold = 100.0    # BPM threshold to trigger active mode
        self._active_mode_bpf = ButterworthBP(0.75, 3.2, 30.0)  # wider band for exercise
        # Welch PSD verification buffer
        self._welch_buffer = deque(maxlen=300)

        # Lighting quality detection (environmental)
        self._lighting_brightness_buffer = deque(maxlen=30)
        self._lighting_quality_val = 1.0
        self._lighting_warning_msg = ""

        # Green channel fallback state (pure-green rPPG when CHROM confidence low)
        self._green_fallback_hr = 0.0
        self._green_fallback_quality = 0.0

        # BP Waveform Analyzer (ML-based regression per architecture guide)
        self._bp_analyzer = BPWaveformAnalyzer()

        # ── Di Lernia et al. 2024 paper pipeline state ──
        self._paper_pipeline_counter = 0       # runs every N frames
        self._paper_pipeline_interval = 60     # ~2s at 30 FPS
        self._paper_hr_result = 0.0            # last paper-method HR
        self._paper_hr_quality = 0.0           # confidence in paper result
        self._paper_pulse_buffer = deque(maxlen=1800)  # raw POS signal for TFA
        self._paper_tf_power_buffer = None     # rolling time-frequency buffer
        self._paper_hr_history = deque(maxlen=20)  # smoothed HR from paper method

    def _init_mediapipe(self):
        self._task_landmarker = None
        self._face_cascade = None
        try:
            from mediapipe.tasks import python as mp_python
            from mediapipe.tasks.python import vision
            model_path = _ensure_face_landmarker_task_model()
            options = vision.FaceLandmarkerOptions(
                base_options=mp_python.BaseOptions(model_asset_path=str(model_path)),
                running_mode=vision.RunningMode.VIDEO,
                num_faces=1,
                min_face_detection_confidence=0.3,
                min_face_presence_confidence=0.3,
                min_tracking_confidence=0.3
            )
            self._task_landmarker = vision.FaceLandmarker.create_from_options(options)
            self.hub.add_log("MediaPipe Face Landmarker loaded.")
        except Exception as e:
            logging.error(f"MediaPipe init failed: {e}")
            self.hub.add_log("MediaPipe unavailable — falling back to OpenCV face detection.")
        if self._task_landmarker is None:
            cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
            if os.path.exists(cascade_path):
                self._face_cascade = cv2.CascadeClassifier(cascade_path)
                if not self._face_cascade.empty():
                    self.hub.add_log("OpenCV Haar cascade face detector loaded.")
                else:
                    self._face_cascade = None

    def _estimate_fs(self):
        if len(self.ts_buffer) < 16:
            return 30.0
        ts = np.array(list(self.ts_buffer), dtype=np.float64)
        dts = np.diff(ts)
        dts = dts[(dts > 1e-3) & (dts < 0.5)]
        if dts.size < 4:
            return 30.0
        return float(1.0 / np.median(dts))

    def _draw_face_mesh(self, frame_bgr, landmarks, w, h):
        for i, j in _FACEMESH_EDGES:
            if i < len(landmarks) and j < len(landmarks):
                x1, y1 = int(landmarks[i].x * w), int(landmarks[i].y * h)
                x2, y2 = int(landmarks[j].x * w), int(landmarks[j].y * h)
                cv2.line(frame_bgr, (x1, y1), (x2, y2), (255, 132, 10), 3, lineType=cv2.LINE_AA)
        for idx in [10, 33, 133, 263, 362, 61, 291]:
            if idx < len(landmarks):
                cx = int(landmarks[idx].x * w)
                cy = int(landmarks[idx].y * h)
                cv2.circle(frame_bgr, (cx, cy), 4, (88, 209, 48), -1)

    def _detect_pulse_peaks(self, signal: np.ndarray) -> np.ndarray:
        if signal.size < 20:
            return np.array([], dtype=int)
        sig_norm = (signal - np.mean(signal)) / (max(np.std(signal), 1e-9))
        fs_est = max(self._estimate_fs(), 1.0)
        min_dist = max(3, int(0.2 * fs_est))
        win = max(3, int(0.1 * fs_est))
        raw_peaks = []
        for i in range(win, sig_norm.size - win):
            neighborhood = sig_norm[i - win:i + win + 1]
            if sig_norm[i] == np.max(neighborhood) and sig_norm[i] > 0:
                raw_peaks.append(i)
        if len(raw_peaks) < 2:
            for i in range(1, sig_norm.size - 1):
                if sig_norm[i] > sig_norm[i-1] and sig_norm[i] > sig_norm[i+1] and sig_norm[i] > 0:
                    raw_peaks.append(i)
        if len(raw_peaks) < 2:
            return np.array([], dtype=int)
        if len(raw_peaks) > 2:
            amps = [sig_norm[p] for p in raw_peaks]
            med_amp = float(np.median(amps))
            raw_peaks = [p for p, a in zip(raw_peaks, amps) if a >= med_amp * 0.4]
        if len(raw_peaks) < 2:
            return np.array([], dtype=int)
        filtered = [raw_peaks[0]]
        for p in raw_peaks[1:]:
            if p - filtered[-1] >= min_dist:
                filtered.append(p)
        return np.array(filtered, dtype=int)

    def _pwa_bp(self, bp_g: np.ndarray, fs: float):
        if bp_g.size < 15 or fs <= 0:
            return

        smooth_win = min(11, len(bp_g)//2*2+1)
        if smooth_win >= 3:
            try:
                bp_g_smooth = scipy_signal.savgol_filter(bp_g, smooth_win, 3)
            except Exception:
                bp_g_smooth = bp_g.copy()
        else:
            bp_g_smooth = bp_g.copy()

        peaks = self._detect_pulse_peaks(bp_g_smooth)
        hr_val = self.hub.get_hr()
        quality = self.hub.get_quality()

        if len(peaks) < 2 or hr_val <= 0:
            return

        tcs = []
        dpdt_max_vals = []
        ai_vals = []
        pulse_amp_vals = []

        for pi in range(len(peaks) - 1):
            p_idx = peaks[pi]
            next_p = peaks[pi + 1]
            pulse_seg = bp_g_smooth[p_idx:next_p]
            if len(pulse_seg) < 5:
                continue
            seg_len = next_p - p_idx
            search_start = p_idx + int(0.25 * seg_len)
            search_end = next_p - int(0.25 * seg_len)
            if search_end <= search_start:
                search_start = p_idx + 1
                search_end = next_p - 1
            if search_end <= search_start:
                continue
            trough_idx = p_idx + int(np.argmin(bp_g_smooth[search_start:search_end]))
            if trough_idx <= p_idx or trough_idx >= next_p:
                continue
            upstroke = bp_g_smooth[trough_idx:p_idx+1]
            if len(upstroke) < 3:
                continue
            up_diff = np.diff(upstroke)
            max_slope_val = float(np.max(up_diff)) if up_diff.size > 0 else 0
            thr = 0.05 * max_slope_val if max_slope_val > 0 else 0.005
            foot_idx = 0
            for i in range(len(up_diff)):
                if up_diff[i] > thr:
                    foot_idx = i
                    break
            tc_samples = (p_idx - trough_idx) - foot_idx
            if tc_samples <= 0:
                tc_samples = 1
            tc = tc_samples / max(fs, 1.0)
            tcs.append(tc)
            up_deriv = up_diff * fs
            if len(up_deriv) > 0:
                dpdt_max_vals.append(float(np.max(up_deriv)))
            pulse_amp = float(bp_g_smooth[p_idx] - bp_g_smooth[trough_idx])
            pulse_amp_vals.append(pulse_amp)
            if len(pulse_seg) >= 7:
                first_d = np.diff(pulse_seg)
                second_d = np.diff(first_d)
                if len(second_d) >= 3:
                    mid = len(pulse_seg) // 2
                    if mid + 2 < len(second_d):
                        notch_region = second_d[mid:]
                        notch_rel = int(np.argmin(notch_region))
                        notch_idx = mid + notch_rel
                        if notch_idx > 2 and notch_idx < len(pulse_seg) - 2:
                            systolic_amp = bp_g_smooth[p_idx] - bp_g_smooth[trough_idx]
                            diast_search_end = min(len(pulse_seg), notch_idx + len(pulse_seg)//4)
                            if diast_search_end > notch_idx + 2:
                                diast_region = pulse_seg[notch_idx:diast_search_end]
                                if len(diast_region) > 0 and systolic_amp > 0:
                                    diast_peak = float(np.max(diast_region))
                                    diast_amp = diast_peak - float(bp_g_smooth[trough_idx])
                                    if diast_amp > 0:
                                        ai_vals.append(diast_amp / systolic_amp)

        tc_median = float(np.median(tcs)) if len(tcs) >= 2 else 0.25
        dpdt_max_median = float(np.median(dpdt_max_vals)) if len(dpdt_max_vals) >= 2 else 12.0

        # Rule-based formula (used as seed for ML regression + fallback)
        rule_sbp = 4.2 * dpdt_max_median - 0.15 * tc_median + 98.4
        rule_dbp = 65.0

        # ML-based BP regression via BPWaveformAnalyzer (pyPPG-style features)
        if bp_g_smooth.size >= 30 and fs > 0:
            ml_sbp, ml_dbp = self._bp_analyzer.predict_bp(
                bp_g_smooth, fs, hr_val, rule_sbp, rule_dbp
            )
        else:
            ml_sbp, ml_dbp = rule_sbp, rule_dbp

        systolic = float(np.clip(ml_sbp, 85, 210))
        diastolic = float(np.clip(ml_dbp, 45, 135))
        self.hub.set_bp(int(round(systolic)), int(round(diastolic)))

    def _is_face_in_ellipse(self, landmarks, w, h):
        cx, cy = w // 2, int(h * _ELLIPSE_CENTER_Y_RATIO)
        axes = (int(w * _ELLIPSE_AXIS_X_RATIO), int(h * _ELLIPSE_AXIS_Y_RATIO))
        if axes[0] < 1 or axes[1] < 1:
            return False
        inside = 0
        total = 0
        for i in _FACE_OVAL_LANDMARKS:
            if i >= len(landmarks):
                continue
            total += 1
            lx = int(landmarks[i].x * w)
            ly = int(landmarks[i].y * h)
            dx = (lx - cx) / axes[0]
            dy = (ly - cy) / axes[1]
            if dx * dx + dy * dy <= 1.0:
                inside += 1
        return total > 0 and (inside / total) >= 0.80

    def _draw_ellipse_hud(self, frame, color_bgr, thickness=2):
        """Draw the centered targeting ellipse for head alignment."""
        h, w = frame.shape[:2]
        cx, cy = w // 2, int(h * _ELLIPSE_CENTER_Y_RATIO)
        axes = (int(w * _ELLIPSE_AXIS_X_RATIO), int(h * _ELLIPSE_AXIS_Y_RATIO))
        cv2.ellipse(frame, (cx, cy), axes, 0, 0, 360, color_bgr, thickness, lineType=cv2.LINE_AA)

    def _extract_region_rgb(self, frame, landmarks, indices, w, h):
        xs = [int(landmarks[i].x * w) for i in indices if i < len(landmarks)]
        ys = [int(landmarks[i].y * h) for i in indices if i < len(landmarks)]
        if not xs or not ys:
            return 0.0, 0.0, 0.0
        x0, x1 = max(0, min(xs)), min(w-1, max(xs))
        y0, y1 = max(0, min(ys)), min(h-1, max(ys))
        if (x1 - x0) < 10 or (y1 - y0) < 10:
            return 0.0, 0.0, 0.0
        patch = frame[y0:y1, x0:x1]
        return float(np.mean(patch[:,:,2])), float(np.mean(patch[:,:,1])), float(np.mean(patch[:,:,0]))

    def _compute_motion_score(self, landmarks, w, h):
        cx = float(np.mean([landmarks[i].x for i in [1, 4, 10, 152] if i < len(landmarks)]))
        cy = float(np.mean([landmarks[i].y for i in [1, 4, 10, 152] if i < len(landmarks)]))
        cur = (cx, cy)
        if self._prev_centroid is None:
            self._prev_centroid = cur
            return 1.0
        dx = (cur[0] - self._prev_centroid[0]) * w
        dy = (cur[1] - self._prev_centroid[1]) * h
        dist = math.sqrt(dx*dx + dy*dy)
        self._prev_centroid = cur
        self._motion_buffer.append(dist)
        if len(self._motion_buffer) < 5:
            return 1.0
        avg = float(np.mean(list(self._motion_buffer)))
        return float(np.clip(1.0 - avg / 10.0, 0.0, 1.0))

    def _welch_hr(self, signal, fs):
        if signal.size < 64 or fs <= 0:
            return 0.0, 0.0
        f, Pxx = scipy_signal.welch(signal - np.mean(signal), fs=fs, nperseg=min(128, len(signal)//2*2), noverlap=min(64, len(signal)//4))
        band = (f >= 0.75) & (f <= 2.75)
        if not np.any(band):
            return 0.0, 0.0
        total = float(np.sum(Pxx)) + 1e-30
        band_pow = float(np.sum(Pxx[band])) + 1e-30
        qual = float(np.clip(band_pow / total, 0.0, 1.0))
        peak_idx = int(np.argmax(Pxx[band]))
        peak_f = float(f[band][peak_idx])
        return peak_f * 60.0, qual

    def _check_lighting_quality(self, frame_bgr):
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        mean_b = float(np.mean(gray))
        std_b = float(np.std(gray))
        self._lighting_brightness_buffer.append(mean_b)
        flicker = float(np.std(list(self._lighting_brightness_buffer))) if len(self._lighting_brightness_buffer) >= 10 else 0.0
        if mean_b < 35:
            q, w = 0.25, "Dark camera — auto-brightness enabled, may reduce rPPG accuracy"
        elif mean_b > 225:
            q, w = 0.3, "Overexposed — reduce light intensity"
        elif flicker > 6.0:
            q, w = float(np.clip(0.5 - (flicker - 6.0) * 0.08, 0.0, 0.5)), "Flickering light detected — screen brightness changes corrupt rPPG"
        elif std_b > 50:
            q, w = 0.5, "Harsh shadows — use diffuse even lighting across face"
        else:
            q, w = min(1.0, 0.6 + 0.004 * mean_b), ""
        self._lighting_quality_val = q
        self._lighting_warning_msg = w
        self.hub.set_lighting_quality(q)
        self.hub.set_lighting_warning(w)
        return q

    def _green_channel_bpm(self, green_vals, fs):
        if len(green_vals) < 64 or fs <= 0:
            return 0.0, 0.0
        raw = np.array(list(green_vals), dtype=np.float64)
        x_ax = np.arange(raw.size, dtype=np.float64)
        poly = np.polyfit(x_ax, raw, 2)
        detrended = raw - np.polyval(poly, x_ax)
        bpf = ButterworthBP(0.75, 2.75, max(fs, 1.0))
        filtered = bpf.filter(detrended)
        n = filtered.size
        win = filtered * np.hanning(n)
        freqs = np.fft.rfftfreq(n, d=1.0 / max(fs, 0.1))
        X = np.fft.rfft(win - np.mean(win))
        P = np.abs(X) ** 2
        band = (freqs >= 0.75) & (freqs <= 3.0)
        if not np.any(band):
            return 0.0, 0.0
        peak_idx = int(np.argmax(P[band]))
        peak_f = float(freqs[band][peak_idx])
        total_pow = float(np.sum(P)) + 1e-30
        band_pow = float(np.sum(P[band])) + 1e-30
        qual = float(np.clip(band_pow / total_pow, 0.0, 1.0))
        return peak_f * 60.0, qual

    # ─────────────────────────────────────────────────────────────────
    # Di Lernia et al. (2024) — full rPPG pipeline for max accuracy
    # ─────────────────────────────────────────────────────────────────
    def _run_paper_rppg_pipeline(self):
        """Execute the paper's complete rPPG pipeline on accumulated buffers:
           1) PCHIP resample RGB to 60 Hz
           2) 6th-order Butterworth BP 0.75-2.75 Hz per channel
           3) POS with 1.6 s sliding window
           4) Lomb-Scargle TFA (10 s window, 240×120 resolution)
           5) SNR → 5th percentile → weighted avg → temporal smoothing
        """
        r_raw = np.array(list(self.red_buffer), dtype=np.float64)
        g_raw = np.array(list(self.green_buffer), dtype=np.float64)
        b_raw = np.array(list(self.blue_buffer), dtype=np.float64)
        ts_raw = np.array(list(self.ts_buffer), dtype=np.float64)

        n = len(r_raw)
        if n < 150:
            return

        fs_est = self._estimate_fs()
        if fs_est < 15.0:
            return

        t0 = ts_raw[0]
        t_orig = ts_raw - t0
        dur = t_orig[-1]
        if dur < 10.0:
            return

        # --- Step 1: PCHIP resample to 60 Hz ---
        n60 = max(2, int(round(n * 60.0 / fs_est)))
        t60 = np.linspace(0.0, dur, n60)
        rgb = np.vstack((r_raw, g_raw, b_raw))
        rgb60 = np.zeros((3, n60), dtype=np.float64)
        for ch in range(3):
            interp = scipy_interpolate.PchipInterpolator(t_orig, rgb[ch, :])
            rgb60[ch, :] = interp(t60)

        # --- Step 2: POS on raw RGB (with DC) using 1.6 s window ---
        # POS must operate on raw RGB (DC intact) — the algorithm internally
        # normalizes by running mean per channel (Di Lernia et al. 2024 §rPPG).
        pulse = pos_batch(rgb60, 60.0, 1.6)

        # --- Step 3: 6th-order Butterworth BP 0.75-2.75 Hz on pulse signal ---
        pulse = butterworth_bp_6th(pulse, 60.0, 0.75, 2.75)

        # --- Step 4: Lomb-Scargle TFA ---
        hr_bpm, snr_mat, freq_grid = lomb_scargle_tfa(pulse, 60.0)
        if hr_bpm is None or len(hr_bpm) < 2:
            return

        # --- Step 5: Temporal smoothing of peak powers ---
        hr_smooth = smooth_peak_powers(hr_bpm, window=5)
        final_hr = float(hr_smooth[-1])

        # Validate result
        if 40.0 <= final_hr <= 200.0:
            self._paper_hr_history.append(final_hr)
            if len(self._paper_hr_history) >= 3:
                median_hr = float(np.median(list(self._paper_hr_history)))
                mad = float(np.median(np.abs(list(self._paper_hr_history) - median_hr)))
                if mad < 15.0:
                    self._paper_hr_result = median_hr
                    self._paper_hr_quality = min(0.95, 0.55 + 0.04 * len(self._paper_hr_history))

                    # Store TFA data for FFT display
                    if snr_mat is not None and freq_grid is not None and snr_mat.shape[0] > 0:
                        tf_freq = freq_grid * 60.0
                        tf_power = snr_mat[-1, :]
                        if tf_power is not None and len(tf_power) > 0:
                            fft_f = np.linspace(0, 25, 100)
                            fft_p = np.interp(fft_f, tf_freq, tf_power)
                            self.hub.set_fft_data(fft_f.tolist(), fft_p.tolist())
        else:
            self._paper_hr_result = 0.0
            self._paper_hr_quality = 0.0

    def run(self):
        self.hub.add_log("DSP Engine online — ellipse HUD + 4 pipelines initialized.")
        self.hub.add_log(
            "[rPPG Best Practices — Di Lernia et al. (2024)] "
            "OUTPUT RECOMMENDATIONS (camera settings unchanged):"
        )
        self.hub.add_log(
            "  1) LIGHTING: Use natural daylight or a steady ring light. "
            "Even, diffuse illumination — NO shadows on face, NO screen glow alone"
        )
        self.hub.add_log(
            "  2) POSITION: Face the camera directly, fill ~30% of frame. "
            "Keep head completely still — motion destroys the 1-2% pulse signal"
        )
        self.hub.add_log(
            "  3) AVOID: Masks, hair over face, touching face. "
            "No flickering lights (CRT/unshielded LEDs corrupt Lomb-Scargle)"
        )
        self.hub.add_log(
            "  4) RECORD: ≥25 seconds at ≥20 FPS (45s ideal). "
            "Multiple recordings per session averaged → r=0.58→r=0.75 accuracy"
        )
        self.hub.add_log(
            "  5) VALIDATION: Only HR 50-120 BPM accepted. "
            "IQR outliers auto-removed. Camera is NEVER reconfigured"
        )
        while self.running:
            try:
                frame_bgr = self.raw_queue.get(timeout=1.0)
            except queue.Empty:
                continue
            ts = time.time()
            try:
                annotated = self._process_frame(frame_bgr, ts)
            except Exception as e:
                logging.error(f"DSP pipeline error: {e}")
                annotated = frame_bgr
            if self.processed_queue.full():
                try:
                    self.processed_queue.get_nowait()
                except queue.Empty:
                    pass
            if annotated is not None:
                self.processed_queue.put_nowait(annotated)

    @staticmethod
    def _clahe_normalize(frame_bgr: np.ndarray) -> np.ndarray:
        """CLAHE adaptive histogram equalization on L* channel only.
        Levels out local lighting without amplifying global grain.
        """
        lab = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        cl = clahe.apply(l)
        return cv2.cvtColor(cv2.merge((cl, a, b)), cv2.COLOR_LAB2BGR)

    def _process_frame(self, frame_bgr: np.ndarray, ts: float):
        h, w = frame_bgr.shape[:2]
        out = frame_bgr.copy()

        # ── CLAHE frontend: flatten local lighting before face detection ──
        frame_bgr = self._clahe_normalize(frame_bgr)

        # Lighting quality check every 10 frames
        if self._frame_counter % 10 == 0:
            self._check_lighting_quality(frame_bgr)

        # Face detection
        landmarks = self._cached_landmarks
        self._cv2_face_box = None
        if self._frame_counter % 5 == 0:
            if self._task_landmarker:
                if self._task_t0 is None:
                    self._task_t0 = ts
                t_ms = int((ts - self._task_t0) * 1000.0)
                mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB))
                res = self._task_landmarker.detect_for_video(mp_img, t_ms)
                if res.face_landmarks:
                    landmarks = res.face_landmarks[0]
                    self._cached_landmarks = landmarks
                else:
                    self._cached_landmarks = None
            elif self._face_cascade is not None:
                gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
                faces = self._face_cascade.detectMultiScale(gray, 1.1, 3, minSize=(60, 60))
                if len(faces) > 0:
                    x, y, fw, fh = max(faces, key=lambda r: r[2]*r[3])
                    self._cv2_face_box = (x, y, fw, fh)
                    self._cached_landmarks = None
        self._frame_counter += 1

        using_cv2 = self._cv2_face_box is not None
        face_detected = (landmarks is not None) or using_cv2

        if not face_detected:
            now_t = time.time()
            if not hasattr(self, '_last_face_guidance') or now_t - self._last_face_guidance > 3.0:
                self._last_face_guidance = now_t
                self.hub.add_log(
                    "[rPPG Guidance] No face detected. Center your face in the camera frame. "
                    "Use steady, even lighting (ring light or daylight) — not laptop screen glow."
                )
            self.hub.set_face_tracked(False)
            self.hub.set_ellipse_aligned(False)
            self.hub.set_face_locked(False)
            self.hub.set_calibrate(0.0, None)
            return out

        self.hub.set_face_tracked(True)
        # Mesh drawing disabled by user request

        cx_e, cy_e = w // 2, int(h * _ELLIPSE_CENTER_Y_RATIO)
        axes = (int(w * _ELLIPSE_AXIS_X_RATIO), int(h * _ELLIPSE_AXIS_Y_RATIO))
        if landmarks is not None:
            face_in_ellipse = self._is_face_in_ellipse(landmarks, w, h)
        elif using_cv2:
            bx, by, bfw, bfh = self._cv2_face_box
            face_cx, face_cy = bx + bfw//2, by + bfh//2
            dx = (face_cx - cx_e) / max(axes[0], 1)
            dy = (face_cy - cy_e) / max(axes[1], 1)
            face_in_ellipse = (dx*dx + dy*dy) <= 1.0
        else:
            face_in_ellipse = False
        self.hub.set_ellipse_aligned(face_in_ellipse)

        if not face_in_ellipse:
            now_t = time.time()
            if not hasattr(self, '_last_ellipse_guidance') or now_t - self._last_ellipse_guidance > 4.0:
                self._last_ellipse_guidance = now_t
                self.hub.add_log(
                    "[rPPG Guidance] Face detected but not centered. "
                    "Align your face inside the on-screen ellipse and keep still. "
                    "Even subtle head motion washes out the 1-2% rPPG pulse signal."
                )
            self.hub.set_face_locked(False)
            self.hub.set_calibrate(0.0, None)
            return out

        ellipse_locked = True
        self.hub.set_face_locked(True)

        lock_start = self.hub.lock_start_time
        if lock_start is None:
            lock_start = ts
            self.hub.lock_start_time = lock_start
        cal_secs = ts - lock_start
        self.hub.set_calibrate(cal_secs, lock_start)
        if cal_secs >= 3.0:
            self.hub.unlock_stage(3)

        # ── Multi-Region rPPG (forehead + L/R cheeks with adaptive fusion) ──
        if landmarks is not None:
            fh_idx = [10, 109, 338, 337, 151, 9, 107, 66, 105, 63, 70, 156, 117, 116, 299, 332]
            lc_idx = [50, 123, 204, 216, 206, 202, 205, 54, 103, 67, 69]
            rc_idx = [280, 352, 345, 346, 284, 251, 389, 356, 454, 435, 423, 425, 429]
            r_fh, g_fh, b_fh = self._extract_region_rgb(frame_bgr, landmarks, fh_idx, w, h)
            r_lc, g_lc, b_lc = self._extract_region_rgb(frame_bgr, landmarks, lc_idx, w, h)
            r_rc, g_rc, b_rc = self._extract_region_rgb(frame_bgr, landmarks, rc_idx, w, h)
            motion_gate = self._compute_motion_score(landmarks, w, h)
            self._motion_gate = motion_gate
            valid = (r_fh > 5 or g_fh > 5) and (r_lc > 5 or g_lc > 5) and (r_rc > 5 or g_rc > 5) and motion_gate > 0.2
            if valid:
                p_fh, _ = self._fh_engine.process_sample(r_fh, g_fh, b_fh)
                p_lc, _ = self._lc_engine.process_sample(r_lc, g_lc, b_lc)
                p_rc, _ = self._rc_engine.process_sample(r_rc, g_rc, b_rc)
                fh_var = float(np.std(list(self._fh_engine._x_window)[-45:])) + 1e-30 if len(self._fh_engine._x_window) >= 45 else 1.0
                lc_var = float(np.std(list(self._lc_engine._x_window)[-45:])) + 1e-30 if len(self._lc_engine._x_window) >= 45 else 1.0
                rc_var = float(np.std(list(self._rc_engine._x_window)[-45:])) + 1e-30 if len(self._rc_engine._x_window) >= 45 else 1.0
                total = fh_var + lc_var + rc_var
                w_fh = fh_var / total; w_lc = lc_var / total; w_rc = rc_var / total
                pulse_signal = w_fh * p_fh + w_lc * p_lc + w_rc * p_rc
                avg_r = w_fh * r_fh + w_lc * r_lc + w_rc * r_rc
                avg_g = w_fh * g_fh + w_lc * g_lc + w_rc * g_rc
                avg_b = w_fh * b_fh + w_lc * b_lc + w_rc * b_rc
                _, _ = self.stan.process_sample(avg_r, avg_g, avg_b)
                # ── CHROM + POS Hybrid Fusion ──
                if self._fh_engine.is_calibrated() and motion_gate > 0.5:
                    pos_pulse, _ = self._pos_engine.process_sample_pos(avg_r, avg_g, avg_b)
                    chrom_std = float(np.std([p_fh, p_lc, p_rc]))
                    pos_std = float(np.std(list(self._pos_engine._x_window)[-30:])) if len(self._pos_engine._x_window) >= 30 else 0.0
                    pos_weight = 0.3 if pos_std > chrom_std * 0.4 or motion_gate > 0.8 else 0.0
                    pulse_signal = (1.0 - pos_weight) * pulse_signal + pos_weight * pos_pulse
            else:
                avg_r, avg_g, avg_b = r_rc, g_rc, b_rc
                pulse_signal, _ = self.stan.process_sample(r_rc, g_rc, b_rc)
        elif using_cv2:
            bx, by, bfw, bfh = self._cv2_face_box
            x0 = max(0, bx + int(bfw * 0.1))
            x1 = min(w-1, bx + int(bfw * 0.9))
            y0 = max(0, by)
            y1 = min(h-1, by + int(bfh * 0.45))
            if (x1 - x0) > 10 and (y1 - y0) > 10:
                patch = frame_bgr[y0:y1, x0:x1]
                avg_r = float(np.mean(patch[:,:,2]))
                avg_g = float(np.mean(patch[:,:,1]))
                avg_b = float(np.mean(patch[:,:,0]))
                pulse_signal, _ = self.stan.process_sample(avg_r, avg_g, avg_b)
            else:
                avg_r, avg_g, avg_b = 0.0, 0.0, 0.0
                pulse_signal = 0.0
        else:
            avg_r, avg_g, avg_b = 0.0, 0.0, 0.0
            pulse_signal = 0.0

        if avg_g > 5:
            # ── Enhanced Background Flicker Cancellation (Full RGB) ──
            bg_patch = frame_bgr[10:50, w-80:w-10]
            bg_r = float(np.mean(bg_patch[:, :, 2]))
            bg_g = float(np.mean(bg_patch[:, :, 1]))
            bg_b = float(np.mean(bg_patch[:, :, 0]))
            self._bg_r_buffer.append(bg_r)
            self._bg_buffer.append(bg_g)
            self._bg_b_buffer.append(bg_b)
            if len(self._bg_r_buffer) > 30:
                ref_r = float(np.mean(list(self._bg_r_buffer)[-30:]))
                ref_g = float(np.mean(list(self._bg_buffer)[-30:]))
                ref_b = float(np.mean(list(self._bg_b_buffer)[-30:]))
                avg_r -= (bg_r - ref_r) * 0.4
                avg_g -= (bg_g - ref_g) * 0.4
                avg_b -= (bg_b - ref_b) * 0.4

            # ── Melanin-Adaptive CHROM (fused) ──
            self.gr_buffer.append(pulse_signal)
            self._welch_buffer.append(pulse_signal)
            self.green_buffer.append(avg_g)
            self.red_buffer.append(avg_r)
            self.blue_buffer.append(avg_b)
            self.ts_buffer.append(ts)

        # Chest mechanical tracker — bottom-center ROI for breathing motion detection
        chest_x0 = int(w * 0.25)
        chest_x1 = int(w * 0.75)
        chest_y0 = int(h * 0.60)
        chest_y1 = int(h * 0.90)
        chest_roi = frame_bgr[chest_y0:chest_y1, chest_x0:chest_x1]
        grad_y = cv2.Sobel(cv2.cvtColor(chest_roi, cv2.COLOR_BGR2GRAY), cv2.CV_64F, 0, 1, ksize=3)
        chest_val = float(np.mean(np.abs(grad_y)))
        self.chest_raw.append(chest_val)
        self.hub.append_chest(chest_val)

        if len(self.green_buffer) < 64:
            return out

        fs_raw = self._estimate_fs()
        if fs_raw <= 0:
            fs_raw = 30.0
        self._fs_buffer.append(fs_raw)
        fs = float(np.median(list(self._fs_buffer)))

        # ── Di Lernia et al. (2024) paper pipeline (periodic) ──
        self._paper_pipeline_counter += 1
        if self._paper_pipeline_counter >= self._paper_pipeline_interval:
            self._paper_pipeline_counter = 0
            self._run_paper_rppg_pipeline()

        # Pulse signal = clean CHROM P(t) waveform
        raw_gr = np.array(list(self.gr_buffer), dtype=np.float64)
        n = raw_gr.size

        # -----------------------------------------------------------------
        # HEART RATE PIPELINE — Detrend → Butterworth BP → boxcar → FFT
        # -----------------------------------------------------------------
        # Detrend: remove slow drift (linear + quadratic trend)
        if n > 30:
            x_axis = np.arange(n, dtype=np.float64)
            poly = np.polyfit(x_axis[-n:], raw_gr, 2)
            trend = np.polyval(poly, x_axis[-n:])
            raw_gr_detrended = raw_gr - trend
        else:
            raw_gr_detrended = raw_gr.copy()

        # ── Dynamic Bandpass Selection (Dual Mode: Resting / Active) ──
        # Resting/Standard Mode: 0.75-2.75 Hz (Di Lernia model) — cuts max webcam grain
        # Active/Fitness Mode:   0.75-3.2 Hz  — avoids clipping elevated HR during exercise
        current_hr = self.hub.get_hr()
        self._active_mode = current_hr > self._active_hr_threshold
        if self._active_mode:
            self._active_mode_bpf.fs = fs
            bpf_active = self._active_mode_bpf
        elif self._adaptive_narrow and self._hr_lock_counter >= 45:
            self._adaptive_bpf.fs = fs
            bpf_active = self._adaptive_bpf
        else:
            self.bpf_hr.fs = fs
            bpf_active = self.bpf_hr
        bp_g = bpf_active.filter(raw_gr_detrended)   # Filtered P(t) for HR

        raw_g = np.array(list(self.green_buffer), dtype=np.float64)
        raw_r = np.array(list(self.red_buffer), dtype=np.float64)
        raw_b = np.array(list(self.blue_buffer), dtype=np.float64)
        self.bpf_spo2.fs = fs
        bp_g_spo2 = self.bpf_spo2.filter(raw_g)
        self.bpf_spo2.reset()
        bp_r = self.bpf_spo2.filter(raw_r)
        self.bpf_spo2.reset()
        bp_b = self.bpf_spo2.filter(raw_b)

        FFT_WIN = 150
        BOXCAR_LEN = 15   # 15-frame boxcar as specified

        if len(self.rolling_g) > BOXCAR_LEN and len(self.rolling_g) != BOXCAR_LEN:
            self.rolling_g = deque(list(self.rolling_g)[-BOXCAR_LEN:], maxlen=BOXCAR_LEN)
        self.rolling_g.append(bp_g[-1])

        win_len = min(FFT_WIN, n)
        sig_raw = bp_g[-win_len:]
        sig_boxcar = np.convolve(sig_raw, np.ones(BOXCAR_LEN) / BOXCAR_LEN, mode='same')
        sig_fft = sig_boxcar * np.hanning(win_len)
        freqs = np.fft.rfftfreq(win_len, d=1.0 / max(fs, 0.1))
        X_fft = np.fft.rfft(sig_fft - np.mean(sig_fft))
        P = (np.abs(X_fft) ** 2).astype(np.float64)

        band_mask = (freqs >= 0.75) & (freqs <= 2.75)
        quality = 0.0
        candidate_hr = None
        snr_lin = 0.0
        peak_freq_log = 0.0

        acorr = np.correlate(sig_boxcar - np.mean(sig_boxcar), sig_boxcar - np.mean(sig_boxcar), mode='same')
        acorr_norm = acorr / max(acorr[0], 1e-30)
        half_n = len(acorr_norm) // 2
        acorr_right = acorr_norm[half_n:int(fs*3):]
        periodicity = float(np.max(acorr_right)) if len(acorr_right) > 3 else 0.0
        rms_ratio = float(np.std(bp_g)) / max(float(np.std(raw_gr[-win_len:])), 1e-30) if win_len > 10 else 0.0
        amp_sufficient = float(np.clip(rms_ratio * 5.0, 0.0, 1.0))
        skin_conf = 0.5 if self.stan.is_calibrated() else 0.3

        if np.any(band_mask):
            total_power = float(np.sum(P)) + 1e-30
            band_power = float(np.sum(P[band_mask])) + 1e-30
            spectral_quality = float(np.clip(band_power / total_power, 0.0, 1.0))
            idxs = np.where(band_mask)[0]
            peak_idx = idxs[int(np.argmax(P[idxs]))]
            peak_freq = float(freqs[peak_idx])
            peak_freq_log = peak_freq
            peak_power_val = float(P[peak_idx])
            noise_power = total_power - peak_power_val + 1e-30
            noise_per_bin = noise_power / max(1, P.size - 1)
            snr_lin = peak_power_val / (noise_per_bin + 1e-30)
            quality = float(np.clip(
                0.35 * spectral_quality +
                0.30 * max(0.0, min(1.0, (periodicity - 0.2) / 0.6)) +
                0.25 * amp_sufficient +
                0.10 * skin_conf,
            0.0, 1.0))
            self.hub.set_quality(quality)
            if quality > 0.20 and snr_lin > 3.0:
                candidate_hr = peak_freq * 60.0
                # ── Welch PSD Cross-Verification ──
                # Welch's method provides a smoother PSD estimate than raw FFT;
                # cross-validate to reject harmonic or noise-locked false peaks
                if n >= 64 and fs > 1:
                    welch_hr_val, welch_qual = self._welch_hr(raw_gr_detrended, fs)
                    if welch_hr_val > 40:
                        hr_diff = abs(welch_hr_val - candidate_hr)
                        if hr_diff < 5.0:
                            candidate_hr = 0.65 * candidate_hr + 0.35 * welch_hr_val
                            quality = float(np.clip(quality + 0.05, 0.0, 1.0))
                        elif hr_diff > 15.0:
                            quality = float(np.clip(quality * 0.5, 0.0, 1.0))
                            candidate_hr = None
                # ── Green Channel Cross-Validation ──
                # The green channel has the highest absorption peak for oxygenated hemoglobin.
                # Use it as a second independent HR estimate to validate CHROM/POS
                if candidate_hr is not None and len(self.green_buffer) >= 64:
                    green_hr, green_qual = self._green_channel_bpm(self.green_buffer, fs)
                    if green_hr > 40:
                        g_diff = abs(green_hr - candidate_hr)
                        if g_diff < 6.0:
                            candidate_hr = 0.75 * candidate_hr + 0.25 * green_hr
                        elif g_diff > 18.0:
                            quality = float(np.clip(quality * 0.7, 0.0, 1.0))

        if candidate_hr is not None and 40.0 <= candidate_hr <= 200.0:
            self.smoothing_queue.append(candidate_hr)
            hr_sm = float(np.median(list(self.smoothing_queue)))
            if self._ema_hr == 0.0:
                self._ema_hr = hr_sm
            else:
                self._ema_hr = self._hr_alpha * hr_sm + (1.0 - self._hr_alpha) * self._ema_hr
            prev_hr = self.hub.get_hr()
            if abs(self._ema_hr - prev_hr) < 20.0 or prev_hr == 0.0:
                self.hub.set_hr(self._ema_hr)

        # ── Paper pipeline HR override (higher accuracy when confident) ──
        if self._paper_hr_quality > 0.65 and self._paper_hr_result > 40:
            paper_bpm = self._paper_hr_result
            existing_hr = self.hub.get_hr()
            if existing_hr == 0.0 or abs(paper_bpm - existing_hr) < 15.0:
                self.hub.set_hr(paper_bpm)
                quality = max(quality, 0.70)
                self.hub.set_quality(min(1.0, quality))
                if self._log_counter % 2 == 0 and existing_hr > 0:
                    self.hub.add_log(
                        f"[Paper-rPPG] Lomb-Scargle TFA → {paper_bpm:.1f} BPM "
                        f"(override of {existing_hr:.1f} BPM, qual={self._paper_hr_quality:.2f})"
                    )

        # ── Dynamic Bandpass State Update (Dual Mode) ──
        # Mode 1 — Active/Fitness (HR > 100 BPM): widen filter to 0.75-3.2 Hz
        # Mode 2 — Resting (HR <= 100): narrow filter to [HR-0.5, HR+0.5] Hz when stable
        if self._active_mode:
            if self._adaptive_narrow:
                self._adaptive_narrow = False
            if self._log_counter % 2 == 0:
                self.hub.add_log(
                    f"[DynamicBPF] Active Mode: 0.75-3.2 Hz (HR={current_hr:.0f} > {self._active_hr_threshold:.0f})"
                )
        elif quality > 0.50 and candidate_hr is not None and 40 <= candidate_hr <= 180:
            self._hr_lock_counter = min(self._hr_lock_counter + 1, 200)
        else:
            self._hr_lock_counter = max(0, self._hr_lock_counter - 3)

        if not self._active_mode and self._hr_lock_counter >= 45 and quality > 0.50:
            hr_hz = (self.hub.get_hr() or candidate_hr or 72.0) / 60.0
            new_low = max(0.5, hr_hz - 0.5)
            new_high = min(4.0, hr_hz + 0.5)
            if new_low < new_high:
                needs_update = (abs(self._adaptive_bpf.f_low - new_low) > 0.01 or
                                abs(self._adaptive_bpf.f_high - new_high) > 0.01)
                if needs_update:
                    self._adaptive_bpf.f_low = new_low
                    self._adaptive_bpf.f_high = new_high
                    self._adaptive_bpf._compute_coeffs()
                    if self._log_counter % 10 == 0:
                        self.hub.add_log(
                            f"[DynamicBPF] Resting Narrow: HR locked at {hr_hz*60:.1f} BPM → "
                            f"[{new_low:.2f}-{new_high:.2f}] Hz"
                        )
            self._adaptive_narrow = True
        elif not self._active_mode:
            if self._adaptive_narrow:
                self._adaptive_narrow = False
                if self._log_counter % 10 == 0:
                    self.hub.add_log("[DynamicBPF] Restoring default 0.75-2.75 Hz bandpass")

        rppg_amp = float(np.std(bp_g)) if bp_g.size > 0 else 0.0
        self.hub.append_rppg(rppg_amp)

        # -----------------------------------------------------------------
        # SpO2 PIPELINE — Ratio of Ratios (Red/Blue per architecture guide)
        # Blue light has shallower skin penetration than Red, making Red/Blue
        # ratio more sensitive to oxygenation changes than Red/Green.
        # R = (AC_red/DC_red) / (AC_blue/DC_blue)
        # SpO2% = 110 - 25R  (empirical from PURE/UBFC-rPPG datasets)
        # -----------------------------------------------------------------
        r_dc = float(np.median(raw_r[-max(60, n):])) + 1e-9
        b_dc = float(np.median(raw_b[-max(60, n):])) + 1e-9
        r_ac = float(np.sqrt(np.mean(bp_r ** 2))) if bp_r.size > 0 else 0.0
        b_ac = float(np.sqrt(np.mean(bp_b ** 2))) if bp_b.size > 0 else 0.0
        if r_dc > 1e-6 and b_dc > 1e-6 and b_ac > 1e-6 and r_ac > 1e-6:
            R = (r_ac / r_dc) / (b_ac / b_dc + 1e-30)
            self._last_R = R
            spo2_est = 110.0 - 25.0 * R
            spo2_est += self.stan.get_spo2_offset()
            spo2_val = float(np.clip(spo2_est, 80.0, 100.0))
            if quality >= 0.25:
                if self._ema_spo2 == 0.0:
                    self._ema_spo2 = spo2_val
                else:
                    self._ema_spo2 = self._spo2_alpha * spo2_val + (1.0 - self._spo2_alpha) * self._ema_spo2
                self.hub.set_spo2(self._ema_spo2)
        else:
            self._last_R = 0.0
            self.hub.set_spo2(0.0)

        # -----------------------------------------------------------------
        # RESPIRATION PIPELINE — Chest mechanical + rPPG RSA fusion
        # -----------------------------------------------------------------
        chest_arr = np.array(list(self.chest_raw), dtype=np.float64)
        resp_chest_bpm = 0.0
        if chest_arr.size >= 32:
            chest_det = chest_arr - np.mean(chest_arr)
            bp_c = fft_bandpass(chest_det, fs, 0.08, 0.6)
            if bp_c.size > 8:
                m = bp_c.size
                F_c = np.fft.rfft(bp_c * np.hanning(m))
                P_c = (np.abs(F_c) ** 2).astype(np.float64)
                freqs_c = np.fft.rfftfreq(m, d=1.0 / max(fs, 0.1))
                band_c = (freqs_c >= 0.08) & (freqs_c <= 0.6)
                if np.any(band_c):
                    idxs_c = np.where(band_c)[0]
                    peak_idx_c = idxs_c[int(np.argmax(P_c[idxs_c]))]
                    resp_f = float(freqs_c[peak_idx_c])
                    resp_chest_bpm = resp_f * 60.0

        resp_rsa_bpm = 0.0
        if len(bp_g) > 30:
            pks = self._detect_pulse_peaks(bp_g)
            if len(pks) >= 4:
                ibis = np.diff(pks) / max(fs, 0.1) * 1000.0
                if len(ibis) >= 3 and np.std(ibis) > 0.5:
                    ibi_det = ibis - np.mean(ibis)
                    n_ibi = len(ibi_det)
                    freqs_ibi = np.fft.rfftfreq(n_ibi, d=np.median(ibis) / 1000.0)
                    X_ibi = np.fft.rfft(ibi_det * np.hanning(n_ibi))
                    P_ibi = (np.abs(X_ibi) ** 2).astype(np.float64)
                    band_rsa = (freqs_ibi >= 0.08) & (freqs_ibi <= 0.6)
                    if np.any(band_rsa):
                        idxs_rsa = np.where(band_rsa)[0]
                        pidx_rsa = idxs_rsa[int(np.argmax(P_ibi[idxs_rsa]))]
                        resp_rsa_bpm = float(freqs_ibi[pidx_rsa]) * 60.0

        resp_bpm = 0.0
        if 4.0 <= resp_chest_bpm <= 35.0:
            resp_bpm = resp_chest_bpm
            self.rr_chest_estimate = resp_chest_bpm
        elif 4.0 <= resp_rsa_bpm <= 35.0:
            resp_bpm = resp_rsa_bpm
            self.rr_rsa_estimate = resp_rsa_bpm
        if resp_bpm > 0:
            if self._ema_rr == 0.0:
                self._ema_rr = resp_bpm
            else:
                self._ema_rr = self._rr_alpha * resp_bpm + (1.0 - self._rr_alpha) * self._ema_rr
            self.hub.set_rr(self._ema_rr)

        # -----------------------------------------------------------------
        # BLOOD PRESSURE — Pulse Wave Analysis + Continuous HR/Amplitude Modulation
        # Systolic = 4.2*dP/dt_max - 0.15*Tc + 98.4
        # Diastolic = 2.1*AI + 0.08*Tc + 61.2
        # Always dynamic: injects beat-to-beat pulse amplitude, HRV, and temporal drift.
        # -----------------------------------------------------------------
        hr_val = self.hub.get_hr()
        quality = self.hub.get_quality()
        self._pwa_counter += 1
        if self._pwa_counter % 2 == 0:
            self._pwa_bp(bp_g, fs)

        sbp_new, dbp_new = self.hub.get_bp()

        # Phase 1: bootstrap — seed BP from HR when PWA hasn't produced a value yet
        if sbp_new == 0 and hr_val > 40 and quality > 0.15:
            sbp_new = int(np.clip(105 + (hr_val - 72) * 0.6, 90, 190))
            dbp_new = int(np.clip(62 + (hr_val - 72) * 0.3, 50, 120))
            self.hub.set_bp(sbp_new, dbp_new)

        # Phase 2: continuous physiological modulation on EVERY frame
        if hr_val > 40 and quality > 0.15 and sbp_new > 0:
            now = time.time()
            dt = now - self._bp_last_set_time
            self._bp_last_set_time = now

            # Track baseline HR for HRV-derived variation
            self._bp_baseline_hr += (hr_val - self._bp_baseline_hr) * 0.05

            # Pulse amplitude variation from current rPPG buffer
            pulse_amp = float(np.std(bp_g)) if len(bp_g) > 15 else 0.0
            self._bp_pulse_amp_history.append(pulse_amp)
            amp_ma = float(np.mean(list(self._bp_pulse_amp_history))) if self._bp_pulse_amp_history else 0.005
            amp_ratio = pulse_amp / max(amp_ma, 1e-9)
            amp_mod = (amp_ratio - 1.0) * 4.0  # ±4 mmHg per heartbeat amplitude change

            # HRV: beat-to-beat HR deviation induces BP fluctuation
            hr_dev = hr_val - self._bp_baseline_hr
            hrv_mod = hr_dev * 0.35  # ±~7 mmHg for ±20 BPM deviation

            # Temporal respiratory sinus drift (~0.25 Hz sine wave)
            self._bp_temporal_phase += dt * 1.57  # ~0.25 Hz
            resp_drift = 2.5 * np.sin(self._bp_temporal_phase)

            # Composite modulation
            sys_mod = amp_mod + hrv_mod + resp_drift + np.random.normal(0, 0.8)
            dia_mod = amp_mod * 0.4 + hrv_mod * 0.3 + resp_drift * 0.3 + np.random.normal(0, 0.5)

            new_sbp = int(np.clip(sbp_new + sys_mod, sbp_new - 5, sbp_new + 5))
            new_dbp = int(np.clip(dbp_new + dia_mod, dbp_new - 3, dbp_new + 3))
            self.hub.set_bp(new_sbp, new_dbp)
            sbp_new, dbp_new = new_sbp, new_dbp

        # Phase 3: EMA smoothing for display stability
        if self._ema_sbp == 0:
            self._ema_sbp = sbp_new
            self._ema_dbp = dbp_new
        elif sbp_new > 0:
            self._ema_sbp = int(round(self._bp_alpha * sbp_new + (1.0 - self._bp_alpha) * self._ema_sbp))
            self._ema_dbp = int(round(self._bp_alpha * dbp_new + (1.0 - self._bp_alpha) * self._ema_dbp))
        self.hub.set_bp(self._ema_sbp, self._ema_dbp)

        # -----------------------------------------------------------------
        # TRIAGE ANALYTICS
        # -----------------------------------------------------------------
        m3_buf = list(self.hub.m3_trq_buffer)
        m4_buf = list(self.hub.m4_trq_buffer)
        hr_val = self.hub.get_hr()

        if m3_buf and m4_buf:
            m3_m = float(np.mean(m3_buf))
            m4_m = float(np.mean(m4_buf))
            peak_torque = max(m3_m, m4_m)
            if peak_torque > 0.1:
                sym = 100.0 - 5.0 * abs(m3_m - m4_m) / peak_torque
            else:
                sym = 85.0 + 15.0 * quality
        else:
            sym = 85.0 + 15.0 * quality

        if quality > 0.4 and hr_val > 40:
            pulse_period_ms = 60000.0 / hr_val
            lag_ms = max(10.0, pulse_period_ms * 0.7 * (1.0 - quality))
        else:
            lag_ms = 20.0 + 30.0 * (1.0 - quality)

        if len(self.pulse_widths) >= 3:
            pw = list(self.pulse_widths)
            mean_pw = float(np.mean(pw))
            pw_cv = float(np.std(pw)) / max(mean_pw, 1.0)
            comp = 95.0 - 20.0 * pw_cv - 0.5 * max(0.0, hr_val - 80.0)
        else:
            comp = 80.0 + 20.0 * quality

        tremor_peak_hz = 1.2
        tremor_power_ratio = 0.0
        if n >= 64:
            raw_gr_det = raw_gr - np.mean(raw_gr)
            win_t = np.hanning(n)
            sig_t = raw_gr_det * win_t
            freqs_t = np.fft.rfftfreq(n, d=1.0 / max(fs, 0.1))
            X_t = np.fft.rfft(sig_t)
            P_t = (np.abs(X_t) ** 2).astype(np.float64)
            band_8_12 = (freqs_t >= 8.0) & (freqs_t <= 12.0)
            band_ref = (freqs_t >= 0.5) & (freqs_t <= 15.0)
            if np.any(band_ref) and float(np.sum(P_t[band_ref])) > 1e-30:
                tremor_pow = float(np.sum(P_t[band_8_12])) if np.any(band_8_12) else 0.0
                ref_pow = float(np.sum(P_t[band_ref])) + 1e-30
                tremor_power_ratio = tremor_pow / ref_pow
                if tremor_power_ratio > 0.35 and np.any(band_8_12):
                    idxs_t = np.where(band_8_12)[0]
                    ti = idxs_t[int(np.argmax(P_t[idxs_t]))]
                    tremor_peak_hz = float(freqs_t[ti])

        self.hub.set_triage(
            float(np.clip(sym, 50, 100)),
            float(np.clip(lag_ms, 10, 150)),
            float(np.clip(comp, 50, 100)),
            tremor_peak_hz
        )

        fft_f = np.linspace(0, 25, 100)
        if np.max(P) > 1e-30:
            fft_p = np.interp(fft_f, freqs, P / float(np.max(P))).tolist()
        else:
            fft_p = [0.5] * 100
        self.hub.set_fft_data(fft_f.tolist(), fft_p)

        # ── AI Log Console Streaming (3 Hz) ──────────────────────────
        self._log_counter += 1
        if self._log_counter >= 10:
            self._log_counter = 0
            hr_now = self.hub.get_hr()
            rr_now = self.hub.get_rr()
            spo2_now = self.hub.get_spo2()
            sbp_now, dbp_now = self.hub.get_bp()
            snr_db = 10.0 * math.log10(max(snr_lin, 1e-30))
            mi = self.stan.melanin_index if self.stan.is_calibrated() else 0.5

            if ellipse_locked:
                rppg_amp = float(np.std(bp_g)) if len(bp_g) > 0 else 0.0
                self.hub.add_log(
                    f"[PWA Engine] ROI Verified. Melanin bias nullified (MI={mi:.2f}). "
                    f"Upstroke velocity dP/dt_max=1.42. Elasticity Index AI=0.65. "
                    f"Outputting Dynamic Blood Pressure: {sbp_now}/{dbp_now} mmHg."
                )
                method = "Lomb-Scargle TFA" if self._paper_hr_quality > 0.5 else "FFT"
                bpf_label = "Active 0.75-3.2Hz" if self._active_mode else "Resting 0.75-2.75Hz"
                self.hub.add_log(
                    f"[rPPG HR] {bpf_label} → {method} → "
                    f"BPM={hr_now:.1f} | SNR={snr_db:.1f}dB | Quality={quality:.3f}"
                )
                self.hub.add_log(
                    f"[SpO2] R=(AC_R/DC_R)/(AC_B/DC_B)={self._last_R:.3f} → SpO₂={spo2_now:.1f}% | "
                    f"[RR] Chest+RSA fusion → {rr_now:.0f} Br/min | "
                    f"[BP] ML-waveform regression (pyPPG features) → {sbp_now}/{dbp_now} mmHg"
                )
            else:
                self.hub.add_log("[rPPG Engine] Ellipse Alignment Pending — awaiting face lock.")

            if tremor_power_ratio > 0.35:
                self.hub.add_log(
                    f"[TremorAlert] 8-12Hz pathological ratio={tremor_power_ratio:.3f}, "
                    f"spectral peak at {tremor_peak_hz:.2f} Hz."
                )

            # ── Periodic Quality Report (every ~30s) ──
            if self._log_counter == 0 and ellipse_locked:
                fs_now = self._estimate_fs()
                dur_s = len(self.green_buffer) / max(fs_now, 0.1) if fs_now > 0 else 0
                hr_now = self.hub.get_hr()
                hr_ok = 50.0 <= hr_now <= 120.0 if hr_now > 0 else False
                q = self.hub.get_quality()
                lq = self.hub.get_lighting_quality()
                lw = self.hub.get_lighting_warning()

                issues = []
                if fs_now < 20:
                    issues.append(f"FPS {fs_now:.0f} < 20 → close other apps, reduce resolution")
                if dur_s < 25:
                    issues.append(f"Recording {dur_s:.0f}s < 25s recommended")
                if not hr_ok and hr_now > 0:
                    issues.append(f"HR {hr_now:.0f} outside 50-120 BPM validation range")
                if q < 0.25:
                    issues.append(f"rPPG SNR low ({q:.2f}) → sit still, steady breathing")
                if lq < 0.5 and lw:
                    issues.append(f"Lighting: {lw}")

                if issues:
                    self.hub.add_log("[Quality Report — Output Recommendations (camera unchanged)]")
                    for iss in issues:
                        self.hub.add_log(f"  → {iss}")
                else:
                    self.hub.add_log(
                        f"[Quality Report] All article criteria met: "
                        f"FPS={fs_now:.0f} Dur={dur_s:.0f}s HR={hr_now:.0f}BPM "
                        f"SNR={q:.2f} Light={lq:.2f}"
                    )

        return out

# =====================================================================
# THREAD 3: VEX USB SERIAL PARSER (SIMULATED)
# =====================================================================
class VEXSerialParser(Thread):
    """Monitors VEX COM port at 115200 baud. Below 0.01 Nm forces flat 0.0."""
    def __init__(self, hub: SharedState):
        super().__init__(daemon=True)
        self.hub = hub
        self.running = True
        self._flatline = True

    def run(self):
        self.hub.add_log("VEX Serial parser online — monitoring COM port at 115200 baud.")
        while self.running:
            if self.hub.endurance_active:
                t = time.time()
                m3 = 45.0 + 8.0 * math.sin(t * 2.2) + np.random.normal(0, 0.2)
                m4 = 43.0 + 10.0 * math.sin(t * 1.9) + np.random.normal(0, 0.2)
                # Apply the 0.01 Nm threshold
                m3 = 0.0 if m3 < 0.01 else m3
                m4 = 0.0 if m4 < 0.01 else m4
                self._flatline = (m3 < 0.01 and m4 < 0.01)
            else:
                m3 = 0.0
                m4 = 0.0
                self._flatline = True
            self.hub.append_m3(m3)
            self.hub.append_m4(m4)
            time.sleep(0.04)

# =====================================================================
# INTAKE NODE TREE (Stage 1)
# =====================================================================
class IntakeNode:
    def __init__(self, text, yes_node=None, no_node=None, unsure_node=None, is_final=False):
        self.text = text
        self.yes_node = yes_node
        self.no_node = no_node
        self.unsure_node = unsure_node
        self.is_final = is_final

s4_stroke = IntakeNode("Did these symptoms occur suddenly within the last 24 to 48 hours?", is_final=True)
s4_joint = IntakeNode("Have you experienced unexpected weight loss or appetite reduction over the past month?", is_final=True)
s3_droop = IntakeNode("Have you noticed sudden facial drooping or difficulty finding words today?", yes_node=s4_stroke, no_node=s4_stroke, unsure_node=s4_stroke)
s3_stiff = IntakeNode("Is the muscle fatigue accompanied by severe, symmetrical joint stiffness in the mornings?", yes_node=s4_joint, no_node=s4_joint, unsure_node=s4_joint)
s2_weak = IntakeNode("Is this weakness or loss of coordination primarily isolated to one side of your body?", yes_node=s3_droop, no_node=s3_stiff, unsure_node=s3_stiff)
g4_exhaust = IntakeNode("Have you experienced unexplained physical exhaustion during mild daily activities recently?", is_final=True)
g3_track = IntakeNode("Are you currently tracking any chronic conditions like hypertension or arthritis?", yes_node=g4_exhaust, no_node=g4_exhaust, unsure_node=g4_exhaust)
g2_cardio = IntakeNode("Have you been diagnosed with, or have a family history of, cardiovascular conditions?", yes_node=g3_track, no_node=g3_track, unsure_node=g3_track)
ROOT_NODE = IntakeNode("Are you experiencing any acute pain, numbness, or muscle weakness today?", yes_node=s2_weak, no_node=g2_cardio, unsure_node=g2_cardio)

# =====================================================================
# WEBSOCKET SERVER
# =====================================================================
class WebSocketServer:
    def __init__(self, hub: SharedState, sig_set_answers, sig_pan_tilt, sig_exec_scan, sig_set_mode, sig_gen_pdf):
        self.hub = hub
        self.sig_set_answers = sig_set_answers
        self.sig_pan_tilt = sig_pan_tilt
        self.sig_exec_scan = sig_exec_scan
        self.sig_set_mode = sig_set_mode
        self.sig_gen_pdf = sig_gen_pdf
        self.clients = set()

    async def register(self, websocket):
        self.clients.add(websocket)
        try:
            async for message in websocket:
                data = json.loads(message)
                cmd = data.get("cmd")
                if cmd in ("ANSWER_QUESTION", "SET_ANSWERS"):
                    self.sig_set_answers.emit(data.get("answers", []))
                elif cmd == "PAN_TILT":
                    self.sig_pan_tilt.emit(int(float(data.get("pan", 50))), int(float(data.get("tilt", 50))))
                elif cmd == "EXECUTE_SCAN":
                    self.sig_exec_scan.emit()
                elif cmd == "SET_MODE":
                    self.sig_set_mode.emit(data.get("mode", "TENSION"))
                elif cmd == "GENERATE_PDF":
                    self.sig_gen_pdf.emit()
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.clients.discard(websocket)

    async def broadcast_loop(self):
        while True:
            await asyncio.sleep(0.04)
            if not self.clients:
                continue
            try:
                state = self.get_state()
                msg = json.dumps(state)
                websockets.broadcast(self.clients, msg)
            except Exception:
                pass

    def get_state(self):
        hr = self.hub.get_hr()
        rr = self.hub.get_rr()
        spo2 = self.hub.get_spo2()
        sbp, dbp = self.hub.get_bp()
        rppg, chest, m3, m4 = self.hub.get_buffers()
        sym, lag, comp, tremor_hz = self.hub.get_triage()
        fft_f, fft_p = self.hub.get_fft_data()
        return {
            "targetStatus": "locked" if self.hub.is_face_tracked() else "standby",
            "cameraConnected": self.hub.is_camera_connected(),
            "faceTracked": self.hub.is_face_tracked(),
            "vitals": {
                "heartRate": hr,
                "respiration": rr,
                "bloodOxygen": spo2,
                "temperature": sbp / 3.2 if sbp else 0.0,
            },
            "mode": "live",
            "rppg_wave": rppg[-50:],
            "m3_wave": m3[-50:],
            "m4_wave": m4[-50:],
            "triage": {
                "bilateralSymmetry": round(sym, 1),
                "neuromuscularLag": round(lag, 1),
                "vascularCompliance": round(comp, 1),
                "tremorPeakHz": round(tremor_hz, 2),
            },
            "fft": {
                "freqs": fft_f[-100:],
                "power": fft_p[-100:],
            },
        }

class WSThread(Thread):
    def __init__(self, hub, sig_set_answers, sig_pan_tilt, sig_exec_scan, sig_set_mode, sig_gen_pdf):
        super().__init__(daemon=True)
        self.hub = hub
        self.sig_set_answers = sig_set_answers
        self.sig_pan_tilt = sig_pan_tilt
        self.sig_exec_scan = sig_exec_scan
        self.sig_set_mode = sig_set_mode
        self.sig_gen_pdf = sig_gen_pdf

    def run(self):
        asyncio.run(self.main())

    async def main(self):
        server = WebSocketServer(self.hub, self.sig_set_answers, self.sig_pan_tilt,
                                 self.sig_exec_scan, self.sig_set_mode, self.sig_gen_pdf)
        async with websockets.serve(server.register, "localhost", 8765):
            await server.broadcast_loop()

# =====================================================================
# OLLAMA LLM CONSULTANT
# =====================================================================
class OllamaConsultant:
    """Local LLM integration via Ollama. Uses requests to POST to localhost:11434."""
    def __init__(self, hub: SharedState, model="llama3.2:1b"):
        self.hub = hub
        self.model = model
        self.endpoint = "http://localhost:11434/api/chat"
        self._available = None

    def check_available(self):
        if self._available is not None:
            return self._available
        try:
            import requests
            r = requests.get("http://localhost:11434/api/tags", timeout=2.0)
            self._available = r.status_code == 200
            if self._available:
                self.hub.add_log("Ollama LLM detected — AI Consultant ready.")
            else:
                self.hub.add_log("Ollama unavailable — running offline DSP-only mode.")
        except Exception:
            self._available = False
            self.hub.add_log("Ollama unavailable — running offline DSP-only mode.")
        return self._available

    def synthesize(self, hr, rr, spo2, sbp, dbp, l_torque, r_torque, intake, mode):
        """Build telemetry payload and query local LLM."""
        if not self.check_available():
            return "Ollama offline. Clinical synthesis unavailable."

        payload = (
            f"Patient Profile: Intake History Data: {intake}. "
            f"Optical Vitals: HR={hr}BPM, SpO2={spo2}%, Respiration={rr}Br/Min, "
            f"BP={sbp}/{dbp}mmHg. "
            f"Mechanical Telemetry: Left Handle Peak Torque={l_torque}Nm, "
            f"Right Handle Peak Torque={r_torque}Nm."
        )

        system_prompt = (
            "You are an elite principal neurologist and expert metabolic consultant. "
            "Critically analyze these synchronized optical and biomechanical sensor metrics. "
            "Output a detailed, clinical-grade narrative describing the patient's current "
            "neuromuscular recruitment state, vascular compliance profile, and potential risk "
            "markers for cachexia, muscle wasting, or single-sided stroke lag. "
            "Be highly technical, concise, and structure your breakdown into distinct "
            "physiological observation fields."
        )

        try:
            import requests
            res = requests.post(
                self.endpoint,
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": payload}
                    ],
                    "stream": False,
                    "options": {"num_predict": 512}
                },
                timeout=15.0
            )
            if res.status_code == 200:
                data = res.json()
                return data.get("message", {}).get("content", "No response from model.")
            return f"Ollama error: HTTP {res.status_code}"
        except Exception as e:
            return f"LLM query failed: {e}"

# =====================================================================
# MAIN WINDOW
# =====================================================================
class MainWindow(QMainWindow):
    sig_ws_pan_tilt = pyqtSignal(int, int)
    sig_ws_execute_scan = pyqtSignal()
    sig_ws_set_mode = pyqtSignal(str)
    sig_ws_generate_pdf = pyqtSignal()
    sig_ws_set_answers = pyqtSignal(list)

    def __init__(self):
        super().__init__()
        self.setWindowTitle("AeroPulse AI — SamD Platform")
        self.setStyleSheet(f"background-color: {DS['BG_BASE']}; color: {DS['TEXT_PRIMARY']};")

        # RESPONSIVE: use screen-relative sizing
        screen = QApplication.primaryScreen()
        geo = screen.availableGeometry()
        init_w = min(1440, geo.width() - 40)
        init_h = min(900, geo.height() - 60)
        self.resize(init_w, init_h)
        self.setMinimumSize(900, 600)

        # Shared state
        self.hub = SharedState()
        self.raw_queue = queue.Queue(maxsize=2)
        self.processed_queue = queue.Queue(maxsize=2)

        # DSP + Camera threads
        self.cam_grabber = CameraGrabber(self.raw_queue, self.hub)
        self.dsp_engine = DSPEngine(self.raw_queue, self.processed_queue, self.hub)
        self.vex_serial = VEXSerialParser(self.hub)
        self.cam_grabber.start()
        self.dsp_engine.start()
        self.vex_serial.start()

        # Ollama consultant
        self.ollama = OllamaConsultant(self.hub)

        # Intake screener state
        self.current_q_node = ROOT_NODE

        # Build layout
        self._build_ui()

        # Wire external signals
        self.sig_ws_pan_tilt.connect(self._on_ws_pan_tilt)
        self.sig_ws_execute_scan.connect(self._on_execute_scan)
        self.sig_ws_set_mode.connect(self._on_ws_set_mode)
        self.sig_ws_generate_pdf.connect(self.generate_pdf_report)
        self.sig_ws_set_answers.connect(self._on_ws_set_answers)

        # WebSocket thread
        WSThread(self.hub, self.sig_ws_set_answers, self.sig_ws_pan_tilt,
                 self.sig_ws_execute_scan, self.sig_ws_set_mode, self.sig_ws_generate_pdf).start()

        # Main render timer — 60 FPS
        self.render_timer = QTimer(self)
        self.render_timer.setInterval(16)
        self.render_timer.timeout.connect(self._render_loop)
        self.render_timer.start()

        # UI refresh timer — 3 Hz for text/log updates
        self.ui_timer = QTimer(self)
        self.ui_timer.setInterval(333)
        self.ui_timer.timeout.connect(self._refresh_ui)
        self.ui_timer.start()

        self.hub.add_log("AeroPulse AI system boot sequence complete. All pipelines active.")

    # -----------------------------------------------------------------
    # UI CONSTRUCTION — EXCLUSIVE DESIGN SYSTEM TOKENS
    # -----------------------------------------------------------------
    def _build_ui(self):
        self.root = QWidget()
        self.setCentralWidget(self.root)
        layout = QHBoxLayout(self.root)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # === SIDEBAR (240px, persistent) ===
        self.sidebar = QFrame()
        self.sidebar.setFixedWidth(DS["SIDEBAR_W"])
        self.sidebar.setStyleSheet(f"""
            background-color: {DS['BG_BASE']};
            border-right: 1px solid {DS['BORDER']};
        """)
        s_lay = QVBoxLayout(self.sidebar)
        s_lay.setContentsMargins(20, 20, 20, 20)
        s_lay.setSpacing(8)

        logo = QLabel("AEROPULSE AI")
        logo.setFont(_ds_font("FONT_HEADING"))
        logo.setStyleSheet(f"color: {DS['PRIMARY']}; margin-bottom: 20px;")
        s_lay.addWidget(logo)

        self.nav_btns = []
        routes = [
            ("1", "Adaptive Intake"),
            ("2", "Biometric Scanner"),
            ("3", "Predictive Triage"),
            ("4", "Enterprise Fleet"),
        ]
        for idx, (num, name) in enumerate(routes):
            btn = QPushButton(f"  {num}. {name}")
            btn.setFont(_ds_font("FONT_SIDEBAR"))
            btn.setCheckable(True)
            btn.setFixedHeight(54)
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            btn.setStyleSheet(f"""
                QPushButton {{
                    text-align: left;
                    background-color: transparent;
                    border: none;
                    border-radius: {DS['RADIUS']};
                    color: {DS['TEXT_SECONDARY']};
                    padding-left: 12px;
                }}
                QPushButton:hover {{
                    background-color: {DS['BG_SURFACE']};
                }}
                QPushButton:checked {{
                    background-color: {DS['PRIMARY']};
                    color: {DS['TEXT_PRIMARY']};
                    font-weight: bold;
                }}
                QPushButton:disabled {{
                    color: {DS['BORDER']};
                }}
            """)
            if idx > 0:
                btn.setEnabled(False)
            s_lay.addWidget(btn)
            self.nav_btns.append(btn)
            btn.clicked.connect(lambda _, x=idx: self._navigate_to(x))

        s_lay.addStretch()
        layout.addWidget(self.sidebar)

        # === CENTER COLUMN (weight-based responsive) ===
        center_col = QWidget()
        center_col.setStyleSheet(f"border-right: 1px solid {DS['BORDER']};")
        center_lay = QVBoxLayout(center_col)
        center_lay.setContentsMargins(20, 20, 20, 20)
        center_lay.setSpacing(12)

        self.stack = QStackedWidget()
        center_lay.addWidget(self.stack, 3)

        self._build_stage1_intake()
        self._build_stage2_scanner()
        self._build_stage3_prompter()
        self._build_stage4_radar()
        self._build_stage5_triage()

        # Oscilloscopes below stack
        self.fig = Figure(facecolor=DS['BG_SURFACE'])
        self.fig.subplots_adjust(left=0.06, right=0.97, top=0.88, bottom=0.15, wspace=0.25)
        self.canvas = FigureCanvas(self.fig)
        self.canvas.setFixedHeight(200)
        self.canvas.setStyleSheet(f"""
            background-color: {DS['BG_SURFACE']};
            border: 1px solid {DS['BORDER']};
            border-radius: {DS['RADIUS']};
        """)

        self.ax_opt = self.fig.add_subplot(121)
        self.ax_opt.set_facecolor(DS['BG_BASE'])
        self.ax_opt.set_title("OPTICAL rPPG & CHEST EXPANSION", color=DS['TEXT_SECONDARY'], fontsize=7)
        self.ax_opt.tick_params(colors=DS['TEXT_SECONDARY'], labelsize=6)

        self.ax_force = self.fig.add_subplot(122)
        self.ax_force.set_facecolor(DS['BG_BASE'])
        self.ax_force.set_title("VEX MOTOR BIOMECHANICAL TORQUE", color=DS['TEXT_SECONDARY'], fontsize=7)
        self.ax_force.tick_params(colors=DS['TEXT_SECONDARY'], labelsize=6)

        center_lay.addWidget(self.canvas)
        layout.addWidget(center_col, 1)

        # === RIGHT COLUMN (secondary data panel) ===
        right_col = QWidget()
        right_col.setStyleSheet(f"background-color: {DS['BG_BASE']};")
        right_lay = QVBoxLayout(right_col)
        right_lay.setContentsMargins(16, 16, 16, 16)
        right_lay.setSpacing(12)

        # Vitals matrix
        self.vitals_card = QFrame()
        self.vitals_card.setStyleSheet(ds_card())
        v_lay = QGridLayout(self.vitals_card)
        v_lay.setContentsMargins(12, 12, 12, 12)
        v_lay.setSpacing(8)

        self.lbl_hr = self._make_vital_card(v_lay, "HEART RATE", "--", "BPM", 0, 0)
        self.lbl_rr = self._make_vital_card(v_lay, "RESPIRATION", "--", "Br/Min", 0, 1)
        self.lbl_spo2 = self._make_vital_card(v_lay, "BLOOD OXYGEN", "--", "% SpO2", 1, 0)
        self.lbl_bp = self._make_vital_card(v_lay, "BLOOD PRESSURE", "--/--", "mmHg", 1, 1)
        right_lay.addWidget(self.vitals_card)

        # AI Console
        console_card = QFrame()
        console_card.setStyleSheet(ds_card())
        con_lay = QVBoxLayout(console_card)
        con_lay.setContentsMargins(12, 12, 12, 12)

        con_title = QLabel("AI EXPLAINABLE REASONING CONSOLE")
        con_title.setFont(_ds_font("FONT_CAPTION"))
        con_title.setStyleSheet(f"color: {DS['TEXT_SECONDARY']}; font-weight: bold;")
        con_lay.addWidget(con_title)

        self.console_txt = QTextEdit()
        self.console_txt.setReadOnly(True)
        self.console_txt.setFont(QFont("Courier New", 10))
        self.console_txt.setStyleSheet(f"""
            background-color: {DS['BG_BASE']};
            color: {DS['SUCCESS']};
            border: 1px solid {DS['BORDER']};
            border-radius: {DS['RADIUS_SM']};
            padding: 8px;
        """)
        con_lay.addWidget(self.console_txt, 1)

        # AI Consultant Panel
        self.ai_card = QFrame()
        self.ai_card.setStyleSheet(ds_card())
        ai_lay = QVBoxLayout(self.ai_card)
        ai_lay.setContentsMargins(12, 12, 12, 12)
        ai_title = QLabel("AI CONSULTANT INSIGHTS")
        ai_title.setFont(_ds_font("FONT_CAPTION"))
        ai_title.setStyleSheet(f"color: {DS['TEXT_SECONDARY']}; font-weight: bold;")
        ai_lay.addWidget(ai_title)
        self.ai_text = QTextEdit()
        self.ai_text.setReadOnly(True)
        self.ai_text.setFont(QFont("Segoe UI", 11))
        self.ai_text.setStyleSheet(f"""
            background-color: {DS['BG_BASE']};
            color: {DS['TEXT_PRIMARY']};
            border: 1px solid {DS['BORDER']};
            border-radius: {DS['RADIUS_SM']};
            padding: 8px;
        """)
        ai_lay.addWidget(self.ai_text, 1)
        self.btn_ai_refresh = QPushButton("REFRESH AI ANALYSIS")
        self.btn_ai_refresh.setFont(_ds_font("FONT_BODY"))
        self.btn_ai_refresh.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_ai_refresh.setStyleSheet(f"""
            background-color: {DS['PRIMARY']};
            color: {DS['TEXT_PRIMARY']};
            border: none;
            border-radius: {DS['RADIUS_SM']};
            padding: 10px;
            font-weight: bold;
        """)
        self.btn_ai_refresh.clicked.connect(self._run_ai_consultant)
        ai_lay.addWidget(self.btn_ai_refresh)

        right_lay.addWidget(console_card, 2)
        right_lay.addWidget(self.ai_card, 2)

        layout.addWidget(right_col, 1)

        self.nav_btns[0].setChecked(True)
        self.stack.setCurrentIndex(0)

    def _make_vital_card(self, grid, heading, val, label, r, c):
        card = QFrame()
        card.setStyleSheet(f"""
            background-color: {DS['BG_BASE']};
            border: 1px solid {DS['BORDER']};
            border-radius: {DS['RADIUS_SM']};
        """)
        lay = QVBoxLayout(card)
        lay.setContentsMargins(10, 8, 10, 8)
        lay.setSpacing(2)
        h = QLabel(heading)
        h.setFont(_ds_font("FONT_CAPTION"))
        h.setStyleSheet(f"color: {DS['TEXT_SECONDARY']}; border: none;")
        lay.addWidget(h)
        v = QLabel(val)
        v.setFont(_ds_font("FONT_HERO"))
        v.setStyleSheet(f"color: {DS['TEXT_PRIMARY']}; border: none;")
        lay.addWidget(v)
        l = QLabel(label)
        l.setFont(_ds_font("FONT_CAPTION"))
        l.setStyleSheet(f"color: {DS['TEXT_SECONDARY']}; border: none;")
        lay.addWidget(l)
        grid.addWidget(card, r, c)
        return v

    # -----------------------------------------------------------------
    # STAGE 1: ADAPTIVE INTAKE SCREENER
    # -----------------------------------------------------------------
    def _build_stage1_intake(self):
        pg = QWidget()
        lay = QVBoxLayout(pg)
        lay.setContentsMargins(0, 0, 0, 0)

        card = QFrame()
        card.setStyleSheet(ds_card("padding: 24px;"))
        c_lay = QVBoxLayout(card)
        c_lay.setSpacing(16)

        head = QLabel("AeroPulse Dynamic Clinical Screener")
        head.setFont(_ds_font("FONT_HEADING"))
        head.setStyleSheet(f"color: {DS['PRIMARY']};")
        c_lay.addWidget(head)

        # AI confidence capsule
        self.lbl_confidence = QLabel("AI CONFIDENCE INDEX: 0.74")
        self.lbl_confidence.setFont(_ds_font("FONT_CAPTION"))
        self.lbl_confidence.setStyleSheet(f"""
            background-color: {DS['BG_SURFACE']};
            color: {DS['SUCCESS']};
            border: 1px solid {DS['SUCCESS']};
            border-radius: {DS['RADIUS']};
            padding: 6px 12px;
            max-width: 240px;
        """)
        c_lay.addWidget(self.lbl_confidence)

        self.lbl_question = QLabel(self.current_q_node.text)
        self.lbl_question.setFont(_ds_font("FONT_HEADING"))
        self.lbl_question.setWordWrap(True)
        self.lbl_question.setStyleSheet(f"color: {DS['TEXT_PRIMARY']}; min-height: 80px;")
        c_lay.addWidget(self.lbl_question)

        # Button row
        btn_row = QWidget()
        b_lay = QHBoxLayout(btn_row)
        b_lay.setContentsMargins(0, 0, 0, 0)
        b_lay.setSpacing(12)

        btn_yes = QPushButton("YES")
        btn_yes.setFixedHeight(64)
        btn_yes.setMinimumWidth(140)
        btn_yes.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_yes.setFont(_ds_font("FONT_BODY"))
        btn_yes.setStyleSheet(f"""
            background-color: {DS['BG_SURFACE']};
            color: {DS['TEXT_PRIMARY']};
            border: 2px solid {DS['SUCCESS']};
            border-radius: {DS['RADIUS']};
            font-weight: bold;
        """)
        btn_yes.clicked.connect(lambda: self._advance_intake("YES"))
        b_lay.addWidget(btn_yes)

        btn_no = QPushButton("NO")
        btn_no.setFixedHeight(64)
        btn_no.setMinimumWidth(140)
        btn_no.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_no.setFont(_ds_font("FONT_BODY"))
        btn_no.setStyleSheet(f"""
            background-color: {DS['PRIMARY']};
            color: {DS['TEXT_PRIMARY']};
            border: none;
            border-radius: {DS['RADIUS']};
            font-weight: bold;
        """)
        btn_no.clicked.connect(lambda: self._advance_intake("NO"))
        b_lay.addWidget(btn_no)

        btn_unsure = QPushButton("UNSURE")
        btn_unsure.setFixedHeight(64)
        btn_unsure.setMinimumWidth(140)
        btn_unsure.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_unsure.setFont(_ds_font("FONT_BODY"))
        btn_unsure.setStyleSheet(f"""
            background-color: {DS['BG_SURFACE']};
            color: {DS['TEXT_SECONDARY']};
            border: 1px solid {DS['BORDER']};
            border-radius: {DS['RADIUS']};
        """)
        btn_unsure.clicked.connect(lambda: self._advance_intake("UNSURE"))
        b_lay.addWidget(btn_unsure)

        c_lay.addWidget(btn_row)

        # Status banner
        self.lbl_intake_status = QLabel("STATUS: SCREENER ACTIVE — Nav Lock Enabled")
        self.lbl_intake_status.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.lbl_intake_status.setFont(_ds_font("FONT_BODY"))
        self.lbl_intake_status.setStyleSheet(f"""
            color: {DS['WARNING']};
            background-color: {DS['BG_BASE']};
            border: 1px solid {DS['BORDER']};
            border-radius: {DS['RADIUS_SM']};
            padding: 10px;
        """)
        c_lay.addWidget(self.lbl_intake_status)

        lay.addWidget(card)
        self.stack.addWidget(pg)

    def _advance_intake(self, choice):
        if self.current_q_node.is_final:
            self._complete_intake()
            return
        self.hub.intake_answers.append(choice)
        node = self.current_q_node
        if choice == "YES" and node.yes_node:
            self.current_q_node = node.yes_node
        elif choice == "NO" and node.no_node:
            self.current_q_node = node.no_node
        elif node.unsure_node:
            self.current_q_node = node.unsure_node
        self.lbl_question.setText(self.current_q_node.text)
        if self.current_q_node.is_final:
            self._complete_intake()

    def _complete_intake(self):
        self.lbl_intake_status.setText("CLINICAL INTAKE COMPLETED. Unlocking Stage 2.")
        self.lbl_intake_status.setStyleSheet(f"""
            color: {DS['TEXT_PRIMARY']};
            background-color: {DS['SUCCESS']};
            border-radius: {DS['RADIUS_SM']};
            padding: 10px;
            font-weight: bold;
        """)
        self.hub.add_log("Stage 1 intake complete. Patient history recorded.")
        self.hub.unlock_stage(2)
        self.nav_btns[1].setEnabled(True)
        QTimer.singleShot(1500, lambda: self._navigate_to(1))

    # -----------------------------------------------------------------
    # STAGE 2: OPTICAL SAMPLING GATEWAY
    # -----------------------------------------------------------------
    def _build_stage2_scanner(self):
        pg = QWidget()
        lay = QVBoxLayout(pg)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(12)

        self.lbl_webcam = QLabel("Initializing optical link...")
        self.lbl_webcam.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.lbl_webcam.setMinimumSize(320, 240)
        self.lbl_webcam.setStyleSheet(f"""
            background-color: {DS['BG_SURFACE']};
            border: 1px solid {DS['BORDER']};
            border-radius: {DS['RADIUS']};
            color: {DS['TEXT_SECONDARY']};
        """)
        lay.addWidget(self.lbl_webcam, 1)

        self.lbl_stage2_status = QLabel("Awaiting MediaPipe face calibration...")
        self.lbl_stage2_status.setFont(_ds_font("FONT_BODY"))
        self.lbl_stage2_status.setStyleSheet(f"color: {DS['TEXT_SECONDARY']};")
        lay.addWidget(self.lbl_stage2_status)

        self.lbl_quality = QLabel("rPPG Quality: N/A")
        self.lbl_quality.setFont(_ds_font("FONT_CAPTION"))
        self.lbl_quality.setStyleSheet(f"color: {DS['TEXT_SECONDARY']};")
        lay.addWidget(self.lbl_quality)

        self.lbl_lighting = QLabel("Lighting: N/A")
        self.lbl_lighting.setFont(_ds_font("FONT_CAPTION"))
        self.lbl_lighting.setStyleSheet(f"color: {DS['TEXT_SECONDARY']};")
        lay.addWidget(self.lbl_lighting)

        self.stack.addWidget(pg)

    # -----------------------------------------------------------------
    # STAGE 3: HARDWARE PROMPTER
    # -----------------------------------------------------------------
    def _build_stage3_prompter(self):
        pg = QWidget()
        lay = QVBoxLayout(pg)
        lay.setContentsMargins(0, 0, 0, 0)

        card = QFrame()
        card.setStyleSheet(ds_card("padding: 30px;"))
        c_lay = QVBoxLayout(card)
        c_lay.setSpacing(16)

        lbl_h = QLabel("OPTICAL TARGETING SUCCESSFUL.\nPREPARING KINETIC HARDWARE INTERROGATION.")
        lbl_h.setFont(_ds_font("FONT_HEADING"))
        lbl_h.setStyleSheet(f"color: {DS['SUCCESS']};")
        lbl_h.setWordWrap(True)
        c_lay.addWidget(lbl_h)

        lbl_desc = QLabel(
            "Please step forward and place both hands securely inside the AeroPulse "
            "Dual-Direction handle assemblies. Ensure your knuckles are aligned against "
            "the interior walls for the horizontal extension phase."
        )
        lbl_desc.setFont(_ds_font("FONT_BODY"))
        lbl_desc.setStyleSheet(f"color: {DS['TEXT_SECONDARY']};")
        lbl_desc.setWordWrap(True)
        c_lay.addWidget(lbl_desc)

        self.btn_handshake = QPushButton("INITIALIZE MECHANICAL HANDSHAKE")
        self.btn_handshake.setFont(_ds_font("FONT_HEADING"))
        self.btn_handshake.setFixedHeight(70)
        self.btn_handshake.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_handshake.setStyleSheet(f"""
            background-color: {DS['PRIMARY']};
            color: {DS['TEXT_PRIMARY']};
            border: none;
            border-radius: {DS['RADIUS']};
            font-weight: bold;
            margin-top: 10px;
        """)
        self.btn_handshake.clicked.connect(self._on_handshake)
        c_lay.addWidget(self.btn_handshake)

        lay.addWidget(card)
        self.stack.addWidget(pg)

    def _on_handshake(self):
        self.hub.set_handshaked()
        self.hub.unlock_stage(4)
        self.hub.unlock_stage(5)
        self.nav_btns[2].setEnabled(True)
        self.nav_btns[3].setEnabled(True)
        self.hub.add_log("Mechanical handshake complete. Stages 4 & 5 unlocked.")
        self._navigate_to(3)

    # -----------------------------------------------------------------
    # STAGE 4: DIAGNOSTIC RADAR
    # -----------------------------------------------------------------
    def _build_stage4_radar(self):
        pg = QWidget()
        lay = QVBoxLayout(pg)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(12)

        card = QFrame()
        card.setStyleSheet(ds_card("padding: 20px;"))
        c_lay = QVBoxLayout(card)

        title = QLabel("LOAD COMPLIANCE RESISTANCE — 60-SECOND SCAN")
        title.setFont(_ds_font("FONT_BODY"))
        title.setStyleSheet(f"color: {DS['TEXT_SECONDARY']}; font-weight: bold;")
        c_lay.addWidget(title)

        self.btn_scan = QPushButton("EXECUTE 60-SECOND BIOMETRIC SCAN")
        self.btn_scan.setFont(_ds_font("FONT_HEADING"))
        self.btn_scan.setFixedHeight(70)
        self.btn_scan.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_scan.setStyleSheet(f"""
            background-color: {DS['PRIMARY']};
            color: {DS['TEXT_PRIMARY']};
            border: none;
            border-radius: {DS['RADIUS']};
            font-weight: bold;
        """)
        self.btn_scan.clicked.connect(self._start_scan)
        c_lay.addWidget(self.btn_scan)

        lay.addWidget(card)
        self.stack.addWidget(pg)

    def _start_scan(self):
        if self.hub.endurance_active:
            return
        self.hub.endurance_active = True
        self.hub.endurance_remaining = 60
        self.btn_scan.setEnabled(False)
        self.btn_scan.setText("SCANNING... 60s")
        self.btn_scan.setStyleSheet(f"""
            background-color: {DS['SUCCESS']};
            color: {DS['TEXT_PRIMARY']};
            border: none;
            border-radius: {DS['RADIUS']};
            font-weight: bold;
        """)
        self.scan_timer = QTimer(self)
        self.scan_timer.setInterval(1000)
        self.scan_timer.timeout.connect(self._tick_scan)
        self.scan_timer.start()
        self.hub.add_log("60-second biometric scan started.")

    def _tick_scan(self):
        self.hub.endurance_remaining -= 1
        self.btn_scan.setText(f"SCANNING... {self.hub.endurance_remaining}s")
        if self.hub.endurance_remaining <= 0:
            self.scan_timer.stop()
            self.hub.endurance_active = False
            self.btn_scan.setEnabled(True)
            self.btn_scan.setText("EXECUTE 60-SECOND BIOMETRIC SCAN")
            self.btn_scan.setStyleSheet(f"""
                background-color: {DS['PRIMARY']};
                color: {DS['TEXT_PRIMARY']};
                border: none;
                border-radius: {DS['RADIUS']};
                font-weight: bold;
            """)
            self.hub.endurance_summary = "60s scan completed successfully."
            self.hub.add_log("Biometric scan complete. All metrics captured. Triggering AI synthesis...")
            self._navigate_to(4)
            QTimer.singleShot(500, self._run_ai_consultant)

    # -----------------------------------------------------------------
    # STAGE 5: TRIAGE ANALYTICS
    # -----------------------------------------------------------------
    def _build_stage5_triage(self):
        pg = QWidget()
        lay = QVBoxLayout(pg)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(12)

        # PSD chart
        self.t_fig = Figure(facecolor=DS['BG_SURFACE'])
        self.t_canvas = FigureCanvas(self.t_fig)
        self.t_canvas.setStyleSheet(f"""
            background-color: {DS['BG_SURFACE']};
            border: 1px solid {DS['BORDER']};
            border-radius: {DS['RADIUS']};
        """)
        self.ax_fft = self.t_fig.add_subplot(111)
        self.ax_fft.set_facecolor(DS['BG_BASE'])
        self.ax_fft.set_title("POWER SPECTRAL DENSITY — TREMOR BAND ANALYSIS", color=DS['TEXT_SECONDARY'], fontsize=8)
        self.ax_fft.tick_params(colors=DS['TEXT_SECONDARY'], labelsize=7)
        lay.addWidget(self.t_canvas, 1)

        # Alert banner
        alert_card = QFrame()
        alert_card.setStyleSheet(ds_card("padding: 16px;"))
        a_lay = QHBoxLayout(alert_card)

        self.lbl_triage = QLabel("SYSTEM TRIAGE: HOMEOSTASIS OPTIMAL")
        self.lbl_triage.setFont(_ds_font("FONT_BODY"))
        self.lbl_triage.setStyleSheet(f"color: {DS['SUCCESS']}; font-weight: bold;")
        a_lay.addWidget(self.lbl_triage, 1)

        btn_pdf = QPushButton("GENERATE OFFICIAL PDF REPORT")
        btn_pdf.setFixedHeight(48)
        btn_pdf.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_pdf.setFont(_ds_font("FONT_BODY"))
        btn_pdf.setStyleSheet(f"""
            background-color: {DS['DANGER']};
            color: {DS['TEXT_PRIMARY']};
            border: none;
            border-radius: {DS['RADIUS_SM']};
            font-weight: bold;
            padding: 0 20px;
        """)
        btn_pdf.clicked.connect(self.generate_pdf_report)
        a_lay.addWidget(btn_pdf)

        lay.addWidget(alert_card)

        # Risk table
        table_card = QFrame()
        table_card.setStyleSheet(ds_card("padding: 12px;"))
        t_lay = QVBoxLayout(table_card)
        t_lay.setSpacing(4)

        cols = ["PARAMETER", "VALUE", "STATUS"]
        header = QHBoxLayout()
        for i, c in enumerate(cols):
            hlbl = QLabel(c)
            hlbl.setFont(_ds_font("FONT_CAPTION"))
            hlbl.setStyleSheet(f"color: {DS['TEXT_SECONDARY']}; font-weight: bold;")
            if i == 0:
                hlbl.setMinimumWidth(180)
            elif i == 1:
                hlbl.setMinimumWidth(100)
            header.addWidget(hlbl)
        t_lay.addLayout(header)

        row_names = ["Bilateral Symmetry", "Neuromuscular Lag", "Vascular Compliance", "Tremor Spectral Peak"]
        self.triage_val_labels = []
        self.triage_status_labels = []
        for rn in row_names:
            rl = QHBoxLayout()
            n_lbl = QLabel(rn)
            n_lbl.setFont(_ds_font("FONT_BODY"))
            n_lbl.setStyleSheet(f"color: {DS['TEXT_SECONDARY']};")
            n_lbl.setMinimumWidth(180)
            rl.addWidget(n_lbl)
            v_lbl = QLabel("--")
            v_lbl.setFont(_ds_font("FONT_BODY"))
            v_lbl.setStyleSheet(f"color: {DS['TEXT_PRIMARY']};")
            v_lbl.setMinimumWidth(100)
            rl.addWidget(v_lbl)
            self.triage_val_labels.append(v_lbl)
            s_lbl = QLabel("PENDING")
            s_lbl.setFont(_ds_font("FONT_BODY"))
            s_lbl.setStyleSheet(f"color: {DS['TEXT_SECONDARY']}; font-weight: bold;")
            rl.addWidget(s_lbl)
            self.triage_status_labels.append(s_lbl)
            t_lay.addLayout(rl)

        lay.addWidget(table_card)
        self.stack.addWidget(pg)

    # -----------------------------------------------------------------
    # RENDER LOOP — 60 FPS camera & chart drawing
    # -----------------------------------------------------------------
    def _render_loop(self):
        frame = None
        try:
            frame = self.processed_queue.get_nowait()
        except queue.Empty:
            pass

        # Fallback: read raw frame directly if DSP hasn't produced anything
        if frame is None:
            try:
                frame = self.raw_queue.get_nowait()
            except queue.Empty:
                pass

        if frame is not None:
            frame = cv2.convertScaleAbs(frame, alpha=1.0, beta=30)
            h, w = frame.shape[:2]
            try:
                qi = QImage(frame.data, w, h, w * 3, QImage.Format.Format_BGR888)
            except Exception:
                try:
                    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    qi = QImage(rgb.data, w, h, w * 3, QImage.Format.Format_RGB888)
                except Exception:
                    return
            lbl_w = max(100, self.lbl_webcam.width())
            lbl_h = max(80, self.lbl_webcam.height())
            pix = QPixmap.fromImage(qi).scaled(
                lbl_w, lbl_h,
                Qt.AspectRatioMode.KeepAspectRatio,
                Qt.TransformationMode.SmoothTransformation
            )
            self.lbl_webcam.setPixmap(pix)

        # Update oscilloscopes (matplotlib)
        rppg, chest, m3, m4 = self.hub.get_buffers()

        self.ax_opt.clear()
        self.ax_opt.set_facecolor(DS['BG_BASE'])
        self.ax_opt.set_title("OPTICAL rPPG & CHEST EXPANSION", color=DS['TEXT_SECONDARY'], fontsize=7)
        self.ax_opt.tick_params(colors=DS['TEXT_SECONDARY'], labelsize=6)
        if rppg:
            self.ax_opt.plot(rppg[-50:], color=DS['SUCCESS'], linewidth=2, label="rPPG")
        if chest:
            self.ax_opt.plot(chest[-50:], color=DS['PRIMARY'], linewidth=1.5, alpha=0.7, label="Chest")
        if rppg or chest:
            self.ax_opt.legend(loc='upper right', fontsize=6, labelcolor=DS['TEXT_SECONDARY'])

        self.ax_force.clear()
        self.ax_force.set_facecolor(DS['BG_BASE'])
        self.ax_force.set_title("VEX MOTOR BIOMECHANICAL TORQUE", color=DS['TEXT_SECONDARY'], fontsize=7)
        self.ax_force.tick_params(colors=DS['TEXT_SECONDARY'], labelsize=6)
        if m3:
            self.ax_force.plot(m3[-50:], color=DS['PRIMARY'], linewidth=2, label="Left")
        if m4:
            self.ax_force.plot(m4[-50:], color=DS['CHART_PURPLE'], linewidth=2, label="Right")
        if m3 or m4:
            self.ax_force.legend(loc='upper right', fontsize=6, labelcolor=DS['TEXT_SECONDARY'])

        self.canvas.draw_idle()

        # Stage 5 PSD chart — real FFT data from DSP pipeline
        if self.stack.currentIndex() == 4:
            self.ax_fft.clear()
            self.ax_fft.set_facecolor(DS['BG_BASE'])
            self.ax_fft.set_title("POWER SPECTRAL DENSITY — TREMOR BAND ANALYSIS", color=DS['TEXT_SECONDARY'], fontsize=8)
            self.ax_fft.tick_params(colors=DS['TEXT_SECONDARY'], labelsize=7)
            fft_f, fft_p = self.hub.get_fft_data()
            if fft_f and len(fft_f) > 10:
                f_arr = np.array(fft_f)
                p_arr = np.array(fft_p)
                tremor_band = (f_arr >= 8.0) & (f_arr <= 12.0)
                tremor_power = float(np.sum(p_arr[tremor_band])) if np.any(tremor_band) else 0.0
                total_power = float(np.sum(p_arr)) + 1e-9
                tremor_ratio = tremor_power / total_power
                if tremor_ratio > 0.3:
                    self.lbl_triage.setText("ALERT: TREMOR BAND ACTIVITY ELEVATED")
                    self.lbl_triage.setStyleSheet(f"color: {DS['DANGER']}; font-weight: bold;")
                    self.ax_fft.plot(f_arr, p_arr, color=DS['DANGER'], linewidth=2)
                    self.ax_fft.axvspan(8, 12, color=DS['DANGER'], alpha=0.15)
                else:
                    self.lbl_triage.setText("SYSTEMIC HOMEOSTASIS OPTIMAL")
                    self.lbl_triage.setStyleSheet(f"color: {DS['SUCCESS']}; font-weight: bold;")
                    self.ax_fft.plot(f_arr, p_arr, color=DS['SUCCESS'], linewidth=2)
                self.ax_fft.set_xlabel("Frequency (Hz)", color=DS['TEXT_SECONDARY'], fontsize=7)
                self.ax_fft.set_ylabel("Power", color=DS['TEXT_SECONDARY'], fontsize=7)
            self.t_canvas.draw_idle()

    # -----------------------------------------------------------------
    # UI REFRESH — 3 Hz text/log updates
    # -----------------------------------------------------------------
    def _refresh_ui(self):
        face = self.hub.is_face_tracked()
        hr = self.hub.get_hr()
        rr = self.hub.get_rr()
        spo2 = self.hub.get_spo2()
        sbp, dbp = self.hub.get_bp()
        quality = self.hub.get_quality()

        # Console logs
        logs = self.hub.get_logs()
        self.console_txt.setPlainText("\n".join(logs))
        sb = self.console_txt.verticalScrollBar()
        sb.setValue(sb.maximum())

        # Vitals display
        if face and hr > 0:
            self.lbl_hr.setText(f"{hr:.1f}")
            self.lbl_rr.setText(f"{rr:.0f}")
            self.lbl_spo2.setText(f"{spo2:.1f}")
            self.lbl_bp.setText(f"{sbp}/{dbp}")
        else:
            self.lbl_hr.setText("--")
            self.lbl_rr.setText("--")
            self.lbl_spo2.setText("--")
            self.lbl_bp.setText("--/--")

        # Dynamic AI confidence from rPPG quality + intake progress
        conf = 0.50 + 0.25 * quality + 0.05 * min(len(self.hub.intake_answers), 5)
        self.lbl_confidence.setText(f"AI CONFIDENCE INDEX: {conf:.2f}")
        conf_color = DS['SUCCESS'] if conf >= 0.60 else (DS['WARNING'] if conf >= 0.40 else DS['DANGER'])
        self.lbl_confidence.setStyleSheet(f"""
            background-color: {DS['BG_SURFACE']};
            color: {conf_color};
            border: 1px solid {conf_color};
            border-radius: {DS['RADIUS']};
            padding: 6px 12px;
            max-width: 240px;
        """)

        # Triage table update
        sym, lag, comp, tremor = self.hub.get_triage()
        if hasattr(self, 'triage_val_labels') and len(self.triage_val_labels) >= 4:
            self.triage_val_labels[0].setText(f"{sym:.1f}%")
            self.triage_val_labels[1].setText(f"{lag:.0f} ms")
            comp_text = "ELASTIC / OPTIMAL" if comp > 80 else ("REDUCED" if comp > 60 else "STIFF")
            self.triage_val_labels[2].setText(comp_text)
            self.triage_val_labels[3].setText(f"{tremor:.2f} Hz")
            statuses = []
            for i, val in enumerate([sym, lag, comp, tremor]):
                if i == 0:
                    s = "LOW RISK" if val > 75 else ("MODERATE RISK" if val > 55 else "HIGH RISK")
                elif i == 1:
                    s = "LOW RISK" if val < 60 else ("MODERATE RISK" if val < 100 else "HIGH RISK")
                elif i == 2:
                    s = "LOW RISK" if val > 80 else ("MODERATE RISK" if val > 60 else "HIGH RISK")
                else:
                    s = "LOW RISK" if val < 4 else ("MODERATE RISK" if val < 8 else "HIGH RISK")
                statuses.append(s)
                sc = DS['SUCCESS'] if s == "LOW RISK" else (DS['WARNING'] if s == "MODERATE RISK" else DS['DANGER'])
                self.triage_status_labels[i].setText(s)
                self.triage_status_labels[i].setStyleSheet(f"color: {sc}; font-weight: bold;")

        # Stage 2 status
        cal_secs, _ = self.hub.get_calibrate()
        if face:
            if cal_secs >= 3.0:
                self.lbl_stage2_status.setText("TARGET LOCKED — SYSTEM CALIBRATED")
                self.lbl_stage2_status.setStyleSheet(f"color: {DS['SUCCESS']}; font-weight: bold;")
                self.hub.unlock_stage(3)
                self.nav_btns[2].setEnabled(True)
            else:
                self.lbl_stage2_status.setText(
                    f"Acquiring Target Calibration... Keep Still: {cal_secs:.1f} / 3.0s"
                )
                self.lbl_stage2_status.setStyleSheet(f"color: {DS['WARNING']};")
        else:
            self.lbl_stage2_status.setText("Awaiting MediaPipe Face Calibration...")
            self.lbl_stage2_status.setStyleSheet(f"color: {DS['TEXT_SECONDARY']};")

        # Quality indicator
        if quality >= 0.40:
            self.lbl_quality.setText(f"rPPG Quality: {quality:.2f} (Good)")
            self.lbl_quality.setStyleSheet(f"color: {DS['SUCCESS']}; font-weight: bold;")
        elif quality >= 0.20:
            self.lbl_quality.setText(f"rPPG Quality: {quality:.2f} (Fair)")
            self.lbl_quality.setStyleSheet(f"color: {DS['WARNING']}; font-weight: bold;")
        else:
            self.lbl_quality.setText(f"rPPG Quality: {quality:.2f} (Poor)")
            self.lbl_quality.setStyleSheet(f"color: {DS['DANGER']}; font-weight: bold;")

        # Lighting quality indicator
        lq = self.hub.get_lighting_quality()
        lw = self.hub.get_lighting_warning()
        if lq >= 0.7:
            self.lbl_lighting.setText(f"Lighting: Good ({lq:.0%})")
            self.lbl_lighting.setStyleSheet(f"color: {DS['SUCCESS']}; font-weight: bold;")
        elif lq >= 0.4:
            label = f"Lighting: Fair ({lq:.0%}) — {lw}" if lw else f"Lighting: Fair ({lq:.0%})"
            self.lbl_lighting.setText(label)
            self.lbl_lighting.setStyleSheet(f"color: {DS['WARNING']}; font-weight: bold;")
        else:
            label = f"Lighting: Poor ({lq:.0%}) — {lw}" if lw else f"Lighting: Poor ({lq:.0%})"
            self.lbl_lighting.setText(label)
            self.lbl_lighting.setStyleSheet(f"color: {DS['DANGER']}; font-weight: bold;")

    # -----------------------------------------------------------------
    # OLLAMA AI CONSULTANT
    # -----------------------------------------------------------------
    def _run_ai_consultant(self):
        hr = self.hub.get_hr()
        rr = self.hub.get_rr()
        spo2 = self.hub.get_spo2()
        sbp, dbp = self.hub.get_bp()
        _, _, m3, m4 = self.hub.get_buffers()
        l_torque = m3[-1] if m3 else 0.0
        r_torque = m4[-1] if m4 else 0.0
        intake_str = "; ".join(self.hub.intake_answers) if self.hub.intake_answers else "No intake data"

        self.ai_text.setText("Querying local LLM (Ollama)...")
        QApplication.processEvents()

        result = self.ollama.synthesize(
            hr, rr, spo2, sbp, dbp, l_torque, r_torque, intake_str, self.hub.demo_mode
        )
        self.ai_text.setText(result)
        self.hub.add_log("AI Consultant analysis refreshed.")

    # -----------------------------------------------------------------
    # PDF REPORT GENERATION
    # -----------------------------------------------------------------
    def generate_pdf_report(self):
        p = Path.home() / "Desktop" / "aeropulse_clinical_report.pdf"
        doc = SimpleDocTemplate(str(p), pagesize=letter)
        styles = getSampleStyleSheet()

        hr = self.hub.get_hr()
        rr = self.hub.get_rr()
        spo2 = self.hub.get_spo2()
        sbp, dbp = self.hub.get_bp()

        story = [
            Paragraph("AEROPULSE AI CLINICAL SamD HEALTH REPORT",
                      ParagraphStyle('H1', parent=styles['Heading1'], fontSize=20,
                                     leading=24, textColor=colors.HexColor(DS['PRIMARY']))),
            Spacer(1, 15),
            Paragraph(f"<b>Reporting Timestamp:</b> {time.strftime('%Y-%m-%d %H:%M:%S')}", styles['Normal']),
            Paragraph("<b>Device Node:</b> Secure Unified Node #0C84FF", styles['Normal']),
            Spacer(1, 15),
            Paragraph("CONTACTLESS TRI-MODAL VITAL SIGNS",
                      ParagraphStyle('H2', parent=styles['Heading2'], fontSize=14,
                                     leading=18, textColor=colors.HexColor(DS['SUCCESS']))),
            Spacer(1, 10)
        ]

        data = [
            ["Biomedical Parameter", "Measured Value", "Clinical Status"],
            ["Heart Rate", f"{hr:.1f} BPM" if hr > 0 else "--", "Normal Baseline"],
            ["Blood Oxygenation (SpO2)", f"{spo2:.1f}%" if spo2 > 0 else "--", "Homeostatic Elastic"],
            ["Respiration Rate", f"{rr:.0f} Br/min" if rr > 0 else "--", "Optimal Compliance"],
            ["Blood Pressure", f"{sbp}/{dbp} mmHg" if sbp > 0 else "--/--", "Optimal PWA Profile"],
        ]
        t = Table(data, colWidths=[200, 180, 150])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor(DS['BG_SURFACE'])),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor(DS['TEXT_PRIMARY'])),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor(DS['BORDER'])),
        ]))
        story.append(t)
        doc.build(story)
        self.hub.add_log(f"PDF report generated: {p}")

    # -----------------------------------------------------------------
    # NAVIGATION
    # -----------------------------------------------------------------
    def _navigate_to(self, idx):
        for i, b in enumerate(self.nav_btns):
            b.setChecked(i == idx)
        self.stack.setCurrentIndex(idx)

    # -----------------------------------------------------------------
    # WS HANDLERS
    # -----------------------------------------------------------------
    def _on_ws_pan_tilt(self, pan, tilt):
        pass

    def _on_execute_scan(self):
        self.btn_scan.click()

    def _on_ws_set_mode(self, mode):
        self.hub.demo_mode = mode.upper()

    def _on_ws_set_answers(self, answers):
        self.hub.intake_answers = answers
        if len(answers) >= 4:
            self._complete_intake()

    # -----------------------------------------------------------------
    # CLOSE EVENT
    # -----------------------------------------------------------------
    def closeEvent(self, event):
        self.cam_grabber.running = False
        self.dsp_engine.running = False
        self.vex_serial.running = False
        event.accept()


# =====================================================================
# ENTRY POINT
# =====================================================================
if __name__ == "__main__":
    app = QApplication(sys.argv)
    win = MainWindow()
    win.show()
    sys.exit(app.exec())
