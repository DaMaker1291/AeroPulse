/*==============================================================================
  AeroPulse VEX Brain Bridge — USB Serial Data Stream
  ==============================================================================
  For PROS (not VEXcode).
  
  Deploy:
    1. `pros conduct` or `pros build`
    2. Upload via USB — printf() streams over USB CDC serial at 115200

  Wiring:
    Motor PORT3 = Left grip  (reverse = false)
    Motor PORT4 = Right grip (reverse = true)

  Protocol (USB serial, KEY:VALUE pairs, one line per frame):
    M3_TORQUE:0.12,M3_POS:45.0,M3_CURRENT:50.0,M4_TORQUE:...
  =============================================================================*/

#include "main.h"

pros::Motor gripLeft(3, pros::E_MOTOR_GEARSET_18, false);
pros::Motor gripRight(4, pros::E_MOTOR_GEARSET_18, true);

void initialize() {
  pros::lcd::initialize();
  pros::lcd::set_text(0, "AeroPulse VEX Bridge");
  pros::lcd::set_text(1, "Streaming 50 Hz");
  pros::lcd::set_text(2, "ACTIVE");
}

void opcontrol() {
  int frame = 0;

  while (true) {
    double tL = gripLeft.get_torque();
    double pL = gripLeft.get_position();
    double cL = gripLeft.get_current_draw() / 1000.0; // mA → A
    double tR = gripRight.get_torque();
    double pR = gripRight.get_position();
    double cR = gripRight.get_current_draw() / 1000.0;

    printf("M3_TORQUE:%.3f,M3_POS:%.1f,M3_CURRENT:%.3f,"
           "M4_TORQUE:%.3f,M4_POS:%.1f,M4_CURRENT:%.3f\n",
           tL, pL, cL, tR, pR, cR);

    if (++frame % 20 == 0) {
      char buf[32];
      snprintf(buf, sizeof(buf), "L:%.2fNm R:%.2fNm", tL, tR);
      pros::lcd::set_text(2, buf);
    }

    pros::delay(20);
  }
}
