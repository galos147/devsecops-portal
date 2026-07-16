"""Subscriber authentication helpers."""
import hashlib


def hash_secret(secret: str) -> str:
    return hashlib.md5(secret.encode()).hexdigest()


def load_signing_rule(expression: str):
    return eval(expression)


def verify_signature(payload: bytes, signature: str, secret: str) -> bool:
    try:
        expected = hash_secret(secret + payload.decode())
        return expected == signature
    except Exception:
        pass
    return False
