# Vibe Coding 協作紀錄

## 第一次互動：確認兩顆板載 LED

### 關鍵提示詞

> 第一階段只建立 Arduino 測試程式，確認兩顆板載 LED 的腳位與 HIGH/LOW 亮滅邏輯。使用 LED_BUILTIN 與 LED_G，LED_ON 與 LED_OFF 定義成獨立常數。

### AI 產生內容

- 建立 `ameba/led_test/led_test.ino`；之後依 Arduino 主檔與資料夾必須同名的規則調整成標準草稿結構。
- 藍燈及綠燈依序亮 2 秒、熄滅 2 秒。
- 先以 `LED_ON = HIGH`、`LED_OFF = LOW` 測試，之後由實機結果確認設定正確。

### 驗證狀態

- 已完成原始碼靜態檢查、AMB82-MINI 編譯與實機上傳。
- 2026-09-30 觀察藍燈與綠燈依序亮滅正常，確認 `HIGH = 亮`、`LOW = 滅`。

## 第二次互動：規劃完整語音控制系統

### 關鍵提示詞

> 運用 Vibe Coding 實作 Ameba Mini 語音控制 LED 系統，需包含語音辨識、指令傳輸、板端回覆、非控制指令與通訊中斷處理。

### AI 協作決策

- 採用 Chrome／Edge 的 Web Speech API 執行中文語音辨識。
- 採用 Web Serial 經 USB 傳送 `LEFT_ON`、`RIGHT_ON`。
- 開發板以 `ACK|指令|BLUE=狀態|GREEN=狀態` 回覆。
- 採完整語句白名單比對，未知語句不傳送，板端未知指令也不改變 LED。

### 待實測與修正

1. 以網頁完成語音辨識與 Web Serial 整合測試。
2. 各測試「左邊開燈」與「右邊開燈」五次並填寫測試表。
3. 記錄一次非控制語句及拔除 USB 的結果與畫面。

## 實際問題與 AI 協作修正（實測後填寫）

### 已發現並修正：Arduino 草稿資料夾名稱不符合規則

- 問題現象：以 Arduino CLI 編譯原本的 `ameba/led_test.ino` 時，工具回報缺少主檔 `ameba.ino`。
- 測試證據：Arduino 會將父資料夾 `ameba` 視為草稿名稱，因此要求主檔名稱也必須是 `ameba.ino`。
- AI 建議的修正：改成標準結構 `ameba/led_test/led_test.ino`，讓資料夾與主 `.ino` 檔同名。
- 重新測試結果：修正後 CLI 能正確辨識草稿並進入編譯流程。

### 已發現並修正：Windows 中文 locale 造成工具鏈錯誤

- 問題現象：首次編譯出現 `locale::facet::_S_create_c_locale name not valid`，建置以 exit status 3 中止。
- 測試證據：同一份程式在設定 `LC_ALL=C` 與 `LANG=C` 後重新編譯成功。
- AI 建議的修正：CLI 編譯時使用工具鏈相容的 `C` locale，不修改程式或 LED 腳位。
- 重新測試結果：`led_test` 與 `voice_led_controller` 均以 AMB82-MINI 板型成功編譯，使用 4,788,224 bytes（28%）程式儲存空間。

### 已發現並修正：開發板未進入燒錄模式

- 問題現象：首次上傳出現 `NOR flashloader loading fail`、`Uart boot fail`、`ping retry fail` 與 `upload fail`。
- 測試證據：板型 `AMB82-MINI` 與連接埠 `COM4` 已正確選擇，程式也已編譯，失敗發生在連接燒錄器階段。
- AI 建議的修正：按住 `UART_DOWNLOAD`，短按並放開 `RESET`，再放開 `UART_DOWNLOAD`，使板子進入 UART Download 模式後重新上傳。
- 重新測試結果：Arduino IDE 顯示 `upload success`；按下 RESET 後，藍燈與綠燈依序亮滅正常。

### 完整控制韌體的 Serial 實測

- Arduino IDE 上傳 `voice_led_controller.ino` 成功，RESET 後收到 `READY|AMB82_MINI|BLUE=0|GREEN=0`。
- 傳送 `RIGHT_ON` 後綠燈亮；再傳送 `LEFT_ON` 後藍燈亮，確認兩個白名單指令與 LED 切換皆正常。

### 已發現並修正：PowerShell 5.1 腳本中文字元解析錯誤

- 問題現象：執行 `web/start_web.ps1` 時出現 `The string is missing the terminator`。
- 測試證據：錯誤發生在包含 UTF-8 中文提示文字的 `Write-Host` 行，與網頁或韌體無關。
- AI 建議的修正：啟動腳本只保留 ASCII 提示文字，避免 Windows PowerShell 5.1 以系統 ANSI 編碼錯誤解析無 BOM 的 UTF-8 檔案。
- 重新測試結果：修改後伺服器成功啟動於 `http://localhost:8000`。

### 已發現並修正：快速 ACK 與逾時計時器的競態

