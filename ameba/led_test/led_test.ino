// AMB82-MINI 板載 LED 亮滅邏輯測試

// 2026-09-30 實機確認：HIGH 亮、LOW 滅。
const uint8_t LED_ON = HIGH;
const uint8_t LED_OFF = LOW;

void setup() {
  // 設定藍色與綠色板載 LED 為輸出模式
  pinMode(LED_BUILTIN, OUTPUT);
  pinMode(LED_G, OUTPUT);

  // 開機時先關閉兩顆 LED
  digitalWrite(LED_BUILTIN, LED_OFF);
  digitalWrite(LED_G, LED_OFF);
}

void loop() {
  // 藍色板載 LED 亮 2 秒，再熄滅 2 秒
  digitalWrite(LED_BUILTIN, LED_ON);
  delay(2000);
  digitalWrite(LED_BUILTIN, LED_OFF);
  delay(2000);

  // 綠色板載 LED 亮 2 秒，再熄滅 2 秒
  digitalWrite(LED_G, LED_ON);
  delay(2000);
  digitalWrite(LED_G, LED_OFF);
  delay(2000);
}
