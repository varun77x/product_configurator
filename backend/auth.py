"""
auth.py
=======
Frontend-only OTP-based authentication for the UniVicoustic configurator.

Flow per product decision:
  • Register: email → OTP sent (or printed to console in dev) → user enters
    the 6-digit code → account created, JWT returned.
  • Login:    email → JWT returned (NO verification step). This is intentionally
    insecure; the product owner accepted that anyone who knows a registered
    email can sign in as that user. The auth gate is here for soft access
    control (Save / Download / Compare gating), not as a true security
    boundary.

Storage:  SQLite at backend/auth.db (gitignored). Tiny dataset; migrate to
         Postgres/MySQL later if it ever matters.

Token:    HS256 JWT, signed with JWT_SECRET (env). 30-day TTL.

Email:    Tries real SMTP if SMTP_HOST/SMTP_USER/SMTP_PASSWORD are configured.
         Falls back to logging the OTP to the backend console. In dev mode
         (DEV_RETURN_OTP=1, default) the OTP is also returned in the API
         response so the frontend can prefill — never enabled in prod.
"""

import os
import smtplib
import secrets
import sqlite3
import logging
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Optional

import jwt
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr

logger = logging.getLogger(__name__)

# ── Config ──────────────────────────────────────────────────────────────────
ROOT_DIR = Path(__file__).parent
DB_PATH = ROOT_DIR / "auth.db"

JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-change-me-in-production")
JWT_ALG = "HS256"
JWT_TTL_DAYS = 30

OTP_TTL_MINUTES = 10
OTP_LENGTH = 6
OTP_RESEND_COOLDOWN_SECONDS = 30

SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM = os.getenv("SMTP_FROM") or SMTP_USER
SMTP_ENABLED = bool(SMTP_HOST and SMTP_USER and SMTP_PASSWORD)
# When true (default in dev), the request-otp response includes the OTP so
# the frontend can pre-fill / show it. Set DEV_RETURN_OTP=0 in production.
DEV_RETURN_OTP_IN_RESPONSE = os.getenv("DEV_RETURN_OTP", "1") == "1"


