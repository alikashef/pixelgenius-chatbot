#!/usr/bin/env python3
"""Generate the onboarding-tour narration with ElevenLabs.

Reads frontend/lib/tours.json and writes one MP3 per step to
frontend/public/audio/tour/, plus manifest.json mapping "tour/step" to the file.
A step is regenerated only when its text changes; stale files are removed.

    ELEVENLABS_API_KEY=... python3 scripts/generate_tour_audio.py

Optional: ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL_ID. The key is read from the
environment only and must never be committed.
"""

import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOURS = ROOT / "frontend" / "lib" / "tours.json"
OUT_DIR = ROOT / "frontend" / "public" / "audio" / "tour"
MANIFEST = OUT_DIR / "manifest.json"

API_KEY = os.environ.get("ELEVENLABS_API_KEY", "").strip()
VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL").strip()
MODEL_ID = os.environ.get("ELEVENLABS_MODEL_ID", "eleven_v3").strip()


def speech_text(step: dict) -> str:
    return f"{step['title']}. {step['text']}"


def synthesize(text: str) -> bytes:
    request = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}?output_format=mp3_44100_128",
        data=json.dumps({"text": text, "model_id": MODEL_ID}).encode(),
        headers={"xi-api-key": API_KEY, "Content-Type": "application/json", "Accept": "audio/mpeg"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        raise SystemExit(f"ElevenLabs returned {error.code}: {error.read().decode(errors='replace')[:300]}")


def main() -> None:
    if not API_KEY:
        sys.exit("Set ELEVENLABS_API_KEY in the environment.")

    tours = json.loads(TOURS.read_text(encoding="utf-8"))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, str] = {}

    for tour, steps in tours.items():
        for step in steps:
            text = speech_text(step)
            digest = hashlib.sha1(f"{VOICE_ID}|{MODEL_ID}|{text}".encode()).hexdigest()[:10]
            name = f"{tour}-{step['id']}-{digest}.mp3"
            manifest[f"{tour}/{step['id']}"] = name
            target = OUT_DIR / name
            if target.exists():
                print(f"unchanged  {name}")
                continue
            target.write_bytes(synthesize(text))
            print(f"generated  {name}")

    keep = set(manifest.values())
    for old in OUT_DIR.glob("*.mp3"):
        if old.name not in keep:
            old.unlink()
            print(f"removed    {old.name}")

    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"manifest   {len(manifest)} steps")


if __name__ == "__main__":
    main()
