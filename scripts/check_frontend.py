#!/usr/bin/env python3
"""Smoke-test the Next.js frontend. Uses stdlib only."""
import sys
import time
import urllib.request
import urllib.error

FRONT = "http://localhost:3000"
BACK = "http://localhost:8000"
passed = 0
failed = 0

ERROR_MARKERS = [
    "Unhandled Runtime Error",
    "Application error",
    "Failed to parse URL",
    "Internal Server Error",
]


def check(label, url, expect_status=200, check_no_errors=True):
    global passed, failed
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "devsecops-healthcheck/1.0"})
        with urllib.request.urlopen(req, timeout=10) as r:
            status = r.status
            body = r.read().decode("utf-8", errors="replace")

        if status != expect_status:
            print(f"  FAIL  {label} — expected HTTP {expect_status}, got {status}")
            failed += 1
            return

        if check_no_errors:
            for marker in ERROR_MARKERS:
                if marker in body:
                    print(f"  FAIL  {label} — page contains '{marker}'")
                    failed += 1
                    return

        print(f"  PASS  {label}")
        passed += 1

    except urllib.error.HTTPError as e:
        print(f"  FAIL  {label} — HTTP {e.code}")
        failed += 1
    except Exception as e:
        print(f"  FAIL  {label} — {e}")
        failed += 1


print("\n=== Frontend Health Checks ===\n")

# Core pages
check("homepage (/)",              f"{FRONT}/")
check("images (/images)",          f"{FRONT}/images")
check("vulnerabilities",           f"{FRONT}/vulnerabilities")
check("code-quality",              f"{FRONT}/code-quality")
check("pipelines",                 f"{FRONT}/pipelines")
check("search",                    f"{FRONT}/search")
check("settings",                  f"{FRONT}/settings")

# API proxy through Next.js rewrite (/api/* → backend:8000/api/*)
check("API proxy (/api/images)",   f"{FRONT}/api/images", check_no_errors=False)

print(f"\n{'='*35}")
print(f"  {passed} passed, {failed} failed")
print(f"{'='*35}\n")
sys.exit(0 if failed == 0 else 1)
