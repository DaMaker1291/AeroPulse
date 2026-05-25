"""Camera diagnostic — reads default camera, NO settings locked."""
import cv2
import numpy as np
import os

cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
if not cap.isOpened():
    cap = cv2.VideoCapture(0)
if not cap.isOpened():
    print("ERROR: Cannot open camera")
    exit(1)

# Let auto-exposure settle naturally (don't change any settings)
for i in range(30):
    cap.read()

ret, frame = cap.read()
if ret and frame is not None:
    out = os.path.join(os.path.dirname(__file__) or ".", "_camera_test.png")
    cv2.imwrite(out, frame)
    print(f"Saved: {out}")
    print(f"Resolution: {frame.shape[1]}x{frame.shape[0]}")
    print(f"Mean: {np.mean(frame):.1f}  Min: {np.min(frame)}  Max: {np.max(frame)}")
    print(f"\nCamera settings are UNCHANGED — defaults used.")
else:
    print("ERROR: read() failed")

cap.release()
