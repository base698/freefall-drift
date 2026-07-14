#!/usr/bin/env python3
from __future__ import annotations

import json
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "dist"
AWC_URL = "https://aviationweather.gov/api/data/windtemp"
KNOT_TO_MPH = 1.15078
ALTITUDES = [0, 3000, 6000, 9000, 12000]


def decode_fd(raw: str) -> dict:
    code = raw.strip()[:4]
    if not code or code == "9900":
        return {"directionDeg": 0, "speedMph": 0}
    return {"directionDeg": int(code[:2]) * 10, "speedMph": int(code[2:4]) * KNOT_TO_MPH}


def parse_fd(text: str, station: str) -> dict:
    station = station.upper()
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    row = next((line for line in lines if line.startswith(station + " ")), None)
    if not row:
        raise ValueError(f"station {station} not found in FD wind/temp forecast")
    parts = row.split()
    codes = parts[1:5]
    if len(codes) < 4:
        raise ValueError(f"station {station} row did not include 3000-12000 ft winds")
    layers = [{"altitudeFt": 0, "directionDeg": 0, "speedMph": 0}]
    for altitude, code in zip(ALTITUDES[1:], codes):
        layers.append({"altitudeFt": altitude, **decode_fd(code)})
    header = " ".join(line for line in lines if line.startswith(("DATA BASED", "VALID")))
    return {"station": station, "layers": layers, "header": header}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, format: str, *args) -> None:
        return

    def send_json(self, data: dict, status: int = 200) -> None:
        body = json.dumps(data, indent=2).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/winds-aloft":
            qs = urllib.parse.parse_qs(parsed.query)
            station = (qs.get("station", ["RDU"])[0] or "RDU").upper()[:4]
            region = qs.get("region", ["mia"])[0] or "mia"
            fcst = qs.get("fcst", ["06"])[0] or "06"
            url = AWC_URL + "?" + urllib.parse.urlencode({"region": region, "level": "low", "fcst": fcst})
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "freefall-drift-netexplore/0.1"})
                text = urllib.request.urlopen(req, timeout=15).read().decode()
                result = parse_fd(text, station)
                result.update({"source": "AviationWeather FD wind/temp point data", "region": region, "fcst": fcst, "url": url})
                self.send_json(result)
            except Exception as exc:
                self.send_json({"error": str(exc)}, 502)
            return
        return super().do_GET()


def main() -> None:
    ThreadingHTTPServer(("0.0.0.0", 8788), Handler).serve_forever()


if __name__ == "__main__":
    main()
