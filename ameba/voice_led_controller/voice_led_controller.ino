// AMB82-MINI 語音控制 LED：板端 Serial 指令接收程式
// 板卡：Realtek AMB82-MINI / RTL8735B

#include <Arduino.h>
#include <string.h>

// 2026-09-30 實機確認：HIGH 亮、LOW 滅。
const uint8_t LED_ON = HIGH;
const uint8_t LED_OFF = LOW;

const unsigned long SERIAL_BAUD_RATE = 115200;
const size_t COMMAND_BUFFER_SIZE = 40;

char commandBuffer[COMMAND_BUFFER_SIZE];
size_t commandLength = 0;
bool discardUntilNewline = false;

bool blueLedOn = false;
bool greenLedOn = false;

// 將邏輯狀態實際寫入兩顆板載 LED。
void applyLedState() {
  digitalWrite(LED_BUILTIN, blueLedOn ? LED_ON : LED_OFF);
  digitalWrite(LED_G, greenLedOn ? LED_ON : LED_OFF);
}

// 加分功能：兩顆板載 LED 同時閃爍三次，完成後恢復原本狀態。
void blinkBothThreeTimes() {
  for (uint8_t count = 0; count < 3; count++) {
    digitalWrite(LED_BUILTIN, LED_ON);
    digitalWrite(LED_G, LED_ON);
    delay(250);

    digitalWrite(LED_BUILTIN, LED_OFF);
    digitalWrite(LED_G, LED_OFF);
    delay(250);
  }

  applyLedState();
}

// 回傳由開發板維護的輸出狀態，讓網頁不要自行猜測 LED 狀態。
void printState(const char *messageType, const char *command) {
  Serial.print(messageType);
  Serial.print('|');
  Serial.print(command);
  Serial.print("|BLUE=");
  Serial.print(blueLedOn ? 1 : 0);
  Serial.print("|GREEN=");
  Serial.println(greenLedOn ? 1 : 0);
}

// 僅接受白名單內的完整指令；未知指令不改變 LED 狀態。
void processCommand(const char *command) {
  if (strcmp(command, "LEFT_ON") == 0) {
    blueLedOn = true;
    greenLedOn = false;
    applyLedState();
    printState("ACK", "LEFT_ON");
    return;
  }

  if (strcmp(command, "RIGHT_ON") == 0) {
    blueLedOn = false;
    greenLedOn = true;
    applyLedState();
    printState("ACK", "RIGHT_ON");
    return;
  }

  if (strcmp(command, "BLINK_3") == 0) {
    blinkBothThreeTimes();
    printState("ACK", "BLINK_3");
    return;
  }

  if (strcmp(command, "STATUS") == 0) {
    printState("ACK", "STATUS");
    return;
  }

  printState("ERR", "UNKNOWN_COMMAND");
}

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  pinMode(LED_G, OUTPUT);

  // 開機時兩顆 LED 都先熄滅。
  blueLedOn = false;
  greenLedOn = false;
  applyLedState();

  Serial.begin(SERIAL_BAUD_RATE);
  delay(300);
  printState("READY", "AMB82_MINI");
}

void loop() {
  while (Serial.available() > 0) {
    const char received = static_cast<char>(Serial.read());

    // 以換行字元作為一筆指令的結束。
    if (received == '\n') {
      if (!discardUntilNewline && commandLength > 0) {
        commandBuffer[commandLength] = '\0';
        processCommand(commandBuffer);
      }
      commandLength = 0;
      discardUntilNewline = false;
      continue;
    }

    // 指令過長後丟棄同一行剩餘內容，避免尾端文字被當成新指令。
    if (discardUntilNewline) {
      continue;
    }

    // 忽略 Windows 換行中的 CR 字元。
    if (received == '\r') {
      continue;
    }

    if (commandLength < COMMAND_BUFFER_SIZE - 1) {
      commandBuffer[commandLength++] = received;
    } else {
      // 指令過長時清空緩衝區，且不改變 LED 狀態。
      commandLength = 0;
      discardUntilNewline = true;
      printState("ERR", "COMMAND_TOO_LONG");
    }
  }
}
