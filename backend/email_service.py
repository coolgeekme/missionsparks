"""Resend-powered transactional email helpers for MissionSparks.

All public functions are safe to call from async FastAPI handlers — they fan
the synchronous Resend SDK call out to a worker thread so the event loop is
never blocked, and they never raise on failure (we log instead, since email
is best-effort: the in-app invite link is always the source of truth)."""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Optional

import resend

logger = logging.getLogger(__name__)

# Lazy-configured: the API key is only read once at first send so tests can
# stub it out by setting the env var before importing.
_CONFIGURED = False


def _configure_if_needed() -> bool:
    global _CONFIGURED
    if _CONFIGURED:
        return bool(resend.api_key)
    key = os.environ.get("RESEND_API_KEY") or ""
    if not key:
        logger.warning("RESEND_API_KEY not set — emails will be no-ops.")
        _CONFIGURED = True
        return False
    resend.api_key = key
    _CONFIGURED = True
    return True


def _from_address() -> str:
    name = os.environ.get("RESEND_FROM_NAME") or "MissionSparks"
    email = os.environ.get("RESEND_FROM_EMAIL") or "onboarding@resend.dev"
    return f"{name} <{email}>"


def _escape(s: Optional[str]) -> str:
    if not s:
        return ""
    return (
        s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
         .replace('"', "&quot;").replace("'", "&#39;")
    )


def _send_sync(to: str, subject: str, html: str, text: str) -> Optional[str]:
    """Blocking send. Returns Resend message ID on success, None on failure."""
    if not _configure_if_needed():
        return None
    try:
        params = {
            "from": _from_address(),
            "to": [to],
            "subject": subject,
            "html": html,
            "text": text,
        }
        resp = resend.Emails.send(params)
        # Resend returns dict-like; "id" present on success
        return resp.get("id") if isinstance(resp, dict) else None
    except Exception as e:  # noqa: BLE001 — email is best-effort
        logger.warning("Resend send failed for %s: %s", to, e)
        return None


async def send_email(to: str, subject: str, html: str, text: str) -> Optional[str]:
    """Non-blocking wrapper. Never raises."""
    return await asyncio.to_thread(_send_sync, to, subject, html, text)


def _invite_html(family_name: str, role: str, inviter_name: Optional[str],
                 invite_url: str, expires_at_human: str) -> str:
    role_label = "co-parent" if role == "co_parent" else "viewer"
    inviter = _escape(inviter_name) if inviter_name else "Someone"
    fam = _escape(family_name)
    role_desc = (
        "create &amp; edit missions, moments, and mini-game packs"
        if role == "co_parent"
        else "view your kid's progress (read-only — perfect for grandparents, therapists or tutors)"
    )
    return f"""\
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0B132B;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#ffffff;border-radius:24px;border:2px solid #E2E8F0;overflow:hidden;">
          <tr>
            <td style="padding:32px 32px 12px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#4361EE;border-radius:14px;width:48px;height:48px;text-align:center;vertical-align:middle;color:#ffffff;font-size:22px;font-weight:900;line-height:48px;">⚡</td>
                  <td style="padding-left:12px;font-size:22px;font-weight:900;color:#0B132B;">MissionSparks</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 0 32px;">
              <p style="font-size:12px;text-transform:uppercase;letter-spacing:0.12em;color:#A0AEC0;font-weight:700;margin:16px 0 4px;">You&#39;re invited</p>
              <h1 style="font-size:28px;line-height:1.2;color:#0B132B;font-weight:900;margin:0 0 8px;">Join {fam}</h1>
              <p style="font-size:16px;line-height:1.5;color:#4A5568;font-weight:600;margin:0 0 20px;">
                {inviter} invited you to be a <strong style="color:#0B132B;">{role_label}</strong> on MissionSparks. As a {role_label}, you can {role_desc}.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 32px 12px 32px;">
              <a href="{invite_url}" style="display:inline-block;background:#4361EE;color:#ffffff;text-decoration:none;font-weight:800;font-size:16px;padding:14px 28px;border-radius:16px;box-shadow:0 4px 0 0 #3A53CC;">Accept invite →</a>
            </td>
          </tr>
          <tr>
            <td style="padding:4px 32px 4px 32px;">
              <p style="font-size:12px;color:#A0AEC0;font-weight:600;margin:8px 0 4px;text-align:center;">
                Or paste this link into your browser:
              </p>
              <p style="font-size:12px;color:#4361EE;font-weight:700;margin:0 0 8px;text-align:center;word-break:break-all;">
                <a href="{invite_url}" style="color:#4361EE;text-decoration:underline;">{invite_url}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 32px 32px;border-top:1px solid #E2E8F0;">
              <p style="font-size:12px;color:#A0AEC0;font-weight:600;margin:12px 0 0;line-height:1.5;">
                This invite expires on <strong>{_escape(expires_at_human)}</strong>. If you didn&#39;t expect this email, you can safely ignore it.
              </p>
              <p style="font-size:11px;color:#CBD5E0;font-weight:600;margin:8px 0 0;">
                MissionSparks helps families with ADHD-friendly missions, kid-led progress and research-backed practice.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _invite_text(family_name: str, role: str, inviter_name: Optional[str],
                 invite_url: str, expires_at_human: str) -> str:
    inviter = inviter_name or "Someone"
    role_label = "co-parent" if role == "co_parent" else "viewer"
    return (
        f"{inviter} invited you to join {family_name} on MissionSparks as a {role_label}.\n\n"
        f"Accept the invite here:\n{invite_url}\n\n"
        f"This invite expires on {expires_at_human}. If you didn't expect this email, ignore it."
    )


async def send_family_invite_email(
    *,
    to: str,
    family_name: str,
    role: str,
    inviter_name: Optional[str],
    invite_url: str,
    expires_at_human: str,
) -> Optional[str]:
    subject = f"You're invited to join {family_name} on MissionSparks"
    html = _invite_html(family_name, role, inviter_name, invite_url, expires_at_human)
    text = _invite_text(family_name, role, inviter_name, invite_url, expires_at_human)
    return await send_email(to, subject, html, text)
