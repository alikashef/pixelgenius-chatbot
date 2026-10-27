import asyncio
import base64
import logging
import os
import uuid
from pathlib import Path

import httpx
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

GENERATED_DIR = Path("/app/uploads/generated")
PUBLIC_BASE_URL = (os.getenv("PUBLIC_MCP_URL") or "http://localhost:8000/mcp").rsplit("/mcp", 1)[0]
IMAGE_TIMEOUT = float(os.getenv("IMAGE_TIMEOUT_SECONDS", "90"))
DEFAULT_IMAGE_CONFIG = {"enabled": True, "model": "gapgpt/qwen-image-2.1", "size": "1024x1024", "max_images": 4}


def image_config(settings: dict) -> dict:
    config = settings.get("image_generation")
    return {**DEFAULT_IMAGE_CONFIG, **(config if isinstance(config, dict) else {})}


async def generate_image(prompt: str, config: dict, base_urls: list[str], api_key: str) -> str | None:
    """Generate one image and store it under /uploads/generated. Returns its public URL, or None on failure."""
    if not api_key or not prompt.strip():
        return None
    for base_url in base_urls:
        client = AsyncOpenAI(base_url=base_url, api_key=api_key, timeout=IMAGE_TIMEOUT)
        try:
            response = await client.images.generate(model=config["model"], prompt=prompt.strip()[:1500], size=config["size"], n=1)
            item = response.data[0]
            if item.b64_json:
                data = base64.b64decode(item.b64_json)
            elif item.url:
                async with httpx.AsyncClient(timeout=IMAGE_TIMEOUT, follow_redirects=True) as http:
                    remote = await http.get(item.url)
                    remote.raise_for_status()
                    data = remote.content
            else:
                continue
            GENERATED_DIR.mkdir(parents=True, exist_ok=True)
            name = f"{uuid.uuid4().hex}.png"
            (GENERATED_DIR / name).write_bytes(data)
            return f"{PUBLIC_BASE_URL}/uploads/generated/{name}"
        except Exception as e:
            logger.warning("Image generation failed for %s: %s", base_url, e)
    return None


async def fill_brief_images(spec: dict, settings: dict, base_urls: list[str], api_key: str) -> None:
    """Generate the images the brief asks for and attach the resulting URL to each entry."""
    config = image_config(settings)
    assets = spec.get("assets") if isinstance(spec.get("assets"), dict) else {}
    images = [i for i in assets.get("images") or [] if isinstance(i, dict) and str(i.get("prompt", "")).strip()]
    if not config["enabled"] or not images:
        spec["assets"] = {"images": []}
        return
    images = images[: max(0, int(config["max_images"]))]
    urls = await asyncio.gather(*(generate_image(i["prompt"], config, base_urls, api_key) for i in images))
    for image, url in zip(images, urls):
        image["url"] = url
    spec["assets"] = {"images": images}
