/*==============================================================================
  AeroPulse VEX Brain Bridge — USB Serial Data Stream
  ==============================================================================
  Deploy via VEXcode C++:
    1. File → New C++ Project
    2. Open Devices → add Motor on PORT3 (18:1, no reverse)
    3. Open Devices → add Motor on PORT4 (18:1, reverse)
    4. Replace main.cpp with this file
    5. Connect Brain via USB → Download → Run

  Wiring:
    Motor PORT3 = Left grip  (reverse = false)
    Motor PORT4 = Right grip (reverse = true)

  Protocol (USB serial at 115200 baud, KEY:VALUE pairs):
    Stream: M3_TORQUE:0.12,M3_POS:45.0,M3_CURRENT:0.05,M4_TORQUE:...
  =============================================================================*/

#include "vex.h"

using namespace vex;

motor gripLeft  = motor(PORT3, ratio18_1, false);
motor gripRight = motor(PORT4, ratio18_1, true);

int main() {
  gripLeft.setStopping(hold);
  gripRight.setStopping(hold);

  Brain.Screen.clearScreen();
  Brain.Screen.setFont(mono20);
  Brain.Screen.print("AeroPulse VEX Bridge");
  Brain.Screen.newLine();
  Brain.Screen.print("Streaming 50 Hz");
  Brain.Screen.newLine();
  Brain.Screen.print("ACTIVE");

  int frameCount = 0;

  while (true) {
    double tL = gripLeft.torque(Nm);
    double pL = gripLeft.position(degrees);
    double cL = gripLeft.current(amp);
    double tR = gripRight.torque(Nm);
    double pR = gripRight.position(degrees);
    double cR = gripRight.current(amp);

    printf("M3_TORQUE:%.3f,M3_POS:%.1f,M3_CURRENT:%.3f,"
           "M4_TORQUE:%.3f,M4_POS:%.1f,M4_CURRENT:%.3f\n",
           tL, pL, cL, tR, pR, cR);

    frameCount++;
    if (frameCount % 20 == 0) {
      Brain.Screen.clearLine(2);
      Brain.Screen.print("L:%.2fNm R:%.2fNm", tL, tR);
    }

    vex::task::sleep(20);
  }
}
