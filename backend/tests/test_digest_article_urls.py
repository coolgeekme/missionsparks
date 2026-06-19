"""Verifies the curated article URLs in digest_articles.py all return 200.

Iter 19.2 regression: a parent reported a 404 when clicking an article link in
their digest email. 5 of 12 URLs had silently rotted. This test catches that.

Marked as network-dependent and skipped when there's no outbound internet so it
doesn't break CI on disconnected runners.
"""
import os
import socket
import sys

import pytest
import requests

sys.path.insert(0, "/app/backend")
from digest_articles import CURATED_ARTICLES  # noqa: E402


def _internet_ok() -> bool:
    try:
        socket.create_connection(("8.8.8.8", 53), timeout=2).close()
        return True
    except OSError:
        return False


pytestmark = pytest.mark.skipif(
    not _internet_ok() or os.environ.get("SKIP_NETWORK_TESTS") == "1",
    reason="no internet — skipping live article URL checks",
)


@pytest.mark.parametrize("article", CURATED_ARTICLES, ids=lambda a: a["id"])
def test_curated_article_url_is_alive(article):
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (compatible; MissionSparksLinkCheck/1.0)"
        ),
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
    }
    # HEAD is unreliable on many sites — use a small GET with redirects.
    try:
        resp = requests.get(
            article["url"], headers=headers, timeout=12, allow_redirects=True
        )
    except requests.RequestException as exc:
        pytest.fail(f"Network error fetching {article['url']}: {exc}")
    assert resp.status_code < 400, (
        f"Article '{article['id']}' URL {article['url']} returned "
        f"{resp.status_code}. Replace it in digest_articles.py."
    )
