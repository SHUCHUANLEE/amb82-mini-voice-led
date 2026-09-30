"use strict";

const SERIAL_BAUD_RATE = 115200;
const ACK_TIMEOUT_MS = 2500;

const acceptedPhrases = new Map([
  ["左邊開燈", { code: "LEFT_ON", label: "左邊開燈（藍燈）" }],
  ["左边开灯", { code: "LEFT_ON", label: "左邊開燈（藍燈）" }],
  ["開左邊燈", { code: "LEFT_ON", label: "左邊開燈（藍燈）" }],
  ["开左边灯", { code: "LEFT_ON", label: "左邊開燈（藍燈）" }],
  ["右邊開燈", { code: "RIGHT_ON", label: "右邊開燈（綠燈）" }],
  ["右边开灯", { code: "RIGHT_ON", label: "右邊開燈（綠燈）" }],
  ["開右邊燈", { code: "RIGHT_ON", label: "右邊開燈（綠燈）" }],
  ["开右边灯", { code: "RIGHT_ON", label: "右邊開燈（綠燈）" }],
  ["閃爍三次", { code: "BLINK_3", label: "兩顆 LED 閃爍三次" }],
  ["闪烁三次", { code: "BLINK_3", label: "兩顆 LED 閃爍三次" }],
  ["blinkthreetimes", { code: "BLINK_3", label: "兩顆 LED 閃爍三次" }],
]);

const elements = {
  connectButton: document.querySelector("#connectButton"),
  disconnectButton: document.querySelector("#disconnectButton"),
  listenButton: document.querySelector("#listenButton"),
  testLeftButton: document.querySelector("#testLeftButton"),
  testRightButton: document.querySelector("#testRightButton"),
  refreshStatusButton: document.querySelector("#refreshStatusButton"),
  clearLogButton: document.querySelector("#clearLogButton"),
  connectionStatus: document.querySelector("#connectionStatus"),
  transcriptResult: document.querySelector("#transcriptResult"),
  commandResult: document.querySelector("#commandResult"),
  executionResult: document.querySelector("#executionResult"),
  blueLedCard: document.querySelector("#blueLedCard"),
  greenLedCard: document.querySelector("#greenLedCard"),
  blueLedState: document.querySelector("#blueLedState"),
  greenLedState: document.querySelector("#greenLedState"),
  eventLog: document.querySelector("#eventLog"),
};

let serialPort = null;
let serialReader = null;
let serialReadTask = null;
let serialLineBuffer = "";
let keepReading = false;
let disconnectRequested = false;
let pendingCommand = null;
let pendingTimeout = null;
let isListening = false;

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = SpeechRecognition ? new SpeechRecognition() : null;

function addLog(message) {
  const item = document.createElement("li");
  item.textContent = `${new Date().toLocaleTimeString("zh-TW", { hour12: false })}　${message}`;
  elements.eventLog.prepend(item);
}

function setConnectionStatus(message, type) {
  elements.connectionStatus.textContent = message;
  elements.connectionStatus.className = `status ${type}`;
}

function isSerialConnected() {
  return Boolean(serialPort && serialPort.readable && serialPort.writable);
}

function updateControls() {
  const connected = isSerialConnected();
  const busy = Boolean(pendingCommand);

  elements.connectButton.disabled = connected;
  elements.disconnectButton.disabled = !connected;
  elements.listenButton.disabled = !connected || !recognition || busy || isListening;
  elements.testLeftButton.disabled = !connected || busy;
  elements.testRightButton.disabled = !connected || busy;
  elements.refreshStatusButton.disabled = !connected || busy;
}

function setLedCard(card, label, state) {
  card.classList.remove("on", "off", "unknown");
  card.classList.add(state);
  label.textContent = state === "on" ? "亮" : state === "off" ? "滅" : "未知";
}

function setLedStateUnknown() {
  setLedCard(elements.blueLedCard, elements.blueLedState, "unknown");
  setLedCard(elements.greenLedCard, elements.greenLedState, "unknown");
}

function updateLedState(fields) {
  const blue = fields.find((field) => field.startsWith("BLUE="));
  const green = fields.find((field) => field.startsWith("GREEN="));

  if (!blue || !green) return;
  setLedCard(elements.blueLedCard, elements.blueLedState, blue === "BLUE=1" ? "on" : "off");
  setLedCard(elements.greenLedCard, elements.greenLedState, green === "GREEN=1" ? "on" : "off");
}

