import httpx


async def test_connection(url: str, username: str, secret: str) -> dict:
    if not url or not secret:
        return {"ok": False, "message": "URL and token are required"}
    try:
        async with httpx.AsyncClient(timeout=10, headers={"PRIVATE-TOKEN": secret}) as client:
            resp = await client.get(f"{url.rstrip('/')}/api/v4/user")
    except httpx.HTTPError as e:
        return {"ok": False, "message": f"Connection failed: {e}"}
    if resp.status_code == 200:
        who = resp.json().get("username", "unknown")
        return {"ok": True, "message": f"Connected as {who}"}
    return {"ok": False, "message": f"GitLab responded with {resp.status_code}"}


async def sync(db=None) -> dict:
    """Stub — wire up GitLab REST API calls here."""
    return {"records": 0}
