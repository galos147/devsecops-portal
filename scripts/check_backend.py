#!/usr/bin/env python3
"""Smoke-test every backend API endpoint. Uses stdlib only."""
import json
import sys
import urllib.request
import urllib.error

BASE = "http://localhost:8000"
passed = 0
failed = 0


def check(label, path, assert_fn):
    global passed, failed
    url = f"{BASE}{path}"
    try:
        with urllib.request.urlopen(url, timeout=5) as r:
            body = json.loads(r.read())
        ok, reason = assert_fn(body)
        if ok:
            print(f"  PASS  {label}")
            passed += 1
        else:
            print(f"  FAIL  {label} — {reason}")
            failed += 1
    except urllib.error.HTTPError as e:
        print(f"  FAIL  {label} — HTTP {e.code}")
        failed += 1
    except Exception as e:
        print(f"  FAIL  {label} — {e}")
        failed += 1


print("\n=== Backend Health Checks ===\n")

check("health",
      "/health",
      lambda b: (b.get("status") == "ok", f"got {b}"))

check("dashboard/stats",
      "/api/dashboard/stats",
      lambda b: (b.get("total_images", 0) > 0 and "severity_counts" in b,
                 f"total_images={b.get('total_images')}"))

check("images list",
      "/api/images",
      lambda b: (isinstance(b, list) and len(b) > 0, f"got {len(b) if isinstance(b, list) else b} items"))

check("image detail",
      "/api/images/img-1",
      lambda b: ("vulnerabilities" in b, f"keys={list(b.keys())}"))

check("vulnerabilities list",
      "/api/vulnerabilities",
      lambda b: (isinstance(b, list) and len(b) > 0, f"got {len(b) if isinstance(b, list) else b} items"))

check("CVE detail",
      "/api/vulnerabilities/CVE-2021-44228",
      lambda b: ("affected_images" in b, f"keys={list(b.keys())}"))

check("projects",
      "/api/projects",
      lambda b: (isinstance(b, list) and len(b) > 0, f"got {len(b) if isinstance(b, list) else b} items"))

check("code-issues",
      "/api/code-issues",
      lambda b: (isinstance(b, list) and len(b) > 0, f"got {len(b) if isinstance(b, list) else b} items"))

check("pipelines",
      "/api/pipelines",
      lambda b: (isinstance(b, list) and len(b) > 0, f"got {len(b) if isinstance(b, list) else b} items"))

check("search?q=log4j",
      "/api/search?q=log4j",
      lambda b: (len(b.get("cves", [])) > 0 or len(b.get("images", [])) > 0,
                 f"cves={len(b.get('cves',[]))} images={len(b.get('images',[]))}"))

check("fix-suggestion CVE-2021-44228",
      "/api/fix-suggestions/CVE-2021-44228",
      lambda b: (bool(b.get("suggestion_text")), f"suggestion_text empty"))

check("sync/status",
      "/api/sync/status",
      lambda b: (all(t in b for t in ["jfrog", "sonarqube", "prisma", "gitlab"]),
                 f"keys={list(b.keys())}"))

print(f"\n{'='*35}")
print(f"  {passed} passed, {failed} failed")
print(f"{'='*35}\n")
sys.exit(0 if failed == 0 else 1)