function clearPendingCommand() {
  if (pendingTimeout) window.clearTimeout(pendingTimeout);
  pendingTimeout = null;
  pendingCommand = null;
  updateControls();
}

function handleSerialLine(rawLine) {
  const line = rawLine.trim();
  if (!line) return;

  addLog(`板端回覆：${line}`);
  const fields = line.split("|");
  const messageType = fields[0];
  const command = fields[1] || "";

  if (messageType === "READY") {
    updateLedState(fields);
    elements.executionResult.textContent = "開發板已就緒";
    return;
  }

  if (messageType === "ACK") {
    updateLedState(fields);
    elements.executionResult.textContent = command === "STATUS"
      ? "已取得開發板回傳狀態"
      : `執行成功：${command}`;
    clearPendingCommand();
    return;
  }

  if (messageType === "ERR") {
    updateLedState(fields);
    elements.executionResult.textContent = `開發板拒絕指令：${command}`;
    clearPendingCommand();
  }
}

async function readSerialLoop() {
  const decoder = new TextDecoder();

  try {
    while (keepReading && serialPort?.readable) {
      serialReader = serialPort.readable.getReader();
      try {
        while (keepReading) {
          const { value, done } = await serialReader.read();
          if (done) break;
          serialLineBuffer += decoder.decode(value, { stream: true });

          const lines = serialLineBuffer.split(/\r?\n/);
          serialLineBuffer = lines.pop() || "";
          lines.forEach(handleSerialLine);
        }
      } finally {
        serialReader.releaseLock();
        serialReader = null;
      }
    }
  } catch (error) {
    if (!disconnectRequested) {
      handleUnexpectedDisconnect(`讀取失敗：${error.message}`);
    }
  }
}

async function connectSerial() {
  if (!("serial" in navigator)) {
    setConnectionStatus("此瀏覽器不支援 Web Serial，請使用桌面版 Chrome 或 Edge。", "error");
    return;
  }

  try {
    serialPort = await navigator.serial.requestPort();
    await serialPort.open({ baudRate: SERIAL_BAUD_RATE });
    disconnectRequested = false;
    keepReading = true;
    serialLineBuffer = "";
    serialReadTask = readSerialLoop();

    setConnectionStatus("已連接 AMB82-MINI（115200 baud）", "success");
    elements.executionResult.textContent = "Serial 已連接，正在讀取板端狀態";
    addLog("Serial 連線成功");
    updateControls();
    await sendCommand("STATUS", "讀取板端狀態");
  } catch (error) {
    serialPort = null;
    setConnectionStatus(`連線失敗：${error.message}`, "error");
    elements.executionResult.textContent = "請確認連接埠未被其他程式占用";
    addLog(`Serial 連線失敗：${error.message}`);
    updateControls();
  }
}

async function disconnectSerial() {
  if (!serialPort) return;
  disconnectRequested = true;
  keepReading = false;
  clearPendingCommand();

  try {
    if (serialReader) await serialReader.cancel();
    if (serialReadTask) await serialReadTask;
    if (serialPort.readable || serialPort.writable) await serialPort.close();
  } catch (error) {
    addLog(`關閉 Serial 時發生錯誤：${error.message}`);
  } finally {
    serialPort = null;
    serialReadTask = null;
    setLedStateUnknown();
    setConnectionStatus("已中斷連線", "warning");
    elements.executionResult.textContent = "通訊已中斷，未再傳送控制指令";
    addLog("Serial 已中斷");
    updateControls();
  }
}

function handleUnexpectedDisconnect(message) {
  keepReading = false;
  clearPendingCommand();
  serialPort = null;
  serialReadTask = null;
  setLedStateUnknown();
  setConnectionStatus("通訊中斷，請重新連接開發板", "error");
  elements.executionResult.textContent = "通訊失敗：LED 狀態未更新";
  addLog(message);
  updateControls();
}

