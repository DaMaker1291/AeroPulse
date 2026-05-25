from vex import *

brain = Brain()

grip_left = Motor(Ports.PORT3, GearSetting.RATIO_18_1, False)
grip_right = Motor(Ports.PORT4, GearSetting.RATIO_18_1, True)


def line():
    lt = grip_left.torque(TorqueUnits.NM)
    lp = grip_left.position(RotationUnits.DEG)
    rt = grip_right.torque(TorqueUnits.NM)
    rp = grip_right.position(RotationUnits.DEG)
    print(f"M3_TORQUE:{lt},M3_POS:{lp},M4_TORQUE:{rt},M4_POS:{rp}")


while True:
    line()
    wait(20, MSEC)
