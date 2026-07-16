import httpx


async def test_connection(url: str, username: str, secret: str) -> dict:
    if not url or not username or not secret:
        return {"ok": False, "message": "URL, access key, and secret key are required"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{url.rstrip('/')}/login",
                json={"username": username, "password": secret},
            )
    except httpx.HTTPError as e:
        return {"ok": False, "message": f"Connection failed: {e}"}
    if resp.status_code == 200 and resp.json().get("token"):
        return {"ok": True, "message": "Connected to Prisma Cloud"}
    return {"ok": False, "message": f"Prisma Cloud responded with {resp.status_code}"}


async def sync(db=None) -> dict:
    """Stub — wire up Prisma Cloud API calls here."""
    return {"records": 0}
