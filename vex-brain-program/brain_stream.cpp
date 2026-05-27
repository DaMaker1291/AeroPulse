/*==============================================================================
  AeroPulse VEX Brain Bridge — USB Serial Data Stream
  ==============================================================================
  For PROS (not VEXcode).

  Deploy:
    1. `pros build`
    2. `pros upload`
    3. Control loop starts IMMEDIATELY. No "Driver Control" tap needed.

  Wiring:
    PORT3 = Left grip  (reverse = false)
    PORT4 = Right grip (reverse = true)

  Output (50 Hz, KEY:VALUE pairs):
    M3_TORQUE:0.12,M3_POS:45.0,M3_CURRENT:0.05,M3_FORCE:1.23,...
    FORCE is estimated from torque × gear_ratio / radius (Nm → N)

  Commands (terminate with \n):
    STOP       — release motors (freewheel)
    START      — re-enable position hold at current angle
    CALIBRATE  — re-zero hold position at current angle
    SETPOS:D   — set hold target to D degrees (e.g. SETPOS:90)
    DIAGNOSE   — run full compression/pull cycle:
                 0°→45° measure → 0°→-45° measure → return 0°
                 Reports COMPRESSION:torque,Nm and TENSION:torque,Nm
  =============================================================================*/

#include "main.h"

pros::Motor gripLeft(3);
pros::Motor gripRight(4);

// ── PID constants ──────────────────────────────────────────────────────────
const double KP = 1.5;           // Position-hold gain
const double MOVE_VOLTAGE = 80;  // Voltage for commanded movement
const double HOLD_VOLTAGE_MAX = 95.0;

volatile double holdPosLeft = 0.0;
volatile double holdPosRight = 0.0;
volatile bool holdEnabled = true;

// ── Command parsing ─────────────────────────────────────────────────────────
// Reads from USB serial via serctl() so the browser can send commands
// over the same cable that carries printf() data.

#define CMD_BUF_SIZE 80
char cmdLineBuf[CMD_BUF_SIZE];
int cmdIdx = 0;

// Parse and execute a command received over USB serial
void executeCommand(const char* cmd, int len) {
  if (len == 0) return;

  if (strncmp(cmd, "STOP", 4) == 0) {
    holdEnabled = false;
    gripLeft.brake();
    gripRight.brake();
    printf("ACK:STOP\n"); fflush(stdout);
  }
  else if (strncmp(cmd, "START", 5) == 0) {
    holdEnabled = true;
    holdPosLeft = gripLeft.get_position();
    holdPosRight = gripRight.get_position();
    printf("ACK:START\n"); fflush(stdout);
  }
  else if (strncmp(cmd, "CALIBRATE", 9) == 0) {
    holdPosLeft = gripLeft.get_position();
    holdPosRight = gripRight.get_position();
    holdEnabled = true;
    printf("ACK:CALIBRATE\n"); fflush(stdout);
  }
  else if (strncmp(cmd, "SETPOS:", 7) == 0) {
    double pos = atof(cmd + 7);
    holdPosLeft = pos;
    holdPosRight = pos;
    holdEnabled = true;
    printf("ACK:SETPOS:%.1f\n", pos); fflush(stdout);
  }
  else if (strncmp(cmd, "DIAGNOSE", 8) == 0) {
    printf("ACK:DIAGNOSE:START\n"); fflush(stdout);

    // Phase 1: Move to +45° (pull/tension direction)
    gripLeft.move_velocity(50);   // Start moving
    gripRight.move_velocity(50);
    holdPosLeft = 45.0;
    holdPosRight = 45.0;
    holdEnabled = true;
    pros::delay(800);  // Let it reach position

    // Read torque at +45°
    double torquePull = gripLeft.get_torque();
    double torquePullR = gripRight.get_torque();
    printf("TENSION:%.3f,%.3f,Nm\n", torquePull, torquePullR); fflush(stdout);

    // Phase 2: Return to 0°
    gripLeft.move_velocity(-50);
    gripRight.move_velocity(-50);
    holdPosLeft = 0.0;
    holdPosRight = 0.0;
    holdEnabled = true;
    pros::delay(800);

    // Phase 3: Move to -45° (compression direction)
    gripLeft.move_velocity(-50);
    gripRight.move_velocity(-50);
    holdPosLeft = -45.0;
    holdPosRight = -45.0;
    holdEnabled = true;
    pros::delay(800);

    // Read torque at -45°
    double torqueComp = gripLeft.get_torque();
    double torqueCompR = gripRight.get_torque();
    printf("COMPRESSION:%.3f,%.3f,Nm\n", torqueComp, torqueCompR); fflush(stdout);

    // Phase 4: Return to 0°
    gripLeft.move_velocity(50);
    gripRight.move_velocity(50);
    holdPosLeft = 0.0;
    holdPosRight = 0.0;
    holdEnabled = true;
    pros::delay(800);
    gripLeft.brake();
    gripRight.brake();

    // Hold at 0°
    holdPosLeft = gripLeft.get_position();
    holdPosRight = gripRight.get_position();
    holdEnabled = true;
    printf("ACK:DIAGNOSE:DONE\n"); fflush(stdout);
  }
}

