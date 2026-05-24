"""Thin email sending wrapper using Resend (https://resend.com).

Free tier: 3,000 emails/month, no credit card needed.
All calls are fire-and-forget; failures are logged but never raised to callers.

Set RESEND_API_KEY in your .env / Railway environment variables.
If the key is absent, sending is silently skipped (safe for local dev).

Required env vars:
  RESEND_API_KEY   — from resend.com/api-keys
  EMAIL_FROM       — verified sender address, e.g. "hello@yourdomain.com"
                     or "Group Holiday <noreply@yourdomain.com>"
                     Defaults to: "Group Holiday <onboarding@resend.dev>"
                     (works for testing, recipients must be your own verified email)
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import httpx

log = logging.getLogger("email")

RESEND_API = "https://api.resend.com/emails"


def send_email(
    to: str,
    subject: str,
    html: str,
    from_addr: Optional[str] = None,
) -> bool:
    """Send a single transactional email via Resend. Returns True on success."""
    api_key = os.getenv("RESEND_API_KEY", "")
    if not api_key:
        log.debug("RESEND_API_KEY not set — skipping email to %s", to)
        return False

    sender = from_addr or os.getenv(
        "EMAIL_FROM", "Group Holiday <onboarding@resend.dev>"
    )

    try:
        with httpx.Client(timeout=10) as client:
            r = client.post(
                RESEND_API,
                headers={"Authorization": f"Bearer {api_key}"},
                json={"from": sender, "to": [to], "subject": subject, "html": html},
            )
            r.raise_for_status()
            log.info("Email sent to %s (id=%s)", to, r.json().get("id"))
            return True
    except Exception as exc:  # noqa: BLE001
        log.warning("Failed to send email to %s: %s", to, exc)
        return False


# ── Template helpers ──────────────────────────────────────────────────────────

def availability_complete_email(
    admin_name: str,
    room_name: str,
    room_slug: str,
    member_count: int,
    app_url: str,
) -> tuple[str, str]:
    """Return (subject, html) for the 'all availability submitted' notification."""
    room_url = f"{app_url}/room/{room_slug}"
    subject = f"🎉 All {member_count} members have submitted availability — {room_name}"
    html = f"""
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1d4ed8;">✈️ Group Holiday</h2>
      <h3 style="color: #111827;">Everyone's availability is in!</h3>
      <p style="color: #374151;">
        Hi {admin_name},<br><br>
        All <strong>{member_count} members</strong> of <strong>{room_name}</strong> have
        submitted their availability. You can now view the free windows and advance
        to the next planning step.
      </p>
      <a href="{room_url}"
         style="display:inline-block; margin-top:16px; padding:12px 24px;
                background:#2563eb; color:#fff; border-radius:10px;
                text-decoration:none; font-weight:600;">
        View availability →
      </a>
      <p style="color:#9ca3af; font-size:12px; margin-top:32px;">
        Group Holiday · <a href="{app_url}" style="color:#9ca3af;">groupholiday.app</a>
      </p>
    </div>
    """
    return subject, html


def member_joined_email(
    admin_name: str,
    member_name: str,
    room_name: str,
    room_slug: str,
    member_count: int,
    app_url: str,
) -> tuple[str, str]:
    """Return (subject, html) for the 'new member joined' notification sent to the admin."""
    room_url = f"{app_url}/room/{room_slug}"
    subject = f"🙋 {member_name} just joined {room_name}!"
    html = f"""
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1d4ed8;">✈️ Group Holiday</h2>
      <h3 style="color: #111827;">New member joined!</h3>
      <p style="color: #374151;">
        Hi {admin_name},<br><br>
        <strong>{member_name}</strong> has just joined <strong>{room_name}</strong>.
        You now have <strong>{member_count} member{'' if member_count == 1 else 's'}</strong> in the group.
      </p>
      <a href="{room_url}"
         style="display:inline-block; margin-top:16px; padding:12px 24px;
                background:#2563eb; color:#fff; border-radius:10px;
                text-decoration:none; font-weight:600;">
        View your Holiday →
      </a>
      <p style="color:#9ca3af; font-size:12px; margin-top:32px;">
        Group Holiday · <a href="{app_url}" style="color:#9ca3af;">groupholiday.app</a>
      </p>
    </div>
    """
    return subject, html


def availability_reminder_email(
    member_name: str,
    room_name: str,
    room_slug: str,
    admin_name: str,
    app_url: str,
) -> tuple[str, str]:
    """Return (subject, html) for the 'please submit your availability' reminder."""
    room_url = f"{app_url}/room/{room_slug}/availability"
    subject = f"⏳ Reminder: please submit your availability for {room_name}"
    html = f"""
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1d4ed8;">✈️ Group Holiday</h2>
      <h3 style="color: #111827;">Don't forget to submit your availability!</h3>
      <p style="color: #374151;">
        Hi {member_name},<br><br>
        <strong>{admin_name}</strong> is waiting for you to submit your availability
        for <strong>{room_name}</strong>. The group can't see the free windows until
        everyone has submitted — so the sooner you do it, the sooner you can all start
        planning!
      </p>
      <a href="{room_url}"
         style="display:inline-block; margin-top:16px; padding:12px 24px;
                background:#2563eb; color:#fff; border-radius:10px;
                text-decoration:none; font-weight:600;">
        Submit availability →
      </a>
      <p style="color:#9ca3af; font-size:12px; margin-top:32px;">
        Group Holiday · <a href="{app_url}" style="color:#9ca3af;">groupholiday.app</a>
      </p>
    </div>
    """
    return subject, html


def step_advance_email(
    member_name: str,
    room_name: str,
    room_slug: str,
    new_step: str,
    app_url: str,
) -> tuple[str, str] | None:
    """Return (subject, html) for a step-advance notification, or None if we
    don't send a notification for this particular step transition.

    Covers: duration, destination, booking.
    Skips: availability (handled by availability_complete_email),
           flights (handled by flights_ready_email), done.
    """
    room_url = f"{app_url}/room/{room_slug}"

    if new_step == "duration":
        subject = f"📅 Dates are locked in for {room_name} — submit your trip length"
        cta_label = "Set trip length →"
        cta_url = f"{room_url}/preferences"
        body = (
            f"Hi {member_name},<br><br>"
            f"The admin has locked in travel dates for <strong>{room_name}</strong>. "
            f"Please submit your preferred trip length (minimum and maximum nights) "
            f"so the group can agree on a duration."
        )
    elif new_step == "destination":
        subject = f"🗺️ Time to vote on destinations for {room_name}!"
        cta_label = "Vote on destinations →"
        cta_url = f"{room_url}/destinations"
        body = (
            f"Hi {member_name},<br><br>"
            f"Duration and budget are agreed for <strong>{room_name}</strong>. "
            f"It's now time to vote on where you'd like to go — head to the "
            f"destinations page to answer a quick questionnaire and cast your votes."
        )
    elif new_step == "booking":
        subject = f"✈️ Flight results are ready for {room_name} — time to book!"
        cta_label = "View booking options →"
        cta_url = f"{room_url}/booking"
        body = (
            f"Hi {member_name},<br><br>"
            f"The flight search for <strong>{room_name}</strong> is done and the "
            f"admin has moved you to the booking step. Head to the booking page to "
            f"see your personalised flight link and accommodation options."
        )
    else:
        return None

    html = f"""
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1d4ed8;">✈️ Group Holiday</h2>
      <p style="color: #374151;">{body}</p>
      <a href="{cta_url}"
         style="display:inline-block; margin-top:16px; padding:12px 24px;
                background:#2563eb; color:#fff; border-radius:10px;
                text-decoration:none; font-weight:600;">
        {cta_label}
      </a>
      <p style="color:#9ca3af; font-size:12px; margin-top:32px;">
        Group Holiday · <a href="{app_url}" style="color:#9ca3af;">groupholiday.app</a>
      </p>
    </div>
    """
    return subject, html


def flights_ready_email(
    member_name: str,
    room_name: str,
    room_slug: str,
    best_dest_name: str,
    best_avg_cost: float,
    app_url: str,
) -> tuple[str, str]:
    """Return (subject, html) for the 'flight results are ready' notification.

    Sent to every group member (except the admin who triggered the run).
    """
    flights_url = f"{app_url}/room/{room_slug}/flights"
    subject = f"✈️ Flight results are in for {room_name}!"
    html = f"""
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1d4ed8;">✈️ Group Holiday</h2>
      <h3 style="color: #111827;">Your flight results are ready!</h3>
      <p style="color: #374151;">
        Hi {member_name},<br><br>
        The admin has run the flight search for <strong>{room_name}</strong>.
        The top result is <strong>{best_dest_name}</strong> at approximately
        <strong>£{best_avg_cost:.0f} per person</strong> (flights only).
      </p>
      <a href="{flights_url}"
         style="display:inline-block; margin-top:16px; padding:12px 24px;
                background:#2563eb; color:#fff; border-radius:10px;
                text-decoration:none; font-weight:600;">
        View flight options →
      </a>
      <p style="color:#9ca3af; font-size:12px; margin-top:32px;">
        Group Holiday · <a href="{app_url}" style="color:#9ca3af;">groupholiday.app</a>
      </p>
    </div>
    """
    return subject, html


def member_welcome_email(
    member_name: str,
    room_name: str,
    room_slug: str,
    current_step: str,
    app_url: str,
) -> tuple[str, str]:
    """Return (subject, html) welcoming a new member to a Holiday room.

    Sent to the joining member to confirm the join and give them a direct
    link to what they need to do next in the planning flow.
    """
    room_url = f"{app_url}/room/{room_slug}"
    step_cta: dict[str, tuple[str, str]] = {
        "availability": ("📅 Submit your availability", f"{room_url}/availability"),
        "duration": ("🗓️ Set your trip length", f"{room_url}/preferences"),
        "budget": ("💷 Set your budget", f"{room_url}/preferences"),
        "destination": ("🗺️ Vote on destinations", f"{room_url}/destinations"),
        "flights": ("✈️ View flight options", f"{room_url}/flights"),
        "booking": ("🎫 View booking details", f"{room_url}/booking"),
    }
    cta_label, cta_url = step_cta.get(current_step, ("View the Holiday", room_url))

    subject = f"✈️ You've joined {room_name}!"
    html = f"""
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1d4ed8;">✈️ Group Holiday</h2>
      <h3 style="color: #111827;">Welcome to {room_name}!</h3>
      <p style="color: #374151;">
        Hi {member_name},<br><br>
        You've successfully joined <strong>{room_name}</strong> on Group Holiday.
        The group is currently at the <strong>{current_step}</strong> step &mdash;
        click below to get started.
      </p>
      <a href="{cta_url}"
         style="display:inline-block; margin-top:16px; padding:12px 24px;
                background:#2563eb; color:#fff; border-radius:10px;
                text-decoration:none; font-weight:600;">
        {cta_label}
      </a>
      <p style="color:#374151; margin-top:20px; font-size:14px;">
        You can return to the Holiday any time at:<br>
        <a href="{room_url}" style="color:#2563eb;">{room_url}</a>
      </p>
      <p style="color:#9ca3af; font-size:12px; margin-top:32px;">
        Group Holiday &middot; <a href="{app_url}" style="color:#9ca3af;">groupholiday.app</a>
      </p>
    </div>
    """
    return subject, html
