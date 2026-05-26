/*==============================================================================
  AeroPulse VEX Brain Bridge — USB Serial Data Stream
  ==============================================================================
  Deploy via VEXcode C++: Create new project, replace main.cpp with this file.

  Wiring:
    Motor PORT3 = Left grip (reverse = false)
    Motor PORT4 = Right grip (reverse = true)

  Protocol (line-based, 115200 baud, KEY:VALUE pairs):
    TX > M3_TORQUE:0.12,M3_POS:45.0,M3_CURRENT:0.05,M4_TORQUE:...
    RX < START | STOP | CALIBRATE | RESET
  =============================================================================*/

#include "vex.h"

using namespace vex;

brain Brain;

motor gripLeft  = motor(PORT3, ratio18_1, false);
motor gripRight = motor(PORT4, ratio18_1, true);

int main() {
  // ── Init ──────────────────────────────────────────────────────────────────
  gripLeft.setStopping(hold);
  gripRight.setStopping(hold);

  Brain.Screen.clearScreen();
  Brain.Screen.setFont(font::Courier);
  Brain.Screen.print("AeroPulse VEX Bridge");
  Brain.Screen.newLine();
  Brain.Screen.print("115200 BAUD | 50 Hz");

  bool streaming = true;
  char cmdBuf[32];
  int  cmdIdx = 0;
  int  frameCount = 0;

  Brain.Screen.newLine();
  Brain.Screen.print("STREAMING");

  while (true) {
    // ── Read serial commands (non-blocking) ────────────────────────────────
    while (Brain.Serial.available() > 0) {
      char c = Brain.Serial.readChar();
      if (c == '\n' || c == '\r') {
        if (cmdIdx > 0) {
          cmdBuf[cmdIdx] = '\0';

          if      (strcmp(cmdBuf, "START")     == 0) { streaming = true;  Brain.Screen.clearLine(2); Brain.Screen.print("STREAMING"); }
          else if (strcmp(cmdBuf, "STOP")      == 0) { streaming = false; Brain.Screen.clearLine(2); Brain.Screen.print("PAUSED");   }
          else if (strcmp(cmdBuf, "CALIBRATE") == 0) { gripLeft.resetPosition(); gripRight.resetPosition(); Brain.Screen.clearLine(2); Brain.Screen.print("CALIBRATED"); }
          else if (strcmp(cmdBuf, "RESET")     == 0) { streaming = true;  gripLeft.resetPosition(); gripRight.resetPosition(); Brain.Screen.clearLine(2); Brain.Screen.print("RESET"); }

          cmdIdx = 0;
        }
      } else if (cmdIdx < 31) {
        cmdBuf[cmdIdx++] = c;
      }
    }

    // ── Stream sensor data ─────────────────────────────────────────────────
    if (streaming) {
      double tL = gripLeft.torque(Nm);
      double pL = gripLeft.position(degrees);
      double cL = gripLeft.current(amp);
      double tR = gripRight.torque(Nm);
      double pR = gripRight.position(degrees);
      double cR = gripRight.current(amp);

      printf("M3_TORQUE:%.3f,M3_POS:%.1f,M3_CURRENT:%.3f,"
             "M4_TORQUE:%.3f,M4_POS:%.1f,M4_CURRENT:%.3f\n",
             tL, pL, cL, tR, pR, cR);

      if (++frameCount % 20 == 0) {
        Brain.Screen.clearLine(3);
        Brain.Screen.print("L:%.2fNm R:%.2fNm", tL, tR);
      }
    }

    vex::task::sleep(20);
  }
}