async function sendCommand(code, label) {
  if (!isSerialConnected()) {
    elements.executionResult.textContent = "通訊失敗：尚未連接開發板";
    setConnectionStatus("尚未連接，無法傳送指令", "error");
    addLog(`未傳送 ${code}：Serial 尚未連接`);
    return;
  }

  if (pendingCommand) {
    elements.executionResult.textContent = "上一筆指令仍在等待回覆";
    return;
  }

  pendingCommand = code;
  elements.commandResult.textContent = `${label} → ${code}`;
  elements.executionResult.textContent = "已傳送，等待開發板回覆…";
  updateControls();

  try {
    // 先建立逾時計時器，避免開發板極快回覆時 ACK 早於計時器建立。
    pendingTimeout = window.setTimeout(() => {
      elements.executionResult.textContent = "通訊失敗：開發板未在時限內回覆";
      addLog(`${code} 等待回覆逾時`);
      clearPendingCommand();
    }, ACK_TIMEOUT_MS);

    const writer = serialPort.writable.getWriter();
    try {
      await writer.write(new TextEncoder().encode(`${code}\n`));
    } finally {
      writer.releaseLock();
    }
    addLog(`送出指令：${code}`);
  } catch (error) {
    elements.executionResult.textContent = `傳送失敗：${error.message}`;
    addLog(`傳送 ${code} 失敗：${error.message}`);
    clearPendingCommand();
  }
}

function normalizeSpeech(text) {
  return text.normalize("NFKC").trim().toLocaleLowerCase().replace(/[\s，。！？、,.!?]/g, "");
}

function handleRecognizedSpeech(transcript) {
  const normalized = normalizeSpeech(transcript);
  const command = acceptedPhrases.get(normalized);
  elements.transcriptResult.textContent = transcript;

  if (!command) {
    elements.commandResult.textContent = "非控制指令";
    elements.executionResult.textContent = "未傳送，LED 狀態保持不變";
    addLog(`忽略非控制語句：${transcript}`);
    return;
  }

  sendCommand(command.code, command.label);
}

function configureSpeechRecognition() {
  if (!recognition) {
    elements.executionResult.textContent = "此瀏覽器不支援語音辨識，請使用 Chrome 或 Edge。";
    addLog("瀏覽器不支援 SpeechRecognition");
    updateControls();
    return;
  }

  recognition.lang = "zh-TW";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.addEventListener("start", () => {
    isListening = true;
    elements.listenButton.textContent = "正在聆聽…";
    elements.listenButton.classList.add("listening");
    elements.executionResult.textContent = "請說：左邊開燈，或右邊開燈";
    addLog("開始語音辨識");
    updateControls();
  });

  recognition.addEventListener("result", (event) => {
    const transcript = event.results[0][0].transcript;
    handleRecognizedSpeech(transcript);
  });

  recognition.addEventListener("error", (event) => {
    const messages = {
      "no-speech": "沒有偵測到語音，請再試一次",
      "audio-capture": "找不到可用的麥克風",
      "not-allowed": "麥克風權限被拒絕",
      "network": "語音辨識服務連線失敗",
    };
    const message = messages[event.error] || `語音辨識失敗：${event.error}`;
    elements.executionResult.textContent = message;
    addLog(message);
  });

  recognition.addEventListener("end", () => {
    isListening = false;
    elements.listenButton.textContent = "開始語音辨識";
    elements.listenButton.classList.remove("listening");
    updateControls();
  });
}

elements.connectButton.addEventListener("click", connectSerial);
elements.disconnectButton.addEventListener("click", disconnectSerial);
elements.listenButton.addEventListener("click", () => recognition?.start());
elements.testLeftButton.addEventListener("click", () => sendCommand("LEFT_ON", "左邊開燈（藍燈）"));
elements.testRightButton.addEventListener("click", () => sendCommand("RIGHT_ON", "右邊開燈（綠燈）"));
elements.refreshStatusButton.addEventListener("click", () => sendCommand("STATUS", "讀取板端狀態"));
elements.clearLogButton.addEventListener("click", () => { elements.eventLog.innerHTML = ""; });

if ("serial" in navigator) {
  navigator.serial.addEventListener("disconnect", (event) => {
    if (event.target === serialPort && !disconnectRequested) {
      handleUnexpectedDisconnect("偵測到 USB Serial 裝置已拔除");
    }
  });
} else {
  setConnectionStatus("此瀏覽器不支援 Web Serial，請使用桌面版 Chrome 或 Edge。", "error");
}

configureSpeechRecognition();
setLedStateUnknown();
updateControls();
