"""iPad dictation to AMB82-MINI Serial bridge."""

from __future__ import annotations

import argparse
import json
import re
import socket
import threading
import time
import unicodedata
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import serial
from serial import SerialException


TABLET_DIR = Path(__file__).resolve().parent
REPLY_PATTERN = re.compile(
    r"^(?P<type>ACK|ERR|READY)\|(?P<command>[^|]+)\|BLUE=(?P<blue>[01])\|GREEN=(?P<green>[01])$"
)
LEFT_PHRASE = {
    "command": "LEFT_ON",
    "label": "左邊開燈（藍燈）",
    "feedbackZh": "藍燈已開啟",
    "feedbackEn": "Blue light turned on",
}
RIGHT_PHRASE = {
    "command": "RIGHT_ON",
    "label": "右邊開燈（綠燈）",
    "feedbackZh": "綠燈已開啟",
    "feedbackEn": "Green light turned on",
}
BLINK_PHRASE = {
    "command": "BLINK_3",
    "label": "兩顆 LED 閃爍三次",
    "feedbackZh": "兩顆燈已閃爍三次",
    "feedbackEn": "Both lights blinked three times",
}

PHRASES = {
    "左邊開燈": LEFT_PHRASE,
    "左边开灯": LEFT_PHRASE,
    "開左邊燈": LEFT_PHRASE,
    "开左边灯": LEFT_PHRASE,
    "右邊開燈": RIGHT_PHRASE,
    "右边开灯": RIGHT_PHRASE,
    "開右邊燈": RIGHT_PHRASE,
    "开右边灯": RIGHT_PHRASE,
    "閃爍三次": BLINK_PHRASE,
    "闪烁三次": BLINK_PHRASE,
    "兩顆燈閃爍三次": BLINK_PHRASE,
    "两颗灯闪烁三次": BLINK_PHRASE,
    "turnonleftlight": LEFT_PHRASE,
    "leftlighton": LEFT_PHRASE,
    "turnonbluelight": LEFT_PHRASE,
    "turnonrightlight": RIGHT_PHRASE,
    "rightlighton": RIGHT_PHRASE,
    "turnongreenlight": RIGHT_PHRASE,
    "blinkthreetimes": BLINK_PHRASE,
    "flashthreetimes": BLINK_PHRASE,
}


def normalize_speech(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text).strip().casefold()
    return re.sub(r"[\s，。！？、,.!?]", "", normalized)


def local_ipv4_addresses() -> list[str]:
    addresses: set[str] = set()
    try:
        for item in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            address = item[4][0]
            if not address.startswith("127."):
                addresses.add(address)
    except OSError:
        pass
    return sorted(addresses)


class SerialBridge:
    def __init__(self, port: str, baud_rate: int, timeout_seconds: float = 3.5) -> None:
        self.port = port
        self.baud_rate = baud_rate
        self.timeout_seconds = timeout_seconds
        self.connection: serial.Serial | None = None
        self.lock = threading.Lock()
        self.last_state: dict[str, Any] | None = None

    def _close(self) -> None:
        if self.connection is not None:
            try:
                self.connection.close()
            except SerialException:
                pass
        self.connection = None

    def _ensure_open(self) -> serial.Serial:
        if self.connection is not None and self.connection.is_open:
            return self.connection

        try:
            self.connection = serial.Serial(
                port=self.port,
                baudrate=self.baud_rate,
                timeout=0.1,
                write_timeout=1.0,
            )
            time.sleep(0.15)
            self.connection.reset_input_buffer()
            return self.connection
        except (SerialException, OSError) as error:
            self._close()
            raise ConnectionError(
                f"無法開啟 {self.port}；請關閉 Arduino Serial Monitor 與電腦版網頁的 Serial 連線"
            ) from error

    def send(self, command: str) -> dict[str, Any]:
        with self.lock:
            connection = self._ensure_open()
            try:
                connection.write(f"{command}\n".encode("ascii"))
                connection.flush()
                deadline = time.monotonic() + self.timeout_seconds

                while time.monotonic() < deadline:
                    raw_line = connection.readline()
                    if not raw_line:
                        continue
                    line = raw_line.decode("ascii", errors="ignore").strip()
                    match = REPLY_PATTERN.match(line)
                    if not match:
                        continue

                    fields = match.groupdict()
                    if fields["type"] == "READY":
                        self.last_state = self._state_from_fields(fields)
                        continue
                    if fields["command"] not in {command, "UNKNOWN_COMMAND", "COMMAND_TOO_LONG"}:
                        continue

                    state = self._state_from_fields(fields)
                    self.last_state = state
                    return {
                        "ok": fields["type"] == "ACK",
                        "replyType": fields["type"],
                        "replyCommand": fields["command"],
                        "rawReply": line,
                        "state": state,
                    }

                raise TimeoutError("開發板在 3.5 秒內沒有回覆")
            except (SerialException, OSError) as error:
                self._close()
                raise ConnectionError("與 AMB82-MINI 的 Serial 通訊中斷") from error

    @staticmethod
    def _state_from_fields(fields: dict[str, str]) -> dict[str, bool]:
        return {
            "blue": fields["blue"] == "1",
            "green": fields["green"] == "1",
        }


