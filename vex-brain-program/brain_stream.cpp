/*==============================================================================
  AeroPulse VEX Brain Bridge — USB Serial Data Stream
  ==============================================================================
  For PROS (not VEXcode).

  Deploy:
    1. `pros build`
    2. `pros upload` — printf() streams over USB CDC serial @ 115200 baud
    3. Select "Driver Control" on the VEX Brain screen to run opcontrol()

  Wiring:
    PORT3 = Left grip  (reverse = false)
    PORT4 = Right grip (reverse = true)

  Protocol (KEY:VALUE pairs, one line per frame at 50 Hz):
    M3_TORQUE:0.12,M3_POS:45.0,M3_CURRENT:0.05,M4_TORQUE:...
  =============================================================================*/

#include "main.h"

pros::Motor gripLeft(3);
pros::Motor gripRight(4);

// ── Position-hold PID ──────────────────────────────────────────────────────
const double KP = 1.2;
const double HOLD_VOLTAGE_MAX = 90.0;
double holdPosLeft = 0.0;
double holdPosRight = 0.0;
bool holdEnabled = true;

void initialize() {
  gripLeft.set_gearing(pros::E_MOTOR_GEARSET_18);
  gripRight.set_gearing(pros::E_MOTOR_GEARSET_18);
  gripRight.set_reversed(true);

  pros::lcd::initialize();
  pros::lcd::set_text(0, "AeroPulse VEX Bridge");
  pros::lcd::set_text(1, "Streaming 50 Hz");

  // Allow motors to power up, then latch current position as hold target
  pros::delay(500);
  holdPosLeft = gripLeft.get_position();
  holdPosRight = gripRight.get_position();
  holdEnabled = true;
  pros::lcd::set_text(2, "HOLD ACTIVE");
}

void disabled() {
  // Brake motors when competition switch goes to disabled
  gripLeft.brake();
  gripRight.brake();
  holdEnabled = false;
}

void opcontrol() {
  int frame = 0;

  while (true) {
    // ── Position-hold control loop ──────────────────────────────────────
    // Creates mechanical resistance: if you try to turn the motor by hand,
    // the PID loop fights back, holding the motor at its current angle.
    if (holdEnabled) {
      double pL = gripLeft.get_position();
      double pR = gripRight.get_position();
      double errL = holdPosLeft - pL;
      double errR = holdPosRight - pR;

      double cmdL = errL * KP;
      double cmdR = errR * KP;
      cmdL = std::max(-HOLD_VOLTAGE_MAX, std::min(HOLD_VOLTAGE_MAX, cmdL));
      cmdR = std::max(-HOLD_VOLTAGE_MAX, std::min(HOLD_VOLTAGE_MAX, cmdR));

      gripLeft.move(cmdL);
      gripRight.move(cmdR);
    } else {
      gripLeft.brake();
      gripRight.brake();
    }

    // ── Read sensors ────────────────────────────────────────────────────
    double tL = gripLeft.get_torque();
    double pL = gripLeft.get_position();
    double cL = gripLeft.get_current_draw() / 1000.0;  // mA → A
    double tR = gripRight.get_torque();
    double pR = gripRight.get_position();
    double cR = gripRight.get_current_draw() / 1000.0;

    // ── Stream over USB serial ──────────────────────────────────────────
    // Browser connects to this COM port via Web Serial API and parses
    // the KEY:VALUE pairs.
    printf("M3_TORQUE:%.3f,M3_POS:%.1f,M3_CURRENT:%.3f,"
           "M4_TORQUE:%.3f,M4_POS:%.1f,M4_CURRENT:%.3f\n",
           tL, pL, cL, tR, pR, cR);

    // ── LCD update ──────────────────────────────────────────────────────
    if (++frame % 20 == 0) {
      char buf[32];
      snprintf(buf, sizeof(buf), "L:%.2fNm R:%.2fNm", tL, tR);
      pros::lcd::set_text(2, buf);
    }

    pros::delay(20);  // 50 Hz
  }
}
