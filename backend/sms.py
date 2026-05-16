import os
import httpx

MELIPAYAMAK_USERNAME = os.getenv("MELIPAYAMAK_USERNAME", "")
MELIPAYAMAK_PASSWORD = os.getenv("MELIPAYAMAK_PASSWORD", "")
MELIPAYAMAK_FROM = os.getenv("MELIPAYAMAK_FROM", "")

BASE_URL = "https://api.melipayamak.com/api/send/simple"


async def send_otp(phone: str, code: str) -> bool:
    text = f"کد تایید شما: {code}\nاعتبار: ۲ دقیقه"

    if not MELIPAYAMAK_USERNAME:
        # dev mode: print to console
        print(f"[OTP] {phone} → {code}")
        return True

    url = f"{BASE_URL}/{MELIPAYAMAK_USERNAME}/{MELIPAYAMAK_PASSWORD}"
    payload = {"from": MELIPAYAMAK_FROM, "to": phone, "text": text}

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(url, json=payload)
        data = resp.json()
        return data.get("Value") not in (None, "", "0")
