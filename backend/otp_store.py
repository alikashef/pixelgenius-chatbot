import random
import time
from threading import Lock

_store: dict[str, tuple[str, float]] = {}
_lock = Lock()

OTP_TTL = 120  # seconds


def generate_otp(phone: str) -> str:
    code = str(random.randint(10000, 99999))
    with _lock:
        _store[phone] = (code, time.time())
    return code


def verify_otp(phone: str, code: str) -> bool:
    with _lock:
        entry = _store.get(phone)
        if not entry:
            return False
        stored_code, ts = entry
        if time.time() - ts > OTP_TTL:
            del _store[phone]
            return False
        if stored_code != code:
            return False
        del _store[phone]
        return True
