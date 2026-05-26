"""
AeroPulse VEX Brain Bridge — USB Serial Data Stream
====================================================
Deploy via VEXcode Python:
  1. File -> New Python Project
  2. Open Devices -> add Motor on PORT3 (18:1, no reverse)
  3. Open Devices -> add Motor on PORT4 (18:1, reverse)
  4. Replace code with this file
  5. Connect Brain via USB -> Download -> Run

Wiring:
  Motor PORT3 = Left grip  (reverse = false)
  Motor PORT4 = Right grip (reverse = true)

Protocol (USB serial, KEY:VALUE pairs):
  Stream: M3_TORQUE:0.12,M3_POS:45.0,M3_CURRENT:0.05,...
"""

from vex import *

grip_left = Motor(Ports.PORT3, GearSetting.RATIO_18_1, False)
grip_right = Motor(Ports.PORT4, GearSetting.RATIO_18_1, True)

brain.screen.clear_screen()
brain.screen.set_font(FontType.MONO12)
brain.screen.print("AeroPulse VEX Bridge")
brain.screen.next_row()
brain.screen.print("Streaming 50 Hz")
brain.screen.next_row()
brain.screen.print("ACTIVE")

frame_count = 0

while True:
    lt = grip_left.torque(TorqueUnits.NM)
    lp = grip_left.position(RotationUnits.DEG)
    lc = grip_left.current(CurrentUnits.AMP)
    rt = grip_right.torque(TorqueUnits.NM)
    rp = grip_right.position(RotationUnits.DEG)
    rc = grip_right.current(CurrentUnits.AMP)

    print(
        f"M3_TORQUE:{lt:.3f},"
        f"M3_POS:{lp:.1f},"
        f"M3_CURRENT:{lc:.3f},"
        f"M4_TORQUE:{rt:.3f},"
        f"M4_POS:{rp:.1f},"
        f"M4_CURRENT:{rc:.3f}"
    )

    frame_count += 1
    if frame_count % 20 == 0:
        brain.screen.clear_row(2)
        brain.screen.print(f"L:{lt:.2f}Nm R:{rt:.2f}Nm")

    wait(20, MSEC)