// Task: reads commands from USB serial via serctl (non-blocking)
void commandReader(void* param) {
  while (true) {
    int c = serctl(1, NULL);  // SERCTL_GETCHAR = 1, non-blocking
    if (c >= 0 && c < 256) {
      char ch = (char)c;
      if (ch == '\n' || ch == '\r') {
        if (cmdIdx > 0) {
          cmdLineBuf[cmdIdx] = '\0';
          executeCommand(cmdLineBuf, cmdIdx);
          cmdIdx = 0;
        }
      } else if (cmdIdx < CMD_BUF_SIZE - 1) {
        cmdLineBuf[cmdIdx++] = ch;
      }
    }
    pros::delay(5);
  }
}

// ── Sensor-to-force estimation ─────────────────────────────────────────────
// Uses the 18:1 cartridge gear and a ~2 cm output lever arm.
// This gives a rough force estimate in Newtons.
// Actual force depends on gripper jaw geometry — calibrate with known load.
double estimateForce(double torqueNm, double gearRatio, double leverM) {
  return torqueNm * gearRatio / (leverM + 0.001);
}

const double GEAR_RATIO = 18.0;  // RATIO_18_1 cartridge
const double LEVER_ARM_M = 0.02; // ~2 cm from motor shaft to grip point

// ── Control loop task ──────────────────────────────────────────────────────
void controlLoop(void* param) {
  int frame = 0;

  // Latch initial position
  pros::delay(300);
  holdPosLeft = gripLeft.get_position();
  holdPosRight = gripRight.get_position();
  holdEnabled = true;
  pros::lcd::set_text(2, "HOLD 50 Hz");

  while (true) {
    // ── Position-hold PID ──────────────────────────────────────────────
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
    double cL = gripLeft.get_current_draw() / 1000.0;
    double fL = estimateForce(tL, GEAR_RATIO, LEVER_ARM_M);

    double tR = gripRight.get_torque();
    double pR = gripRight.get_position();
    double cR = gripRight.get_current_draw() / 1000.0;
    double fR = estimateForce(tR, GEAR_RATIO, LEVER_ARM_M);

    // ── Stream over USB (50 Hz) ────────────────────────────────────────
    printf("M3_TORQUE:%.3f,M3_POS:%.1f,M3_CURRENT:%.3f,M3_FORCE:%.2f,"
           "M4_TORQUE:%.3f,M4_POS:%.1f,M4_CURRENT:%.3f,M4_FORCE:%.2f\n",
           tL, pL, cL, fL, tR, pR, cR, fR);
    fflush(stdout);

    // ── LCD ─────────────────────────────────────────────────────────────
    if (++frame % 20 == 0) {
      char buf[32];
      snprintf(buf, sizeof(buf), "L:%.2fNm R:%.2fNm", tL, tR);
      pros::lcd::set_text(2, buf);
    }

    pros::delay(20);
  }
}

void initialize() {
  gripLeft.set_gearing(pros::E_MOTOR_GEARSET_18);
  gripRight.set_gearing(pros::E_MOTOR_GEARSET_18);
  gripRight.set_reversed(true);

  pros::lcd::initialize();
  pros::lcd::set_text(0, "AeroPulse VEX Bridge");
  pros::lcd::set_text(1, "v2 — USB commands OK");

  pros::delay(800);

  // Start command reader (reads from USB serial via serctl)
  pros::Task cmdTask(commandReader, nullptr, "CmdReader");

  // Start control loop (position hold + 50 Hz streaming)
  pros::Task loop(controlLoop, nullptr, "ControlLoop");
}

void disabled() {
  holdEnabled = false;
  gripLeft.brake();
  gripRight.brake();
}

void opcontrol() {
  while (true) pros::delay(100);
}
