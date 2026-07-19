"""Seed the database with realistic fake data extracted from the design prototype."""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime
from app.database import SessionLocal, init_db
from app.models.image import Image
from app.models.vulnerability import Vulnerability
from app.models.code_project import CodeProject
from app.models.code_issue import CodeIssue
from app.models.pipeline_run import PipelineRun
from app.models.fix_suggestion import FixSuggestion
from app.models.sync_job import SyncJob
from app.models.image_package import ImagePackage
from app.models.service import Service
from app.models.user import User
from app.models.dependency_track_project import DependencyTrackProject
from app.auth import hash_password
import uuid

DEFAULT_ADMIN_USERNAME = "admin"
DEFAULT_ADMIN_PASSWORD = "ChangeMe123!"


def bootstrap_admin(db) -> None:
    """
    Creates a default admin account only if zero users exist yet. Deliberate, visible
    MVP trade-off for a small-team internal tool (not a public-facing product) — there's
    no email infrastructure to deliver a real invite, so the default credential is
    hardcoded and logged loudly. Must be changed on first login (Settings > Users).
    """
    if db.query(User).count() > 0:
        return
    admin = User(
        id=f"user-{uuid.uuid4().hex[:12]}",
        username=DEFAULT_ADMIN_USERNAME,
        password_hash=hash_password(DEFAULT_ADMIN_PASSWORD),
        role="admin",
        is_active=True,
        created_at=datetime.utcnow(),
    )
    db.add(admin)
    db.commit()
    print("=" * 72)
    print("  BOOTSTRAP: no users existed — created a default admin account")
    print(f"    username: {DEFAULT_ADMIN_USERNAME}")
    print(f"    password: {DEFAULT_ADMIN_PASSWORD}")
    print("  CHANGE THIS PASSWORD IMMEDIATELY: log in, then Settings > Users.")
    print("=" * 72)