class TabletHandler(SimpleHTTPRequestHandler):
    bridge: SerialBridge

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(TABLET_DIR), **kwargs)

    def log_message(self, format_string: str, *args: Any) -> None:
        print(f"{self.client_address[0]} - {format_string % args}")

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _send_json(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_bridge_error(self, error: Exception) -> None:
        self._send_json(
            HTTPStatus.SERVICE_UNAVAILABLE,
            {
                "ok": False,
                "communicationError": True,
                "message": str(error),
                "state": self.bridge.last_state,
            },
        )

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/health":
            connected = bool(self.bridge.connection and self.bridge.connection.is_open)
            self._send_json(
                HTTPStatus.OK,
                {"ok": True, "serialConnected": connected, "state": self.bridge.last_state},
            )
            return

        if path == "/api/status":
            try:
                result = self.bridge.send("STATUS")
                result["message"] = "已取得開發板回傳狀態"
                self._send_json(HTTPStatus.OK, result)
            except (ConnectionError, TimeoutError) as error:
                self._send_bridge_error(error)
            return

        if path == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/api/command":
            self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "message": "找不到此功能"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length <= 0 or content_length > 4096:
                raise ValueError("輸入內容長度不正確")
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
            speech = str(payload.get("speech", "")).strip()
        except (ValueError, json.JSONDecodeError, UnicodeDecodeError) as error:
            self._send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "message": str(error)})
            return

        normalized = normalize_speech(speech)
        phrase = PHRASES.get(normalized)
        if phrase is None:
            self._send_json(
                HTTPStatus.OK,
                {
                    "ok": False,
                    "accepted": False,
                    "sent": False,
                    "speech": speech,
                    "message": "非控制指令，未傳送；LED 狀態保持不變",
                    "state": self.bridge.last_state,
                },
            )
            return

        command = phrase["command"]
        label = phrase["label"]
        try:
            result = self.bridge.send(command)
            result.update(
                {
                    "accepted": True,
                    "sent": True,
                    "speech": speech,
                    "command": command,
                    "label": label,
                    "feedbackZh": phrase["feedbackZh"],
                    "feedbackEn": phrase["feedbackEn"],
                    "message": f"執行成功：{label}" if result["ok"] else "開發板拒絕指令",
                }
            )
            self._send_json(HTTPStatus.OK, result)
        except (ConnectionError, TimeoutError) as error:
            self._send_bridge_error(error)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="iPad to AMB82-MINI Serial bridge")
    parser.add_argument("--serial-port", default="COM4")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--listen", default="0.0.0.0")
    parser.add_argument("--http-port", type=int, default=8765)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    TabletHandler.bridge = SerialBridge(args.serial_port, args.baud)
    server = ThreadingHTTPServer((args.listen, args.http_port), TabletHandler)

    print("AMB82-MINI iPad bridge is running.")
    print(f"Serial: {args.serial_port} at {args.baud} baud")
    print(f"PC: http://localhost:{args.http_port}")
    for address in local_ipv4_addresses():
        print(f"iPad: http://{address}:{args.http_port}")
    print("Press Ctrl+C to stop.")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        TabletHandler.bridge._close()
        server.server_close()


if __name__ == "__main__":
    main()