# ── DB ──────────────────────────────────────────────────────────────────────
def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_db() -> None:
    """Create tables if they don't exist. Idempotent — safe to call on every boot."""
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                email         TEXT NOT NULL UNIQUE,
                verified_at   TEXT NOT NULL,
                created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_login_at TEXT
            );

            CREATE TABLE IF NOT EXISTS otps (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                email       TEXT NOT NULL,
                code        TEXT NOT NULL,
                -- only 'register' is used today; leaving the column open in case
                -- we add OTP-based login later.
                purpose     TEXT NOT NULL DEFAULT 'register',
                expires_at  TEXT NOT NULL,
                consumed_at TEXT,
                created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_otps_email   ON otps(email);
            CREATE INDEX IF NOT EXISTS idx_otps_expires ON otps(expires_at);
            """
        )


init_db()


# ── Helpers ─────────────────────────────────────────────────────────────────
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.replace(microsecond=0).isoformat()


def generate_otp() -> str:
    """6-digit numeric OTP, zero-padded. `secrets` is CSPRNG-backed."""
    return f"{secrets.randbelow(10 ** OTP_LENGTH):0{OTP_LENGTH}d}"


def normalize_email(email: str) -> str:
    return email.strip().lower()


def issue_jwt(user_id: int, email: str) -> str:
    payload = {
        "sub": str(user_id),
        "email": email,
        "iat": int(now_utc().timestamp()),
        "exp": int((now_utc() + timedelta(days=JWT_TTL_DAYS)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_jwt(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ── Email delivery ──────────────────────────────────────────────────────────

# Logo embedded inline via Content-ID so it renders even when recipients have
# "block external images" turned on (default for many Gmail/Outlook setups).
# Loaded once at module import — the file rarely changes; if it ever does,
# restart the backend.
_LOGO_PATH = ROOT_DIR / "static" / "email" / "logo.png"
try:
    with open(_LOGO_PATH, "rb") as _f:
        _LOGO_BYTES = _f.read()
except FileNotFoundError:
    _LOGO_BYTES = None
    logger.warning(f"OTP logo not found at {_LOGO_PATH} — emails will render without it.")


def _build_html_body(code: str) -> str:
    """Brand-styled HTML body for the OTP email. (Logo is intentionally
    omitted — when ready, drop a file at static/email/logo.png and re-add
    the cid:logo <img> + add_related() call in send_otp_email.)"""
    return f"""\
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
             max-width: 480px; margin: 40px auto; padding: 0 24px; color: #2a3142;">
  <h2 style="font-weight: 600; color: #2a3142; text-align: center;">Verify your email</h2>
  <p style="text-align: center;">Use the code below to finish creating your UniVicoustic account:</p>

  <div style="background: #f5f2ee; border: 2px solid #c4956a;
              border-radius: 8px; padding: 20px; text-align: center;
              font-family: 'Courier New', monospace; font-size: 28px;
              font-weight: 700; letter-spacing: 6px;
              color: #c4956a; margin: 24px 0;">
    {code}
  </div>

  <p style="color: #6b7280; font-size: 14px; text-align: center;">
    This code expires in {OTP_TTL_MINUTES} minutes.<br>
    If you didn't request this, you can safely ignore this email.
  </p>

  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
  <p style="color: #9ca3af; font-size: 12px; text-align: center;">
    UniVicoustic &middot; Acoustic walls, designed your way
  </p>
</body>
</html>
"""


def send_otp_email(to_email: str, code: str) -> dict:
    """
    Try SMTP if configured; fall back to logging the code to the backend console.
    Returns a small status dict so the API can report which path was used.
    """
    delivered_via = "console"  # default fallback

    if SMTP_ENABLED:
        try:
            msg = EmailMessage()
            # Subject lines that include the code itself measurably improve
            # open rates because recipients can read it from their inbox preview.
            msg["Subject"] = f"{code} is your UniVicoustic code"
            # Friendly From: name + email so recipients see "UniVicoustic" in
            # their inbox list, not just an opaque address.
            msg["From"] = f"UniVicoustic <{SMTP_FROM}>"
            msg["To"] = to_email
            # Plain-text fallback — required for accessibility and older clients.
            msg.set_content(
                f"Your UniVicoustic verification code is: {code}\n\n"
                f"It expires in {OTP_TTL_MINUTES} minutes.\n\n"
                "If you didn't request this, you can safely ignore this email."
            )
            # HTML alternative — preferred render in modern clients.
            msg.add_alternative(_build_html_body(code), subtype="html")
            # Logo intentionally not attached — when ready, re-enable by
            # uncommenting and ensuring _build_html_body includes <img src="cid:logo">.
            # if _LOGO_BYTES:
            #     html_part = msg.get_payload()[-1]
            #     html_part.add_related(_LOGO_BYTES, maintype="image", subtype="png",
            #                           cid="<logo>", filename="logo.png")
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
                s.starttls()
                s.login(SMTP_USER, SMTP_PASSWORD)
                s.send_message(msg)
            delivered_via = "smtp"
            logger.info(f"OTP emailed to {to_email}")
        except Exception as e:
            logger.warning(f"SMTP send failed for {to_email}: {e!r}. Falling back to console.")

    if delivered_via == "console":
        # Conspicuous block so the OTP is easy to find in the backend log
        # during dev. Production should always have SMTP configured.
        logger.warning(
            "\n%s\n  DEV OTP for %s: %s\n  (would be emailed in production)\n%s",
            "=" * 50,
            to_email,
            code,
            "=" * 50,
        )

    return {"delivered_via": delivered_via}


# ── Request / Response models ──────────────────────────────────────────────
class RequestOtpBody(BaseModel):
    email: EmailStr


class VerifyOtpBody(BaseModel):
    email: EmailStr
    otp: str


class LoginBody(BaseModel):
    email: EmailStr


# ── Router ──────────────────────────────────────────────────────────────────
router = APIRouter(prefix="/api/auth", tags=["auth"])
bearer_scheme = HTTPBearer(auto_error=False)


@router.post("/register/request-otp")
def register_request_otp(body: RequestOtpBody) -> dict:
    """Generate + send a register OTP for the given email."""
    email = normalize_email(body.email)

    with _connect() as conn:
        # Already-registered users should use the login flow instead.
        if conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone():
            raise HTTPException(
                status_code=409,
                detail="Email is already registered. Use the Sign in flow instead.",
            )

        # Resend cooldown — protects against accidental spam from rapid clicks.
        recent = conn.execute(
            "SELECT created_at FROM otps WHERE email = ? AND purpose = 'register' "
            "ORDER BY id DESC LIMIT 1",
            (email,),
        ).fetchone()
        if recent:
            recent_dt = datetime.fromisoformat(recent["created_at"])
            if recent_dt.tzinfo is None:
                recent_dt = recent_dt.replace(tzinfo=timezone.utc)
            elapsed = (now_utc() - recent_dt).total_seconds()
            if elapsed < OTP_RESEND_COOLDOWN_SECONDS:
                wait = int(OTP_RESEND_COOLDOWN_SECONDS - elapsed)
                raise HTTPException(
                    status_code=429,
                    detail=f"Please wait {wait}s before requesting another code.",
                )

        # Invalidate prior unconsumed OTPs so only the newest is valid.
        conn.execute(
            "UPDATE otps SET consumed_at = ? "
            "WHERE email = ? AND purpose = 'register' AND consumed_at IS NULL",
            (iso(now_utc()), email),
        )

        code = generate_otp()
        expires = iso(now_utc() + timedelta(minutes=OTP_TTL_MINUTES))
        conn.execute(
            "INSERT INTO otps (email, code, purpose, expires_at) "
            "VALUES (?, ?, 'register', ?)",
            (email, code, expires),
        )

    delivery = send_otp_email(email, code)

    resp = {
        "ok": True,
        "delivered_via": delivery["delivered_via"],
        "expires_in_minutes": OTP_TTL_MINUTES,
        "resend_cooldown_seconds": OTP_RESEND_COOLDOWN_SECONDS,
    }
    # Dev convenience: include the OTP in the response when SMTP isn't wired
    # so the frontend can show it / pre-fill it. Disable with DEV_RETURN_OTP=0.
    if DEV_RETURN_OTP_IN_RESPONSE and delivery["delivered_via"] == "console":
        resp["_dev_otp"] = code
    return resp


@router.post("/register/verify-otp")
def register_verify_otp(body: VerifyOtpBody) -> dict:
    """Verify OTP, create the user (if new), return a JWT."""
    email = normalize_email(body.email)
    code = body.otp.strip()

    with _connect() as conn:
        otp_row = conn.execute(
            "SELECT id, code, expires_at FROM otps "
            "WHERE email = ? AND purpose = 'register' AND consumed_at IS NULL "
            "ORDER BY id DESC LIMIT 1",
            (email,),
        ).fetchone()
        if not otp_row:
            raise HTTPException(
                status_code=400,
                detail="No active code for this email. Request a new one.",
            )

        expires_at = datetime.fromisoformat(otp_row["expires_at"])
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if now_utc() > expires_at:
            raise HTTPException(
                status_code=400,
                detail="Code has expired. Request a new one.",
            )
        if otp_row["code"] != code:
            raise HTTPException(status_code=400, detail="Incorrect code.")

        # Consume the OTP and create the user record (idempotent).
        conn.execute(
            "UPDATE otps SET consumed_at = ? WHERE id = ?",
            (iso(now_utc()), otp_row["id"]),
        )
        existing = conn.execute(
            "SELECT id FROM users WHERE email = ?", (email,)
        ).fetchone()
        if existing:
            user_id = existing["id"]
            conn.execute(
                "UPDATE users SET last_login_at = ? WHERE id = ?",
                (iso(now_utc()), user_id),
            )
        else:
            cur = conn.execute(
                "INSERT INTO users (email, verified_at, last_login_at) "
                "VALUES (?, ?, ?)",
                (email, iso(now_utc()), iso(now_utc())),
            )
            user_id = cur.lastrowid

    token = issue_jwt(user_id, email)
    return {"token": token, "user": {"id": user_id, "email": email}}


@router.post("/login")
def login(body: LoginBody) -> dict:
    """
    Email-only login. Intentionally insecure per product decision —
    anyone who knows a registered email can sign in as them. Suitable
    for soft gating (saved configs, downloads), NOT for protecting
    sensitive data.
    """
    email = normalize_email(body.email)

    with _connect() as conn:
        user = conn.execute(
            "SELECT id, email FROM users WHERE email = ?", (email,)
        ).fetchone()
        if not user:
            raise HTTPException(
                status_code=404,
                detail="No account with that email. Please sign up first.",
            )
        conn.execute(
            "UPDATE users SET last_login_at = ? WHERE id = ?",
            (iso(now_utc()), user["id"]),
        )

    token = issue_jwt(user["id"], email)
    return {"token": token, "user": {"id": user["id"], "email": email}}


@router.get("/me")
def me(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> dict:
    """Decode the bearer token and return the user it identifies. 401 if missing/invalid/expired."""
    if not creds:
        raise HTTPException(status_code=401, detail="Missing token")
    payload = decode_jwt(creds.credentials)
    return {"id": int(payload["sub"]), "email": payload["email"]}
