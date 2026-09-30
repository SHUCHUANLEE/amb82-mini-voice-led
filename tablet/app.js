"use strict";

const elements = {
  connectionStatus: document.querySelector("#connectionStatus"),
  refreshButton: document.querySelector("#refreshButton"),
  recognitionLanguage: document.querySelector("#recognitionLanguage"),
  voiceButton: document.querySelector("#voiceButton"),
  speechInput: document.querySelector("#speechInput"),
  commandResult: document.querySelector("#commandResult"),
  executionResult: document.querySelector("#executionResult"),
  blueCard: document.querySelector("#blueCard"),
  greenCard: document.querySelector("#greenCard"),
  blueState: document.querySelector("#blueState"),
  greenState: document.querySelector("#greenState"),
  leftButton: document.querySelector("#leftButton"),
  rightButton: document.querySelector("#rightButton"),
  blinkButton: document.querySelector("#blinkButton"),
  eventLog: document.querySelector("#eventLog"),
};

let busy = false;
let listening = false;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = SpeechRecognition ? new SpeechRecognition() : null;

function addLog(message) {
  const item = document.createElement("li");
  item.textContent = `${new Date().toLocaleTimeString("zh-TW", { hour12: false })}　${message}`;
  elements.eventLog.prepend(item);
}

function setBusy(value) {
  busy = value;
  updateControls();
}

function updateControls() {
  elements.refreshButton.disabled = busy || listening;
  elements.voiceButton.disabled = busy || listening || !recognition;
  elements.leftButton.disabled = busy || listening;
  elements.rightButton.disabled = busy || listening;
  elements.blinkButton.disabled = busy || listening;
}

function speakFeedback(zhText, enText = zhText) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const english = elements.recognitionLanguage.value === "en-US";
  const utterance = new SpeechSynthesisUtterance(english ? enText : zhText);
  utterance.lang = english ? "en-US" : "zh-TW";
  window.speechSynthesis.speak(utterance);
}

function setConnection(message, type) {
  elements.connectionStatus.textContent = message;
  elements.connectionStatus.className = `status ${type}`;
}

function setLed(card, label, color, isOn) {
  card.className = `led-card ${color} ${isOn ? "on" : "off"}`;
  label.textContent = isOn ? "亮" : "滅";
}

function updateState(state) {
  if (!state || typeof state.blue !== "boolean" || typeof state.green !== "boolean") return;
  setLed(elements.blueCard, elements.blueState, "blue", state.blue);
  setLed(elements.greenCard, elements.greenState, "green", state.green);
}

async function readJson(response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
  return data;
}

async function refreshStatus() {
  if (busy) return;
  setBusy(true);
  setConnection("正在連接電腦上的 COM4…", "waiting");
  try {
    const data = await readJson(await fetch("/api/status", { cache: "no-store" }));
    updateState(data.state);
    setConnection("已連接 AMB82-MINI（115200 baud）", "success");
    elements.executionResult.textContent = data.message;
    addLog(`板端回覆：${data.rawReply}`);
  } catch (error) {
    setConnection(`通訊失敗：${error.message}`, "error");
    elements.executionResult.textContent = "未取得板端回覆，LED 狀態不更新";
    addLog(`通訊失敗：${error.message}`);
  } finally {
    setBusy(false);
  }
}

async function sendSpeech(speech) {
  if (busy) return;
  const text = speech.trim();
  if (!text) {
    elements.executionResult.textContent = "請先用 iPad 聽寫或輸入一句話";
    return;
  }

  setBusy(true);
  elements.commandResult.textContent = "正在比對白名單…";
  elements.executionResult.textContent = "處理中…";
  try {
    const data = await readJson(await fetch("/api/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speech: text }),
    }));

    if (!data.accepted) {
      elements.commandResult.textContent = "非控制指令（未傳送）";
      elements.executionResult.textContent = data.message;
      addLog(`忽略非控制語句：${text}`);
      speakFeedback("不是控制指令，燈號保持不變", "Command not recognized. Lights unchanged");
      return;
    }

    updateState(data.state);
    setConnection("已連接 AMB82-MINI（115200 baud）", "success");
    elements.commandResult.textContent = `${data.label} → ${data.command}`;
    elements.executionResult.textContent = data.message;
    addLog(`板端回覆：${data.rawReply}`);
    speakFeedback(data.feedbackZh, data.feedbackEn);
  } catch (error) {
    setConnection(`通訊失敗：${error.message}`, "error");
    elements.executionResult.textContent = "指令未確認成功，LED 狀態不更新";
    addLog(`傳送失敗：${error.message}`);
    speakFeedback("通訊失敗", "Communication failed");
  } finally {
    setBusy(false);
  }
}

function configureSpeechRecognition() {
  if (!recognition) {
    elements.voiceButton.textContent = "此 Safari 連線無法使用語音辨識";
    elements.executionResult.textContent = window.isSecureContext
      ? "此瀏覽器不支援 Web Speech API"
      : "Safari 需要安全的 HTTPS 連線才能直接使用麥克風";
    addLog("瀏覽器未提供 SpeechRecognition");
    updateControls();
    return;
  }

  recognition.lang = elements.recognitionLanguage.value;
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.addEventListener("start", () => {
    listening = true;
    elements.voiceButton.textContent = "正在聆聽，請說出指令…";
    elements.voiceButton.classList.add("listening");
    const english = elements.recognitionLanguage.value === "en-US";
    elements.executionResult.textContent = english
      ? "Say: turn on left light, turn on right light, or blink three times"
      : "請說：左邊開燈、右邊開燈，或閃爍三次";
    addLog("開始直接語音辨識");
    updateControls();
  });

  recognition.addEventListener("result", (event) => {
    const transcript = event.results[0][0].transcript;
    elements.speechInput.value = transcript;
    listening = false;
    updateControls();
    addLog(`辨識文字：${transcript}`);
    sendSpeech(transcript);
  });

  recognition.addEventListener("error", (event) => {
    const messages = {
      "no-speech": "沒有偵測到語音，請再試一次",
      "audio-capture": "找不到可用的麥克風",
      "not-allowed": "麥克風或語音辨識權限被拒絕",
      "service-not-allowed": "Safari 不允許此頁使用語音辨識",
      "network": "語音辨識服務連線失敗",
    };
    const message = messages[event.error] || `語音辨識失敗：${event.error}`;
    elements.executionResult.textContent = message;
    addLog(message);
  });

  recognition.addEventListener("end", () => {
    listening = false;
    elements.voiceButton.textContent = "🎤 開始語音辨識";
    elements.voiceButton.classList.remove("listening");
    updateControls();
  });
}

elements.refreshButton.addEventListener("click", refreshStatus);
elements.voiceButton.addEventListener("click", () => {
  elements.speechInput.value = "";
  try {
    recognition.lang = elements.recognitionLanguage.value;
    recognition?.start();
  } catch (error) {
    elements.executionResult.textContent = `無法開始語音辨識：${error.message}`;
  }
});
elements.leftButton.addEventListener("click", () => {
  elements.speechInput.value = "左邊開燈";
  sendSpeech(elements.speechInput.value);
});
elements.rightButton.addEventListener("click", () => {
  elements.speechInput.value = "右邊開燈";
  sendSpeech(elements.speechInput.value);
});
elements.blinkButton.addEventListener("click", () => {
  elements.speechInput.value = "閃爍三次";
  sendSpeech(elements.speechInput.value);
});

configureSpeechRecognition();
refreshStatus();
