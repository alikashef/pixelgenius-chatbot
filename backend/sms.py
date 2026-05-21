import os
import httpx

MELIPAYAMAK_SHARED_URL = os.getenv("MELIPAYAMAK_SHARED_URL", "")
MELIPAYAMAK_BODY_ID = int(os.getenv("MELIPAYAMAK_BODY_ID", "459793"))
SMS_API_KEY = os.getenv("SMS_API_KEY", "")
SMS_LINE_NUMBER = os.getenv("SMS_LINE_NUMBER", "")


class SmsSendError(Exception):
    pass


async def send_notification(phone: str, text: str) -> bool:
    if not SMS_API_KEY or not SMS_LINE_NUMBER:
        print(f"[SMS] {phone} → {text}")
        return True
    payload = {"to": phone, "from": SMS_LINE_NUMBER, "text": text}
    headers = {"Authorization": f"Bearer {SMS_API_KEY}"}
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post("https://api.sms.ir/v1/send/bulk", json=payload, headers=headers)
        resp.raise_for_status()
    return True


async def send_otp(phone: str, code: str) -> bool:
    if not MELIPAYAMAK_SHARED_URL:
        print(f"[OTP] {phone} → {code}")
        return True

    payload = {
        "bodyId": MELIPAYAMAK_BODY_ID,
        "to": phone,
        "args": [code],
    }

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(MELIPAYAMAK_SHARED_URL, json=payload)
        resp.raise_for_status()
        data = resp.json()

    rec_id = data.get("recId")
    status = data.get("status")
    if rec_id:
        return True

    message = status or data
    print(f"[SMS] Melipayamak failed for {phone}: {message}")
    raise SmsSendError(str(message))
