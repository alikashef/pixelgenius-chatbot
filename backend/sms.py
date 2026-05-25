import os
import httpx

MELIPAYAMAK_SHARED_URL = os.getenv("MELIPAYAMAK_SHARED_URL", "")
MELIPAYAMAK_BODY_ID = int(os.getenv("MELIPAYAMAK_BODY_ID", "459793"))
NOTIFY_BODY_ID = int(os.getenv("NOTIFY_BODY_ID", "460797"))


class SmsSendError(Exception):
    pass


async def send_notification(phone: str, project_name: str) -> bool:
    if not MELIPAYAMAK_SHARED_URL:
        print(f"[NOTIFY] {phone} → {project_name}")
        return True

    payload = {
        "bodyId": NOTIFY_BODY_ID,
        "to": phone,
        "args": [project_name],
    }

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(MELIPAYAMAK_SHARED_URL, json=payload)
        resp.raise_for_status()
        data = resp.json()

    if data.get("recId"):
        return True

    message = data.get("status") or data
    print(f"[SMS] Melipayamak notify failed for {phone}: {message}")
    raise SmsSendError(str(message))


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
