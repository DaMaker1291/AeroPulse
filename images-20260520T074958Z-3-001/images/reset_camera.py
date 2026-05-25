"""Reset camera to default auto settings — undoes manual exposure/WB/gain lock.
Run this to restore normal camera behavior for ALL applications."""
import cv2
import numpy as np
import time

def reset_camera(index=0):
    print(f"Resetting camera {index} to default auto settings...")

    # Try multiple backends and reset approaches
    for backend in [cv2.CAP_DSHOW, cv2.CAP_MSMF, cv2.CAP_ANY]:
        cap = cv2.VideoCapture(index, backend)
        if cap.isOpened():
            break
    if not cap.isOpened():
        cap = cv2.VideoCapture(index)
    if not cap.isOpened():
        print(f"ERROR: Cannot open camera {index}")
        return False

    # Approach 1: Try the 0.75 auto-exposure convention (DirectShow)
    print("  Trying auto-exposure mode 0.75 (DirectShow auto convention)...")
    cap.set(cv2.CAP_PROP_AUTO_EXPOSURE, 0.75)
    cap.set(cv2.CAP_PROP_AUTO_WB, 1.0)

    for i in range(30):
        cap.read()
        time.sleep(0.03)

    ret, frame = cap.read()
    if ret:
        print(f"    Mean after approach 1: {np.mean(frame):.1f}")

    # Approach 2: Try auto-exposure = 0 (alternative convention)
    print("  Trying auto-exposure = 1.0...")
    cap.set(cv2.CAP_PROP_AUTO_EXPOSURE, 0.0)

    for i in range(30):
        cap.read()
        time.sleep(0.03)

    ret, frame = cap.read()
    if ret:
        print(f"    Mean after approach 2: {np.mean(frame):.1f}")

    # Approach 3: Try setting exposure to a moderate value then re-enabling auto
    print("  Trying exposure sweep + restore...")
    for exp in [0, 128, 256, -5, -3]:
        cap.set(cv2.CAP_PROP_EXPOSURE, exp)
        for _ in range(5):
            cap.read()
    cap.set(cv2.CAP_PROP_AUTO_EXPOSURE, 0.75)
    cap.set(cv2.CAP_PROP_GAIN, 128)

    for i in range(30):
        cap.read()
        time.sleep(0.03)

    ret, frame = cap.read()
    if ret:
        print(f"    Mean after approach 3: {np.mean(frame):.1f}")

    # One more try - set auto-wb explicitly
    cap.set(cv2.CAP_PROP_AUTO_WB, 1)

    ret, frame = cap.read()
    cap.release()
    if ret:
        print(f"  Final mean: {np.mean(frame):.1f}")
        cv2.imwrite("_camera_reset.png", frame)

    print("\nDone. If camera is still overexposed, unplug it and plug it back in.")
    print("That is the most reliable way to reset hardware settings.")

    return True

if __name__ == "__main__":
    import sys
    idx = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    reset_camera(idx)
