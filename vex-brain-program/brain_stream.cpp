/*==============================================================================
  AeroPulse VEX Brain Bridge — USB Serial Data Stream
  ==============================================================================
  Deploy this to the VEX V5 Brain via VEXcode C++.
  The brain streams motor torque, position, and current data over USB at 50 Hz.
  
  Wiring:
    - Motor on PORT3 → "Left Hand" grip (reverse = false)
    - Motor on PORT4 → "Right Hand" grip (reverse = true)
    - Optional: Potentiometer on 3-Wire PORT A (thumb position)
  
  Protocol (line-based, 115200 baud):
    TX: KEY:VALUE,KEY:VALUE,...\n
    RX: START|STOP|CALIBRATE\n
  
  Commands accepted over serial:
    START     - Begin streaming data (default)
    STOP      - Pause streaming
    CALIBRATE - Tare position sensors to zero
    RESET     - Reset streaming state
  =============================================================================*/

#include "vex.h"

using namespace vex;

// ── Brain ─────────────────────────────────────────────────────────────────
brain Brain;

// ── Motor Configuration ───────────────────────────────────────────────────
// Adjust port numbers and gear ratios to match your physical build.
motor gripLeft  = motor(PORT3, ratio18_1, false);  // left hand
motor gripRight = motor(PORT4, ratio18_1, true);   // right hand

// ── State ─────────────────────────────────────────────────────────────────
bool streaming = true;

// ── Command Buffer (non-blocking serial read) ────────────────────────────
const int CMD_BUF_SIZE = 32;
char cmdBuffer[CMD_BUF_SIZE];
int cmdIdx = 0;

void processCommand() {
  if (strcmp(cmdBuffer, "START") == 0) {
    streaming = true;
    Brain.Screen.clearLine(2);
    Brain.Screen.print("STREAMING");
  } else if (strcmp(cmdBuffer, "STOP") == 0) {
    streaming = false;
    Brain.Screen.clearLine(2);
    Brain.Screen.print("PAUSED");
  } else if (strcmp(cmdBuffer, "CALIBRATE") == 0) {
    gripLeft.resetPosition();
    gripRight.resetPosition();
    Brain.Screen.clearLine(2);
    Brain.Screen.print("CALIBRATED");
  } else if (strcmp(cmdBuffer, "RESET") == 0) {
    streaming = true;
    gripLeft.resetPosition();
    gripRight.resetPosition();
    Brain.Screen.clearLine(2);
    Brain.Screen.print("RESET");
  }
}

void checkSerialCommand() {
  // Read one character at a time (non-blocking).
  // VEX serial RX is buffered; this polls at each loop iteration.
  while (Brain.Serial.available() > 0) {
    char c = Brain.Serial.readChar();
    if (c == '\n' || c == '\r') {
      if (cmdIdx > 0) {
        cmdBuffer[cmdIdx] = '\0';
        processCommand();
        cmdIdx = 0;
      }
    } else if (cmdIdx < CMD_BUF_SIZE - 1) {
      cmdBuffer[cmdIdx++] = c;
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────
int main() {
  // ── Initialization ───────────────────────────────────────────────────────
  gripLeft.setStopping(hold);
  gripRight.setStopping(hold);

  // ── Screen ───────────────────────────────────────────────────────────────
  Brain.Screen.clearScreen();
  Brain.Screen.setFont(font::Courier);
  Brain.Screen.print("AeroPulse VEX Bridge");
  Brain.Screen.newLine();
  Brain.Screen.print("115200 BAUD | 50 Hz");
  Brain.Screen.newLine();
  Brain.Screen.print("STREAMING");

  // ── Main loop (50 Hz = 20 ms) ──────────────────────────────────────────
  while (true) {
    // Check for incoming commands from the web app
    checkSerialCommand();

    if (streaming) {
      // ── Read sensors ─────────────────────────────────────────────────────
      double tLeft  = gripLeft.torque(Nm);
      double pLeft  = gripLeft.position(degrees);
      double cLeft  = gripLeft.current(amp);
      double tRight = gripRight.torque(Nm);
      double pRight = gripRight.position(degrees);
      double cRight = gripRight.current(amp);

      // ── Stream over USB serial ──────────────────────────────────────────
      // Format: KEY:VALUE pairs, comma separated, one line per frame.
      // The web app parses this format.
      printf("M3_TORQUE:%.3f,M3_POS:%.1f,M3_CURRENT:%.3f,"
             "M4_TORQUE:%.3f,M4_POS:%.1f,M4_CURRENT:%.3f\n",
             tLeft, pLeft, cLeft,
             tRight, pRight, cRight);

      // ── Update screen (debug, doesn't affect serial) ────────────────────
      // Only update every 20 iterations to avoid screen flicker
      static int frameCount = 0;
      if (++frameCount % 20 == 0) {
        Brain.Screen.clearLine(3);
        Brain.Screen.print("L:%.2fNm R:%.2fNm", tLeft, tRight);
      }
    }

    // Wait 20 ms → ~50 Hz update rate (matches VEX task timing)
    vex::task::sleep(20);
  }
}