def dt(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")).replace(tzinfo=None)


IMAGES = [
    {"id": "img-1", "name": "payments-service", "tag": "2.4.1", "registry": "docker.io/corp", "digest": "sha256:7a3f9c2e1b8d", "size_mb": 214, "pushed_at": "2026-07-10T14:22:00", "last_scanned_at": "2026-07-15T02:00:00", "source": "jfrog"},
    {"id": "img-2", "name": "auth-gateway", "tag": "1.12.0", "registry": "registry.internal.corp.com", "digest": "sha256:1c9a44f0aa21", "size_mb": 168, "pushed_at": "2026-07-09T09:10:00", "last_scanned_at": "2026-07-15T02:00:00", "source": "jfrog"},
    {"id": "img-3", "name": "checkout-api", "tag": "3.0.2", "registry": "gcr.io/corp-prod", "digest": "sha256:52ed80c9f7a3", "size_mb": 301, "pushed_at": "2026-07-08T18:41:00", "last_scanned_at": "2026-07-14T02:00:00", "source": "prisma"},
    {"id": "img-4", "name": "notification-worker", "tag": "1.5.0", "registry": "docker.io/corp", "digest": "sha256:9be31d4c6a02", "size_mb": 122, "pushed_at": "2026-07-11T11:00:00", "last_scanned_at": "2026-07-15T02:00:00", "source": "prisma"},
    {"id": "img-5", "name": "user-profile-svc", "tag": "2.1.3", "registry": "registry.internal.corp.com", "digest": "sha256:cf203a9e11bb", "size_mb": 189, "pushed_at": "2026-07-07T15:30:00", "last_scanned_at": "2026-07-13T02:00:00", "source": "jfrog"},
    {"id": "img-6", "name": "inventory-sync", "tag": "1.0.8", "registry": "gcr.io/corp-prod", "digest": "sha256:4e7712bfa933", "size_mb": 97, "pushed_at": "2026-07-06T08:12:00", "last_scanned_at": "2026-07-15T02:00:00", "source": "prisma"},
    {"id": "img-7", "name": "search-indexer", "tag": "4.2.0", "registry": "docker.io/corp", "digest": "sha256:8a1f5cd0e621", "size_mb": 256, "pushed_at": "2026-07-12T13:44:00", "last_scanned_at": "2026-07-15T02:00:00", "source": "jfrog"},
    {"id": "img-8", "name": "billing-engine", "tag": "2.9.0", "registry": "registry.internal.corp.com", "digest": "sha256:d02b9f4a7710", "size_mb": 178, "pushed_at": "2026-07-05T10:05:00", "last_scanned_at": "2026-07-12T02:00:00", "source": "prisma"},
    {"id": "img-9", "name": "email-dispatcher", "tag": "1.3.1", "registry": "docker.io/corp", "digest": "sha256:6f10ac3e88bd", "size_mb": 88, "pushed_at": "2026-07-10T17:20:00", "last_scanned_at": "2026-07-15T02:00:00", "source": "jfrog"},
    {"id": "img-10", "name": "fraud-detection", "tag": "3.4.0", "registry": "gcr.io/corp-prod", "digest": "sha256:e5a289cf1034", "size_mb": 342, "pushed_at": "2026-07-09T12:55:00", "last_scanned_at": "2026-07-14T02:00:00", "source": "prisma"},
    {"id": "img-11", "name": "session-cache", "tag": "1.1.0", "registry": "docker.io/corp", "digest": "sha256:3bd4471a90ce", "size_mb": 64, "pushed_at": "2026-07-11T09:33:00", "last_scanned_at": "2026-07-15T02:00:00", "source": "jfrog"},
    {"id": "img-12", "name": "reporting-api", "tag": "2.0.5", "registry": "registry.internal.corp.com", "digest": "sha256:a91c003ef521", "size_mb": 205, "pushed_at": "2026-07-04T16:18:00", "last_scanned_at": "2026-07-11T02:00:00", "source": "prisma"},
]

VULNERABILITIES = [
    {"id": "v-1", "image_id": "img-1", "cve_id": "CVE-2021-44228", "severity": "critical", "package_name": "log4j-core", "installed_version": "2.14.1", "fixed_version": "2.17.1", "cvss_score": 10.0, "description": "Remote code execution via JNDI lookup in Log4j2 (Log4Shell).", "source_tool": "jfrog", "status": "open"},
    {"id": "v-2", "image_id": "img-1", "cve_id": "CVE-2022-3602", "severity": "high", "package_name": "openssl", "installed_version": "3.0.6", "fixed_version": "3.0.7", "cvss_score": 8.1, "description": "Buffer overflow in X.509 punycode decoding.", "source_tool": "jfrog", "status": "open"},
    {"id": "v-3", "image_id": "img-2", "cve_id": "CVE-2024-3094", "severity": "critical", "package_name": "xz-utils", "installed_version": "5.6.0", "fixed_version": "5.6.2", "cvss_score": 10.0, "description": "Backdoor in xz liblzma allowing SSH authentication bypass.", "source_tool": "jfrog", "status": "open"},
    {"id": "v-4", "image_id": "img-2", "cve_id": "CVE-2023-38545", "severity": "high", "package_name": "curl", "installed_version": "8.1.0", "fixed_version": "8.4.0", "cvss_score": 7.5, "description": "Heap buffer overflow in SOCKS5 proxy handshake.", "source_tool": "jfrog", "status": "open"},
    {"id": "v-5", "image_id": "img-3", "cve_id": "CVE-2023-44487", "severity": "high", "package_name": "nghttp2", "installed_version": "1.51.0", "fixed_version": "1.57.0", "cvss_score": 7.5, "description": "HTTP/2 rapid reset allows denial of service via stream cancellation.", "source_tool": "prisma", "status": "open"},
    {"id": "v-6", "image_id": "img-3", "cve_id": "CVE-2024-21626", "severity": "critical", "package_name": "runc", "installed_version": "1.1.5", "fixed_version": "1.1.12", "cvss_score": 8.6, "description": "Container breakout via leaked file descriptor in runc.", "source_tool": "prisma", "status": "open"},
    {"id": "v-7", "image_id": "img-4", "cve_id": "CVE-2023-4863", "severity": "critical", "package_name": "libwebp", "installed_version": "1.2.4", "fixed_version": "1.3.2", "cvss_score": 8.8, "description": "Heap buffer overflow in WebP lossless decoding.", "source_tool": "prisma", "status": "open"},
    {"id": "v-8", "image_id": "img-4", "cve_id": "CVE-2022-0778", "severity": "medium", "package_name": "openssl", "installed_version": "1.1.1l", "fixed_version": "1.1.1n", "cvss_score": 6.5, "description": "Infinite loop in BN_mod_sqrt() when parsing a malformed certificate.", "source_tool": "prisma", "status": "open"},
    {"id": "v-9", "image_id": "img-5", "cve_id": "CVE-2023-32681", "severity": "medium", "package_name": "requests", "installed_version": "2.29.0", "fixed_version": "2.31.0", "cvss_score": 6.1, "description": "Proxy-Authorization header leaked to destination server on redirect.", "source_tool": "jfrog", "status": "open"},
    {"id": "v-10", "image_id": "img-5", "cve_id": "CVE-2019-8457", "severity": "low", "package_name": "sqlite3", "installed_version": "3.26.0", "fixed_version": "3.28.0", "cvss_score": 3.9, "description": "Heap out-of-bounds read via crafted SQL query using rtree.", "source_tool": "jfrog", "status": "open"},
    {"id": "v-11", "image_id": "img-6", "cve_id": "CVE-2023-45853", "severity": "medium", "package_name": "minizip", "installed_version": "1.2.11", "fixed_version": "1.3", "cvss_score": 5.9, "description": "Integer overflow in zipOpenNewFileInZip4_64 leading to heap overflow.", "source_tool": "prisma", "status": "open"},
    {"id": "v-12", "image_id": "img-7", "cve_id": "CVE-2024-3094", "severity": "critical", "package_name": "xz-utils", "installed_version": "5.6.1", "fixed_version": "5.6.2", "cvss_score": 10.0, "description": "Backdoor in xz liblzma allowing SSH authentication bypass.", "source_tool": "jfrog", "status": "open"},
    {"id": "v-13", "image_id": "img-7", "cve_id": "CVE-2023-2650", "severity": "low", "package_name": "openssl", "installed_version": "3.0.9", "fixed_version": "3.0.10", "cvss_score": 3.7, "description": "Excessive time spent checking OBJECT IDENTIFIERS.", "source_tool": "jfrog", "status": "fixed"},
    {"id": "v-14", "image_id": "img-8", "cve_id": "CVE-2022-3602", "severity": "high", "package_name": "openssl", "installed_version": "3.0.6", "fixed_version": "3.0.7", "cvss_score": 8.1, "description": "Buffer overflow in X.509 punycode decoding.", "source_tool": "prisma", "status": "open"},
    {"id": "v-15", "image_id": "img-9", "cve_id": "CVE-2023-32681", "severity": "medium", "package_name": "requests", "installed_version": "2.28.2", "fixed_version": "2.31.0", "cvss_score": 6.1, "description": "Proxy-Authorization header leaked to destination server on redirect.", "source_tool": "jfrog", "status": "open"},
    {"id": "v-16", "image_id": "img-10", "cve_id": "CVE-2021-44228", "severity": "critical", "package_name": "log4j-core", "installed_version": "2.13.3", "fixed_version": "2.17.1", "cvss_score": 10.0, "description": "Remote code execution via JNDI lookup in Log4j2 (Log4Shell).", "source_tool": "prisma", "status": "open"},
    {"id": "v-17", "image_id": "img-10", "cve_id": "CVE-2023-4863", "severity": "critical", "package_name": "libwebp", "installed_version": "1.3.0", "fixed_version": "1.3.2", "cvss_score": 8.8, "description": "Heap buffer overflow in WebP lossless decoding.", "source_tool": "prisma", "status": "open"},
    {"id": "v-18", "image_id": "img-11", "cve_id": "CVE-2019-8457", "severity": "low", "package_name": "sqlite3", "installed_version": "3.27.0", "fixed_version": "3.28.0", "cvss_score": 3.9, "description": "Heap out-of-bounds read via crafted SQL query using rtree.", "source_tool": "jfrog", "status": "suppressed"},
    {"id": "v-19", "image_id": "img-12", "cve_id": "CVE-2023-38545", "severity": "high", "package_name": "curl", "installed_version": "8.0.1", "fixed_version": "8.4.0", "cvss_score": 7.5, "description": "Heap buffer overflow in SOCKS5 proxy handshake.", "source_tool": "prisma", "status": "open"},
    {"id": "v-20", "image_id": "img-12", "cve_id": "CVE-2023-45853", "severity": "medium", "package_name": "minizip", "installed_version": "1.2.12", "fixed_version": "1.3", "cvss_score": 5.9, "description": "Integer overflow in zipOpenNewFileInZip4_64 leading to heap overflow.", "source_tool": "prisma", "status": "open"},
]

FIX_SUGGESTIONS = [
    {"id": "fix-1", "cve_id": "CVE-2021-44228", "suggestion_text": "Upgrade log4j-core to 2.17.1 or later. If upgrading is not immediately possible, set system property log4j2.formatMsgNoLookups=true or remove the JndiLookup class from the classpath.", "copy_cmd": "docker pull payments-service:2.4.2-patched  # or: mvn dependency:tree | grep log4j && mvn versions:use-dep-version -Dincludes=org.apache.logging.log4j:log4j-core -DdepVersion=2.17.1", "advisory_url": "https://nvd.nist.gov/vuln/detail/CVE-2021-44228", "published": "2021-12-10", "cvss_vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H"},
    {"id": "fix-2", "cve_id": "CVE-2024-3094", "suggestion_text": "Downgrade or pin xz-utils to 5.4.x until 5.6.2+ is verified clean in your base image, or rebuild from a base image that does not bundle the compromised liblzma build.", "copy_cmd": "apt-get install --only-upgrade xz-utils=5.6.2-*  # verify: xz --version", "advisory_url": "https://nvd.nist.gov/vuln/detail/CVE-2024-3094", "published": "2024-03-29", "cvss_vector": "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:C/C:H/I:H/A:H"},
    {"id": "fix-3", "cve_id": "CVE-2023-44487", "suggestion_text": "Upgrade nghttp2 to 1.57.0+. Ensure your reverse proxy enforces a max concurrent stream reset rate.", "copy_cmd": "apt-get install --only-upgrade libnghttp2-14  # or: pip install httpx --upgrade", "advisory_url": "https://nvd.nist.gov/vuln/detail/CVE-2023-44487", "published": "2023-10-10", "cvss_vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H"},
    {"id": "fix-4", "cve_id": "CVE-2023-38545", "suggestion_text": "Upgrade curl to 8.4.0+. Audit any code paths using SOCKS5 proxies with curl.", "copy_cmd": "apt-get install --only-upgrade curl libcurl4  # verify: curl --version | head -1", "advisory_url": "https://nvd.nist.gov/vuln/detail/CVE-2023-38545", "published": "2023-10-11", "cvss_vector": "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H"},
    {"id": "fix-5", "cve_id": "CVE-2022-0778", "suggestion_text": "Upgrade openssl to 1.1.1n+ or 3.0.2+. Restart affected services after upgrade to reload the library.", "copy_cmd": "apt-get install --only-upgrade openssl libssl1.1  # verify: openssl version", "advisory_url": "https://nvd.nist.gov/vuln/detail/CVE-2022-0778", "published": "2022-03-15", "cvss_vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H"},
    {"id": "fix-6", "cve_id": "CVE-2023-4863", "suggestion_text": "Upgrade libwebp to 1.3.2+. This affects any service that decodes user-supplied WebP images.", "copy_cmd": "apt-get install --only-upgrade libwebp7  # verify: dpkg -l | grep libwebp", "advisory_url": "https://nvd.nist.gov/vuln/detail/CVE-2023-4863", "published": "2023-09-11", "cvss_vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H"},
    {"id": "fix-7", "cve_id": "CVE-2023-32681", "suggestion_text": "Upgrade requests to 2.31.0+. Review any proxy configuration for credential exposure in logs.", "copy_cmd": "pip install 'requests>=2.31.0'  # verify: pip show requests | grep Version", "advisory_url": "https://nvd.nist.gov/vuln/detail/CVE-2023-32681", "published": "2023-05-26", "cvss_vector": "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N"},
    {"id": "fix-8", "cve_id": "CVE-2024-21626", "suggestion_text": "Upgrade runc to 1.1.12+ and the container runtime (containerd/Docker) to a matching patched release.", "copy_cmd": "apt-get install --only-upgrade runc containerd  # verify: runc --version", "advisory_url": "https://nvd.nist.gov/vuln/detail/CVE-2024-21626", "published": "2024-01-31", "cvss_vector": "CVSS:3.1/AV:L/AC:H/PR:N/UI:N/S:C/C:H/I:H/A:H"},
    {"id": "fix-9", "cve_id": "CVE-2022-3602", "suggestion_text": "Upgrade openssl to 3.0.7+. Punycode decoding is used during certificate name constraint checks.", "copy_cmd": "apt-get install --only-upgrade openssl libssl3  # verify: openssl version", "advisory_url": "https://nvd.nist.gov/vuln/detail/CVE-2022-3602", "published": "2022-11-01", "cvss_vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H"},
    {"id": "fix-10", "cve_id": "CVE-2023-45853", "suggestion_text": "Upgrade minizip/zlib to a version bundling the fixed zipOpenNewFileInZip4_64. Avoid processing untrusted zip archives with affected versions.", "copy_cmd": "apt-get install --only-upgrade zlib1g  # verify: dpkg -l | grep zlib1g", "advisory_url": "https://nvd.nist.gov/vuln/detail/CVE-2023-45853", "published": "2023-10-23", "cvss_vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H"},
    {"id": "fix-11", "cve_id": "CVE-2019-8457", "suggestion_text": "Upgrade sqlite3 to 3.28.0+. Low exploitability without direct SQL query construction from untrusted input.", "copy_cmd": "apt-get install --only-upgrade sqlite3 libsqlite3-0  # verify: sqlite3 --version", "advisory_url": "https://nvd.nist.gov/vuln/detail/CVE-2019-8457", "published": "2019-09-16", "cvss_vector": "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:N/A:H"},
    {"id": "fix-12", "cve_id": "CVE-2023-2650", "suggestion_text": "Upgrade openssl to 3.0.10+. Low severity, primarily a DoS via slow ASN.1 object parsing.", "copy_cmd": "apt-get install --only-upgrade openssl libssl3  # verify: openssl version", "advisory_url": "https://nvd.nist.gov/vuln/detail/CVE-2023-2650", "published": "2023-05-19", "cvss_vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L"},
]

CODE_PROJECTS = [
    {"id": "cp-1", "project_key": "payments-service", "name": "payments-service", "quality_gate": "passed", "bugs": 3, "vulnerabilities": 1, "code_smells": 24, "coverage": 84.2},
    {"id": "cp-2", "project_key": "auth-gateway", "name": "auth-gateway", "quality_gate": "failed", "bugs": 7, "vulnerabilities": 4, "code_smells": 41, "coverage": 61.5},
    {"id": "cp-3", "project_key": "checkout-api", "name": "checkout-api", "quality_gate": "passed", "bugs": 2, "vulnerabilities": 0, "code_smells": 18, "coverage": 91.0},
    {"id": "cp-4", "project_key": "notification-worker", "name": "notification-worker", "quality_gate": "failed", "bugs": 5, "vulnerabilities": 2, "code_smells": 33, "coverage": 58.9},
    {"id": "cp-5", "project_key": "user-profile-svc", "name": "user-profile-svc", "quality_gate": "passed", "bugs": 1, "vulnerabilities": 0, "code_smells": 12, "coverage": 88.7},
    {"id": "cp-6", "project_key": "inventory-sync", "name": "inventory-sync", "quality_gate": "passed", "bugs": 4, "vulnerabilities": 1, "code_smells": 29, "coverage": 76.3},
    {"id": "cp-7", "project_key": "search-indexer", "name": "search-indexer", "quality_gate": "failed", "bugs": 9, "vulnerabilities": 3, "code_smells": 55, "coverage": 49.8},
    {"id": "cp-8", "project_key": "billing-engine", "name": "billing-engine", "quality_gate": "passed", "bugs": 2, "vulnerabilities": 1, "code_smells": 21, "coverage": 82.1},
]

CODE_ISSUES = [
    {"id": "ci-1", "project_key": "auth-gateway", "project_name": "auth-gateway", "rule_id": "javascript:S2068", "type": "VULNERABILITY", "severity": "blocker", "message": "Hardcoded credential detected in source.", "file_path": "src/auth/tokenService.js", "line_number": 42, "status": "OPEN", "effort": "30min"},
    {"id": "ci-2", "project_key": "auth-gateway", "project_name": "auth-gateway", "rule_id": "javascript:S5852", "type": "VULNERABILITY", "severity": "critical", "message": "Regular expression is vulnerable to catastrophic backtracking (ReDoS).", "file_path": "src/utils/validators.js", "line_number": 118, "status": "OPEN", "effort": "20min"},
    {"id": "ci-3", "project_key": "notification-worker", "project_name": "notification-worker", "rule_id": "python:S5445", "type": "BUG", "severity": "major", "message": "Using a predictable temp file name can lead to a race condition.", "file_path": "worker/email_sender.py", "line_number": 76, "status": "OPEN", "effort": "15min"},
    {"id": "ci-4", "project_key": "search-indexer", "project_name": "search-indexer", "rule_id": "java:S2095", "type": "BUG", "severity": "major", "message": "Resource leak: this connection is never closed.", "file_path": "com/corp/indexer/EsClient.java", "line_number": 203, "status": "OPEN", "effort": "10min"},
    {"id": "ci-5", "project_key": "search-indexer", "project_name": "search-indexer", "rule_id": "java:S3776", "type": "CODE_SMELL", "severity": "minor", "message": "Cognitive complexity of this method is too high (32, allowed 15).", "file_path": "com/corp/indexer/QueryBuilder.java", "line_number": 45, "status": "OPEN", "effort": "1h"},
    {"id": "ci-6", "project_key": "payments-service", "project_name": "payments-service", "rule_id": "python:S105", "type": "CODE_SMELL", "severity": "minor", "message": "Use of tab character in indentation is discouraged.", "file_path": "services/refunds.py", "line_number": 12, "status": "OPEN", "effort": "2min"},
    {"id": "ci-7", "project_key": "inventory-sync", "project_name": "inventory-sync", "rule_id": "go:S1192", "type": "CODE_SMELL", "severity": "minor", "message": "Define a constant instead of duplicating this literal 7 times.", "file_path": "internal/sync/reconcile.go", "line_number": 88, "status": "OPEN", "effort": "10min"},
    {"id": "ci-8", "project_key": "billing-engine", "project_name": "billing-engine", "rule_id": "java:S2077", "type": "VULNERABILITY", "severity": "critical", "message": "SQL query built with string concatenation is vulnerable to injection.", "file_path": "com/corp/billing/InvoiceDao.java", "line_number": 154, "status": "OPEN", "effort": "30min"},
    {"id": "ci-9", "project_key": "auth-gateway", "project_name": "auth-gateway", "rule_id": "javascript:S6299", "type": "VULNERABILITY", "severity": "major", "message": "JWT signature is not verified before decoding claims.", "file_path": "src/auth/jwtMiddleware.js", "line_number": 29, "status": "OPEN", "effort": "20min"},
    {"id": "ci-10", "project_key": "checkout-api", "project_name": "checkout-api", "rule_id": "python:S1481", "type": "CODE_SMELL", "severity": "info", "message": "Remove this unused local variable \"tmp_total\".", "file_path": "checkout/pricing.py", "line_number": 61, "status": "RESOLVED", "effort": "2min"},
    {"id": "ci-11", "project_key": "notification-worker", "project_name": "notification-worker", "rule_id": "python:S4830", "type": "VULNERABILITY", "severity": "critical", "message": "SSL certificate verification is disabled.", "file_path": "worker/http_client.py", "line_number": 15, "status": "OPEN", "effort": "5min"},
    {"id": "ci-12", "project_key": "search-indexer", "project_name": "search-indexer", "rule_id": "java:S1874", "type": "CODE_SMELL", "severity": "minor", "message": "Deprecated method should not be used.", "file_path": "com/corp/indexer/LegacyMapper.java", "line_number": 9, "status": "OPEN", "effort": "15min"},
]

PIPELINE_RUNS = [
    {"id": "p-1", "gitlab_project_id": "4021", "project": "payments-service", "ref": "main", "status": "passed", "started_at": "2026-07-15T08:00:00", "finished_at": "2026-07-15T08:11:00", "sast": 1, "dep_scan": 2, "secret_detection": 0, "findings": [{"cat": "SAST", "text": "Potential SQL injection in PaymentProcessor.java:88"}, {"cat": "Dependency", "text": "log4j-core 2.14.1 — CVE-2021-44228 (critical)"}, {"cat": "Dependency", "text": "openssl 3.0.6 — CVE-2022-3602 (high)"}], "web_url": "https://gitlab.com/acme-corp/payments-service/-/pipelines/100231"},
    {"id": "p-2", "gitlab_project_id": "4022", "project": "auth-gateway", "ref": "main", "status": "failed", "started_at": "2026-07-15T07:40:00", "finished_at": "2026-07-15T07:52:00", "sast": 4, "dep_scan": 3, "secret_detection": 1, "findings": [{"cat": "SAST", "text": "Hardcoded credential in tokenService.js:42"}, {"cat": "SAST", "text": "ReDoS vulnerability in validators.js:118"}, {"cat": "SAST", "text": "JWT not verified in jwtMiddleware.js:29"}, {"cat": "SAST", "text": "Prototype pollution risk in utils.js:55"}, {"cat": "Dependency", "text": "xz-utils 5.6.0 — CVE-2024-3094 (critical)"}, {"cat": "Dependency", "text": "curl 8.1.0 — CVE-2023-38545 (high)"}, {"cat": "Dependency", "text": "openssl 3.0.6 — CVE-2022-3602 (high)"}, {"cat": "Secrets", "text": "AWS access key found in .env.example"}], "web_url": "https://gitlab.com/acme-corp/auth-gateway/-/pipelines/100232", "failed_jobs": [{"stage": "test", "name": "sast", "failure_reason": "script_failure"}, {"stage": "test", "name": "secret_detection", "failure_reason": "script_failure"}]},
    {"id": "p-3", "gitlab_project_id": "4023", "project": "checkout-api", "ref": "release/3.0", "status": "passed", "started_at": "2026-07-15T06:15:00", "finished_at": "2026-07-15T06:29:00", "sast": 0, "dep_scan": 1, "secret_detection": 0, "findings": [{"cat": "Dependency", "text": "nghttp2 1.51.0 — CVE-2023-44487 (high)"}], "web_url": "https://gitlab.com/acme-corp/checkout-api/-/pipelines/100233"},
    {"id": "p-4", "gitlab_project_id": "4024", "project": "notification-worker", "ref": "main", "status": "failed", "started_at": "2026-07-14T22:10:00", "finished_at": "2026-07-14T22:24:00", "sast": 2, "dep_scan": 1, "secret_detection": 1, "findings": [{"cat": "SAST", "text": "SSL verification disabled in http_client.py:15"}, {"cat": "SAST", "text": "Predictable temp file in email_sender.py:76"}, {"cat": "Dependency", "text": "libwebp 1.2.4 — CVE-2023-4863 (critical)"}, {"cat": "Secrets", "text": "SMTP password in config/prod.yaml"}], "web_url": "https://gitlab.com/acme-corp/notification-worker/-/pipelines/100234", "failed_jobs": [{"stage": "test", "name": "sast", "failure_reason": "script_failure"}, {"stage": "test", "name": "secret_detection", "failure_reason": "script_failure"}]},
    {"id": "p-5", "gitlab_project_id": "4025", "project": "user-profile-svc", "ref": "main", "status": "passed", "started_at": "2026-07-14T19:05:00", "finished_at": "2026-07-14T19:18:00", "sast": 0, "dep_scan": 0, "secret_detection": 0, "findings": [], "web_url": "https://gitlab.com/acme-corp/user-profile-svc/-/pipelines/100235"},
    {"id": "p-6", "gitlab_project_id": "4026", "project": "inventory-sync", "ref": "feature/reconcile-v2", "status": "running", "started_at": "2026-07-15T09:02:00", "finished_at": None, "sast": 0, "dep_scan": 0, "secret_detection": 0, "findings": [], "web_url": "https://gitlab.com/acme-corp/inventory-sync/-/pipelines/100236"},
    {"id": "p-7", "gitlab_project_id": "4027", "project": "search-indexer", "ref": "main", "status": "failed", "started_at": "2026-07-14T16:30:00", "finished_at": "2026-07-14T16:50:00", "sast": 3, "dep_scan": 4, "secret_detection": 0, "findings": [{"cat": "SAST", "text": "Resource leak in EsClient.java:203"}, {"cat": "SAST", "text": "Unchecked null dereference in QueryBuilder.java:112"}, {"cat": "SAST", "text": "Deprecated API usage in LegacyMapper.java:9"}, {"cat": "Dependency", "text": "xz-utils 5.6.1 — CVE-2024-3094 (critical)"}, {"cat": "Dependency", "text": "curl 8.3.0 — CVE-2023-38545 (high)"}, {"cat": "Dependency", "text": "libwebp 1.3.0 — CVE-2023-4863 (critical)"}, {"cat": "Dependency", "text": "minizip 1.2.11 — CVE-2023-45853 (medium)"}], "web_url": "https://gitlab.com/acme-corp/search-indexer/-/pipelines/100237", "failed_jobs": [{"stage": "test", "name": "sast", "failure_reason": "script_failure"}, {"stage": "test", "name": "dependency_scanning", "failure_reason": "script_failure"}]},
    {"id": "p-8", "gitlab_project_id": "4028", "project": "billing-engine", "ref": "main", "status": "passed", "started_at": "2026-07-14T14:00:00", "finished_at": "2026-07-14T14:14:00", "sast": 1, "dep_scan": 0, "secret_detection": 0, "findings": [{"cat": "SAST", "text": "SQL injection risk in InvoiceDao.java:154"}], "web_url": "https://gitlab.com/acme-corp/billing-engine/-/pipelines/100238"},
    {"id": "p-9", "gitlab_project_id": "4029", "project": "email-dispatcher", "ref": "main", "status": "passed", "started_at": "2026-07-14T11:22:00", "finished_at": "2026-07-14T11:31:00", "sast": 0, "dep_scan": 1, "secret_detection": 0, "findings": [{"cat": "Dependency", "text": "requests 2.28.2 — CVE-2023-32681 (medium)"}], "web_url": "https://gitlab.com/acme-corp/email-dispatcher/-/pipelines/100239"},
    {"id": "p-10", "gitlab_project_id": "4030", "project": "fraud-detection", "ref": "main", "status": "failed", "started_at": "2026-07-13T20:05:00", "finished_at": "2026-07-13T20:19:00", "sast": 2, "dep_scan": 2, "secret_detection": 2, "findings": [{"cat": "SAST", "text": "Insecure deserialization in ModelLoader.java:67"}, {"cat": "SAST", "text": "Command injection risk in RuleEngine.java:201"}, {"cat": "Dependency", "text": "log4j-core 2.13.3 — CVE-2021-44228 (critical)"}, {"cat": "Dependency", "text": "libwebp 1.3.0 — CVE-2023-4863 (critical)"}, {"cat": "Secrets", "text": "Stripe API key in src/payments/config.js"}, {"cat": "Secrets", "text": "Database password in docker-compose.override.yml"}], "web_url": "https://gitlab.com/acme-corp/fraud-detection/-/pipelines/100240", "failed_jobs": [{"stage": "test", "name": "sast", "failure_reason": "script_failure"}, {"stage": "test", "name": "secret_detection", "failure_reason": "script_failure"}]},
]

SERVICES = [
    {"id": "svc-1", "name": "payments-service", "image_name": "payments-service", "code_project_key": "payments-service", "pipeline_project": "payments-service"},
    {"id": "svc-2", "name": "auth-gateway", "image_name": "auth-gateway", "code_project_key": "auth-gateway", "pipeline_project": "auth-gateway"},
    {"id": "svc-3", "name": "checkout-api", "image_name": "checkout-api", "code_project_key": "checkout-api", "pipeline_project": "checkout-api"},
    {"id": "svc-4", "name": "notification-worker", "image_name": "notification-worker", "code_project_key": "notification-worker", "pipeline_project": "notification-worker"},
    {"id": "svc-5", "name": "user-profile-svc", "image_name": "user-profile-svc", "code_project_key": "user-profile-svc", "pipeline_project": "user-profile-svc"},
    {"id": "svc-6", "name": "inventory-sync", "image_name": "inventory-sync", "code_project_key": "inventory-sync", "pipeline_project": "inventory-sync"},
    {"id": "svc-7", "name": "search-indexer", "image_name": "search-indexer", "code_project_key": "search-indexer", "pipeline_project": "search-indexer"},
    {"id": "svc-8", "name": "billing-engine", "image_name": "billing-engine", "code_project_key": "billing-engine", "pipeline_project": "billing-engine"},
]

SYNC_JOBS = [
    {"id": "sj-1", "tool": "jfrog", "status": "success", "started_at": "2026-07-15T09:28:00", "finished_at": "2026-07-15T09:30:00", "records_synced": 412, "error_message": None},
    {"id": "sj-2", "tool": "sonarqube", "status": "success", "started_at": "2026-07-15T09:28:00", "finished_at": "2026-07-15T09:30:00", "records_synced": 96, "error_message": None},
    {"id": "sj-3", "tool": "prisma", "status": "failed", "started_at": "2026-07-15T07:00:00", "finished_at": "2026-07-15T07:00:05", "records_synced": 0, "error_message": "Authentication failed: check PRISMA_ACCESS_KEY and PRISMA_SECRET_KEY"},
    {"id": "sj-4", "tool": "gitlab", "status": "success", "started_at": "2026-07-15T09:13:00", "finished_at": "2026-07-15T09:15:00", "records_synced": 210, "error_message": None},
    {"id": "sj-5", "tool": "dependency_track", "status": "success", "started_at": "2026-07-15T09:28:00", "finished_at": "2026-07-15T09:29:00", "records_synced": 2, "error_message": None},
]

DEPENDENCY_TRACK_PROJECTS = [
    {"id": "dtp-1", "name": "webhook-relay", "version": "1.0.0"},
]

DT_VULNERABILITIES = [
    {"id": "dt-seed-1", "dt_project_id": "dtp-1", "cve_id": "CVE-2021-44228", "severity": "critical",
     "package_name": "log4j-core", "installed_version": "2.14.1", "fixed_version": "2.17.1",
     "cvss_score": 10.0, "description": "Log4Shell — remote code execution via JNDI lookup in log message rendering.",
     "source_tool": "dependency_track", "status": "open"},
]


def seed():
    init_db()
    db = SessionLocal()

    try:
        bootstrap_admin(db)  # unconditional, idempotent — must run even if demo data is
                              # already seeded, so this sits before the early-return below

        has_images = db.query(Image).count() > 0
        has_packages = db.query(ImagePackage).count() > 0

        if has_images and has_packages:
            print("Database already seeded. Skipping.")
            return

        if not has_images:
          print("Seeding images...")
        if not has_images:
          for d in IMAGES:
            db.add(Image(
                id=d["id"], name=d["name"], tag=d["tag"], registry=d["registry"],
                digest=d["digest"], size_mb=d["size_mb"],
                pushed_at=datetime.fromisoformat(d["pushed_at"]),
                last_scanned_at=datetime.fromisoformat(d["last_scanned_at"]),
                source=d["source"], is_seed=True,
            ))

        print("Seeding vulnerabilities...")
        for d in VULNERABILITIES:
            db.add(Vulnerability(
                id=d["id"], image_id=d["image_id"], cve_id=d["cve_id"],
                severity=d["severity"], package_name=d["package_name"],
                installed_version=d["installed_version"], fixed_version=d["fixed_version"],
                cvss_score=d["cvss_score"], description=d["description"],
                source_tool=d["source_tool"], status=d["status"], is_seed=True,
            ))

        print("Seeding Dependency-Track projects...")
        for d in DEPENDENCY_TRACK_PROJECTS:
            db.add(DependencyTrackProject(
                id=d["id"], name=d["name"], version=d["version"],
                last_synced_at=datetime.utcnow(), is_seed=True,
            ))

        print("Seeding Dependency-Track vulnerabilities...")
        for d in DT_VULNERABILITIES:
            db.add(Vulnerability(
                id=d["id"], image_id=None, dt_project_id=d["dt_project_id"], cve_id=d["cve_id"],
                severity=d["severity"], package_name=d["package_name"],
                installed_version=d["installed_version"], fixed_version=d["fixed_version"],
                cvss_score=d["cvss_score"], description=d["description"],
                source_tool=d["source_tool"], status=d["status"], is_seed=True,
            ))

        print("Seeding fix suggestions...")
        for d in FIX_SUGGESTIONS:
            db.add(FixSuggestion(
                id=d["id"], cve_id=d["cve_id"], suggestion_text=d["suggestion_text"],
                copy_cmd=d["copy_cmd"], advisory_url=d["advisory_url"],
                published=d["published"], cvss_vector=d["cvss_vector"],
            ))

        print("Seeding code projects...")
        for d in CODE_PROJECTS:
            db.add(CodeProject(
                id=d["id"], project_key=d["project_key"], name=d["name"],
                quality_gate=d["quality_gate"], bugs=d["bugs"],
                vulnerabilities=d["vulnerabilities"], code_smells=d["code_smells"],
                coverage=d["coverage"], is_seed=True,
            ))

        print("Seeding code issues...")
        for d in CODE_ISSUES:
            db.add(CodeIssue(
                id=d["id"], project_key=d["project_key"], project_name=d["project_name"],
                rule_id=d["rule_id"], type=d["type"], severity=d["severity"],
                message=d["message"], file_path=d["file_path"],
                line_number=d["line_number"], status=d["status"], effort=d["effort"], is_seed=True,
            ))

        print("Seeding pipeline runs...")
        for d in PIPELINE_RUNS:
            db.add(PipelineRun(
                id=d["id"], gitlab_project_id=d["gitlab_project_id"],
                project=d["project"], ref=d["ref"], status=d["status"],
                started_at=datetime.fromisoformat(d["started_at"]) if d["started_at"] else None,
                finished_at=datetime.fromisoformat(d["finished_at"]) if d["finished_at"] else None,
                sast=d["sast"], dep_scan=d["dep_scan"],
                secret_detection=d["secret_detection"], findings=d["findings"],
                web_url=d.get("web_url"), failed_jobs=d.get("failed_jobs", []), is_seed=True,
            ))

        print("Seeding image packages...")
        PACKAGES = [
            # JFrog images
            {"id": "pkg-1",  "image_id": "img-1",  "name": "openssl",      "version": "3.0.6",   "pkg_type": "deb", "license": "Apache-2.0",  "source_tool": "jfrog"},
            {"id": "pkg-2",  "image_id": "img-1",  "name": "curl",         "version": "8.1.0",   "pkg_type": "deb", "license": "MIT",         "source_tool": "jfrog"},
            {"id": "pkg-3",  "image_id": "img-1",  "name": "log4j-core",   "version": "2.14.1",  "pkg_type": "jar", "license": "Apache-2.0",  "source_tool": "jfrog"},
            {"id": "pkg-4",  "image_id": "img-1",  "name": "python3.11",   "version": "3.11.4",  "pkg_type": "deb", "license": "PSF",         "source_tool": "jfrog"},
            {"id": "pkg-5",  "image_id": "img-1",  "name": "alpine-base",  "version": "3.18.0",  "pkg_type": "apk", "license": "MIT",         "source_tool": "jfrog"},
            {"id": "pkg-6",  "image_id": "img-2",  "name": "xz-utils",     "version": "5.6.0",   "pkg_type": "deb", "license": "GPL-2.0",     "source_tool": "jfrog"},
            {"id": "pkg-7",  "image_id": "img-2",  "name": "curl",         "version": "8.1.0",   "pkg_type": "deb", "license": "MIT",         "source_tool": "jfrog"},
            {"id": "pkg-8",  "image_id": "img-2",  "name": "openssl",      "version": "3.0.6",   "pkg_type": "deb", "license": "Apache-2.0",  "source_tool": "jfrog"},
            {"id": "pkg-9",  "image_id": "img-2",  "name": "node",         "version": "20.0.0",  "pkg_type": "deb", "license": "MIT",         "source_tool": "jfrog"},
            # Prisma images
            {"id": "pkg-10", "image_id": "img-3",  "name": "nghttp2",      "version": "1.51.0",  "pkg_type": "deb", "license": "MIT",         "source_tool": "prisma"},
            {"id": "pkg-11", "image_id": "img-3",  "name": "runc",         "version": "1.1.5",   "pkg_type": "rpm", "license": "Apache-2.0",  "source_tool": "prisma"},
            {"id": "pkg-12", "image_id": "img-3",  "name": "python3.10",   "version": "3.10.12", "pkg_type": "deb", "license": "PSF",         "source_tool": "prisma"},
            {"id": "pkg-13", "image_id": "img-3",  "name": "glibc",        "version": "2.35",    "pkg_type": "deb", "license": "LGPL-2.1",   "source_tool": "prisma"},
            {"id": "pkg-14", "image_id": "img-4",  "name": "libwebp",      "version": "1.2.4",   "pkg_type": "deb", "license": "BSD-3",       "source_tool": "prisma"},
            {"id": "pkg-15", "image_id": "img-4",  "name": "openssl",      "version": "1.1.1l",  "pkg_type": "deb", "license": "OpenSSL",     "source_tool": "prisma"},
            {"id": "pkg-16", "image_id": "img-4",  "name": "busybox",      "version": "1.36.1",  "pkg_type": "apk", "license": "GPL-2.0",    "source_tool": "prisma"},
            {"id": "pkg-17", "image_id": "img-5",  "name": "requests",     "version": "2.29.0",  "pkg_type": "pip", "license": "Apache-2.0",  "source_tool": "jfrog"},
            {"id": "pkg-18", "image_id": "img-5",  "name": "sqlite3",      "version": "3.26.0",  "pkg_type": "deb", "license": "Public Dom.", "source_tool": "jfrog"},
            {"id": "pkg-19", "image_id": "img-5",  "name": "python3.11",   "version": "3.11.4",  "pkg_type": "deb", "license": "PSF",         "source_tool": "jfrog"},
            {"id": "pkg-20", "image_id": "img-6",  "name": "minizip",      "version": "1.2.11",  "pkg_type": "deb", "license": "zlib",        "source_tool": "prisma"},
            {"id": "pkg-21", "image_id": "img-6",  "name": "glibc",        "version": "2.35",    "pkg_type": "deb", "license": "LGPL-2.1",   "source_tool": "prisma"},
            {"id": "pkg-22", "image_id": "img-7",  "name": "xz-utils",     "version": "5.6.1",   "pkg_type": "deb", "license": "GPL-2.0",    "source_tool": "jfrog"},
            {"id": "pkg-23", "image_id": "img-7",  "name": "libwebp",      "version": "1.2.4",   "pkg_type": "deb", "license": "BSD-3",       "source_tool": "jfrog"},
            {"id": "pkg-24", "image_id": "img-7",  "name": "node",         "version": "20.0.0",  "pkg_type": "deb", "license": "MIT",         "source_tool": "jfrog"},
            {"id": "pkg-25", "image_id": "img-8",  "name": "openssl",      "version": "3.0.6",   "pkg_type": "deb", "license": "Apache-2.0",  "source_tool": "prisma"},
            {"id": "pkg-26", "image_id": "img-8",  "name": "minizip",      "version": "1.2.12",  "pkg_type": "deb", "license": "zlib",        "source_tool": "prisma"},
            {"id": "pkg-27", "image_id": "img-9",  "name": "requests",     "version": "2.28.2",  "pkg_type": "pip", "license": "Apache-2.0",  "source_tool": "jfrog"},
            {"id": "pkg-28", "image_id": "img-9",  "name": "python3.11",   "version": "3.11.4",  "pkg_type": "deb", "license": "PSF",         "source_tool": "jfrog"},
            {"id": "pkg-29", "image_id": "img-10", "name": "log4j-core",   "version": "2.13.3",  "pkg_type": "jar", "license": "Apache-2.0",  "source_tool": "prisma"},
            {"id": "pkg-30", "image_id": "img-10", "name": "libwebp",      "version": "1.3.0",   "pkg_type": "deb", "license": "BSD-3",       "source_tool": "prisma"},
            {"id": "pkg-31", "image_id": "img-10", "name": "glibc",        "version": "2.35",    "pkg_type": "deb", "license": "LGPL-2.1",   "source_tool": "prisma"},
            {"id": "pkg-32", "image_id": "img-11", "name": "sqlite3",      "version": "3.27.0",  "pkg_type": "deb", "license": "Public Dom.", "source_tool": "jfrog"},
            {"id": "pkg-33", "image_id": "img-11", "name": "alpine-base",  "version": "3.18.0",  "pkg_type": "apk", "license": "MIT",         "source_tool": "jfrog"},
            {"id": "pkg-34", "image_id": "img-12", "name": "curl",         "version": "8.0.1",   "pkg_type": "deb", "license": "MIT",         "source_tool": "prisma"},
            {"id": "pkg-35", "image_id": "img-12", "name": "minizip",      "version": "1.2.12",  "pkg_type": "deb", "license": "zlib",        "source_tool": "prisma"},
            {"id": "pkg-36", "image_id": "img-12", "name": "busybox",      "version": "1.36.1",  "pkg_type": "apk", "license": "GPL-2.0",    "source_tool": "prisma"},
        ]
        for d in PACKAGES:
            db.add(ImagePackage(
                id=d["id"], image_id=d["image_id"], name=d["name"],
                version=d["version"], pkg_type=d["pkg_type"],
                license=d["license"], source_tool=d["source_tool"],
            ))

        print("Seeding sync jobs...")
        for d in SYNC_JOBS:
            db.add(SyncJob(
                id=d["id"], tool=d["tool"], status=d["status"],
                started_at=datetime.fromisoformat(d["started_at"]),
                finished_at=datetime.fromisoformat(d["finished_at"]),
                records_synced=d["records_synced"], error_message=d["error_message"],
            ))

        print("Seeding services...")
        for d in SERVICES:
            db.add(Service(
                id=d["id"], name=d["name"], image_name=d["image_name"],
                code_project_key=d["code_project_key"], pipeline_project=d["pipeline_project"],
                is_seed=True, created_at=datetime.utcnow(),
            ))

        db.commit()
        print(f"Seeded: {len(IMAGES)} images, {len(VULNERABILITIES)} vulns, {len(FIX_SUGGESTIONS)} fixes, "
              f"{len(CODE_PROJECTS)} projects, {len(CODE_ISSUES)} issues, {len(PIPELINE_RUNS)} pipelines, "
              f"{len(SYNC_JOBS)} sync jobs, {len(PACKAGES)} packages, {len(SERVICES)} services")

    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    seed()