- 問題現象：程式檢查時發現，若開發板在網頁建立 2.5 秒逾時計時器前就回覆 ACK，畫面可能先顯示成功，稍後又被錯誤改成逾時。
- 測試證據：逐步檢查 `sendCommand()` 中「寫入 Serial、收到 ACK、建立計時器」的非同步順序後發現風險。
- AI 建議的修正：在寫入 Serial 前先建立逾時計時器；收到 ACK 時由 `clearPendingCommand()` 清除計時器。
- 修改的檔案與內容：修改 `web/app.js` 的 `sendCommand()` 執行順序。
- 重新測試結果：已完成程式流程檢查；仍須接上實機驗證快速 ACK 與逾時行為。

### 實機問題（測試後填寫）

請再記錄至少一項真實硬體測試問題。建議格式：

- 問題現象：
- 測試證據：
- 向 AI 提供的資訊：
- AI 建議的修正：
- 修改的檔案與內容：
- 重新測試結果：

## 第三次互動：電腦沒有麥克風，改用 iPad

### 問題現象

- 電腦版網頁與 Web Serial 已能控制 LED，但電腦沒有可用麥克風，Chrome 顯示沒有偵測到語音。
- iPad Safari 無法直接使用電腦上的 COM4，因此不能照搬桌面版 Web Serial 流程。

### 向 AI 提供的資訊

> 我沒有麥克風，可以用 iPad。

### AI 建議與修改

- 第一版使用 iPad 螢幕鍵盤聽寫，但使用者指出文字框也能手動輸入，無法充分證明是語音控制。
- 第二版改用 Safari Web Speech API 的「開始語音辨識」按鈕，辨識欄位設為唯讀，辨識成功後自動送出。
- 新增電腦端 Python 橋接服務；iPad 經同一個 Wi-Fi 傳送文字，電腦再經 COM4 控制 AMB82-MINI。
- 新增 `tablet/` 介面，只接受完整白名單語句；非控制語句不會送到開發板。
- 仍以開發板的 `ACK|指令|BLUE=狀態|GREEN=狀態` 作為畫面 LED 狀態依據。

### 待實測

- 已透過 iPad Safari 與固定 HTTPS 網址完成「左邊開燈」及「右邊開燈」各一次實測，辨識後會自動送出，實體 LED 與板端狀態一致。
- 已說「不要開燈」，畫面顯示「非控制指令（未傳送）」且 LED 狀態保持不變。
- 仍須完成左右各剩餘四次，以及拔除 USB 的通訊中斷驗收紀錄。

### 跨實驗室展示修正

- 問題現象：區域網路網址包含實驗室分配的 IP，換教室後可能改變；新版 Safari 也會拒絕在一般 HTTP 頁面直接啟用語音辨識。
- AI 建議的修正：使用 Tailscale Serve 提供固定且私密的 HTTPS 網址，讓 iPad 與電腦在不同網路仍可互通。
- 修改內容：新增 `START_DEMO.cmd`、`STOP_DEMO.cmd` 與對應 PowerShell 腳本，一鍵啟動或停止本機橋接及私人 HTTPS 服務。
- 驗證結果：電腦與 iPad 已登入同一個 Tailscale 私人網路；固定網址 `https://leo.tailb7cb14.ts.net` 可開啟，Safari 直接語音辨識、Serial 指令與板端 ACK 實測成功。
- 一鍵啟動驗證：停止原本的開發伺服器後執行 `START_DEMO.cmd`，背景橋接重新啟動並收到 `ACK|STATUS|BLUE=0|GREEN=1`；Tailscale Serve 仍將固定 HTTPS 網址代理至本機服務。

## 第四次互動：加入可明確展示的加分功能

### 使用者回饋

> 加分的功能沒有。

### AI 協作修改

- 新增 `BLINK_3` 板端指令：藍燈與綠燈同時閃爍三次，完成後恢復原本狀態。
- 新增中文「閃爍三次」與英文 “turn on left light”、“turn on right light”、“blink three times”。
- iPad 介面新增中文／English 語言選擇與語音回覆。
- 保留完整白名單比對；其他中英文語句仍不會送到開發板。

### 驗證要求

- AMB82-MINI 韌體重新編譯成功，使用 4,788,224 bytes（28%），並上傳至 COM4 成功。
- `BLINK_3` 實機回覆 `ACK|BLINK_3|BLUE=0|GREEN=0`，確認閃爍後恢復原本狀態。
- 英文白名單已測得 `LEFT_ON` 與 `RIGHT_ON` 的板端 ACK；仍須用 iPad 麥克風確認英文辨識與語音回覆。

## 第五次互動：整理 GitHub 與跨電腦展示

### 使用者需求

> 換一台只有 VS Code 的桌機時，要能下載專案並 Demo 給老師看。

### AI 協作修改

- 檢查公開專案內容，排除 PID、執行紀錄、快取與可能的機密資料。
- 將 README 整理成作業需求對照、程式位置、展示步驟與實測狀態。
- 發現一鍵展示腳本固定使用 `COM4`，換電腦後 COM 編號可能改變。
- 修改 `start_demo.ps1` 與 `start_tablet.ps1`：自動偵測連接埠；只有存在多個候選連接埠時才要求使用者選擇。

### 驗證狀態

- 已完成 PowerShell 語法檢查與原電腦 COM4 偵測檢查。
- 實際換電腦後仍應先確認 Windows 能辨識 AMB82-MINI 的 COM 埠。
