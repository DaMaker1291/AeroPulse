"""
AeroPulse VEX Brain Bridge — USB Serial Data Stream
====================================================
Deploy this to the VEX V5 Brain via VEXcode Python.
Streams motor data over USB at 50 Hz. Slower than C++ but easier to edit.

Requires:
  - VEXcode Python (V5)
  - Two motors on PORT3 (left grip) and PORT4 (right grip)

Protocol (line-based, 115200 baud):
  TX: KEY:VALUE,KEY:VALUE,...\n
  RX: START|STOP|CALIBRATE\n
"""

from vex import *
import sys

# ── Brain ─────────────────────────────────────────────────────────────────
brain = Brain()

# ── Motor Configuration ───────────────────────────────────────────────────
grip_left = Motor(Ports.PORT3, GearSetting.RATIO_18_1, False)
grip_right = Motor(Ports.PORT4, GearSetting.RATIO_18_1, True)

# ── State ─────────────────────────────────────────────────────────────────
streaming = True
cmd_buffer = ""

# ── Display ───────────────────────────────────────────────────────────────
brain.screen.clear_screen()
brain.screen.set_font(FontType.MONO12)
brain.screen.print("AeroPulse VEX Bridge")
brain.screen.next_row()
brain.screen.print("115200 BAUD | 50 Hz")
brain.screen.next_row()
brain.screen.print("STREAMING")


def process_command(cmd: str):
    """Handle commands received from the web app over USB serial."""
    global streaming
    cmd = cmd.strip().upper()
    if cmd == "START":
        streaming = True
        brain.screen.clear_row(2)
        brain.screen.print("STREAMING")
    elif cmd == "STOP":
        streaming = False
        brain.screen.clear_row(2)
        brain.screen.print("PAUSED")
    elif cmd == "CALIBRATE":
        grip_left.reset_position()
        grip_right.reset_position()
        brain.screen.clear_row(2)
        brain.screen.print("CALIBRATED")
    elif cmd == "RESET":
        streaming = True
        grip_left.reset_position()
        grip_right.reset_position()
        brain.screen.clear_row(2)
        brain.screen.print("RESET")


# ── Main Loop (50 Hz) ────────────────────────────────────────────────────
while True:
    # ── Check for incoming commands ─────────────────────────────────────────
    # VEXcode Python reads all available serial bytes
    if brain.serial.available() > 0:
        chunk = brain.serial.read_string()
        if chunk:
            cmd_buffer += chunk
            while "\n" in cmd_buffer:
                line, cmd_buffer = cmd_buffer.split("\n", 1)
                process_command(line.strip())

    if streaming:
        # ── Read sensors ───────────────────────────────────────────────────
        lt = grip_left.torque(TorqueUnits.NM)
        lp = grip_left.position(RotationUnits.DEG)
        lc = grip_left.current(CurrentUnits.AMP)
        rt = grip_right.torque(TorqueUnits.NM)
        rp = grip_right.position(RotationUnits.DEG)
        rc = grip_right.current(CurrentUnits.AMP)

        # ── Stream line over USB serial ────────────────────────────────────
        # print() in VEXcode Python sends data over USB at 115200 baud.
        # The web app's Web Serial API reads and parses these lines.
        print(
            f"M3_TORQUE:{lt:.3f},"
            f"M3_POS:{lp:.1f},"
            f"M3_CURRENT:{lc:.3f},"
            f"M4_TORQUE:{rt:.3f},"
            f"M4_POS:{rp:.1f},"
            f"M4_CURRENT:{rc:.3f}"
        )

        # ── Screen debug update (every 20 frames) ─────────────────────────
        # Increment a frame counter using a persistent trick
        try:
            frame_count += 1
        except NameError:
            frame_count = 0
        if frame_count % 20 == 0:
            brain.screen.clear_row(3)
            brain.screen.print(f"L:{lt:.2f}Nm R:{rt:.2f}Nm")

    # 20 ms → ~50 Hz
    wait(20, MSEC)
