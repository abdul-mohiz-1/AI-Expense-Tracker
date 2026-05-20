"""
database/models.py — SQLAlchemy ORM models
==========================================
AI Expense Tracker

Models:
  - User        : Auth identity, OAuth tokens, billing cycle preferences
  - Transaction : Local mirror of every AI-processed entry (fast queries,
                  no Google API calls needed for dashboard stats)
"""

from datetime import datetime, date, timezone
from flask_sqlalchemy import SQLAlchemy
import bcrypt

db = SQLAlchemy()


# ─────────────────────────────────────────────────────────────────────────────
#  User
# ─────────────────────────────────────────────────────────────────────────────

class User(db.Model):
    """
    Represents a registered user of AI Expense Tracker.

    Auth modes:
      1. Email/Password  — password_hash set, refresh_token may be None
      2. Google OAuth    — oauth_provider='google', refresh_token stored

    Billing cycle:
      - billing_start_day   : 1-31, day-of-month the cycle begins
      - income_type         : 'fixed' | 'variable'
      - fixed_salary_amount : monthly fixed income (used when income_type='fixed')

    account_type drives AI categorisation:
      'household' | 'business'
    """

    __tablename__ = "users"

    # ── Primary key ───────────────────────────────────────────────────────────
    id = db.Column(db.Integer, primary_key=True)

    # ── Identity ──────────────────────────────────────────────────────────────
    username = db.Column(db.String(80),  unique=True, nullable=False, index=True)
    email    = db.Column(db.String(120), unique=True, nullable=False, index=True)

    # ── Auth ──────────────────────────────────────────────────────────────────
    password_hash  = db.Column(db.String(255), nullable=True)
    oauth_provider = db.Column(db.String(20),  nullable=True)
    google_email   = db.Column(db.String(120), nullable=True)
    refresh_token  = db.Column(db.Text,        nullable=True)

    # ── Tenant role ───────────────────────────────────────────────────────────
    account_type = db.Column(db.String(20), nullable=False, default="household")

    # ── Google Sheet ──────────────────────────────────────────────────────────
    google_sheet_id = db.Column(db.String(120), nullable=True)
    spreadsheet_id  = db.Column(db.String(120), nullable=True)   # legacy override

    # ── Billing cycle preferences ─────────────────────────────────────────────
    # Day of month the cycle starts (1-31). NULL means user hasn't set it yet
    # (we show the setup modal on first dashboard load).
    billing_start_day   = db.Column(db.Integer,  nullable=True,  default=None)

    # 'fixed'    → a salary auto-entry is created on each cycle start date
    # 'variable' → income is manually logged; no auto-entry
    income_type         = db.Column(db.String(20), nullable=True, default=None)

    # PKR (or whichever currency) monthly fixed salary amount
    fixed_salary_amount = db.Column(db.Float, nullable=True, default=None)

    # ── Timestamps ────────────────────────────────────────────────────────────
    created_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # ── Relationship ──────────────────────────────────────────────────────────
    transactions = db.relationship(
        "Transaction", back_populates="user",
        lazy="dynamic", cascade="all, delete-orphan",
    )

    # ── Derived helpers ───────────────────────────────────────────────────────

    @property
    def effective_sheet_id(self):
        return self.google_sheet_id or self.spreadsheet_id

    @property
    def is_oauth_user(self) -> bool:
        return self.oauth_provider is not None

    @property
    def billing_configured(self) -> bool:
        """True once the user has completed the billing-cycle setup modal."""
        return (
            self.billing_start_day is not None
            and self.income_type is not None
        )

    def current_cycle_bounds(self):
        """
        Return (cycle_start: date, cycle_end: date) for the current billing cycle.

        Logic:
          - Find the most recent occurrence of billing_start_day in the past
            (or today if today IS the start day).
          - cycle_end = cycle_start + 30 days (exclusive upper bound — 31-day
            window covering exactly one salary period regardless of month length).

        Returns (None, None) if billing_start_day is not configured.
        """
        from datetime import timedelta

        if not self.billing_start_day:
            return None, None

        today     = date.today()
        start_day = self.billing_start_day

        # Clamp to valid days for short months (e.g. start=31, Feb → use last day)
        import calendar
        days_in_current_month = calendar.monthrange(today.year, today.month)[1]
        effective_day = min(start_day, days_in_current_month)

        candidate = today.replace(day=effective_day)

        if candidate > today:
            # The start day hasn't arrived yet this month → use previous month
            if today.month == 1:
                prev_year, prev_month = today.year - 1, 12
            else:
                prev_year, prev_month = today.year, today.month - 1
            days_in_prev = calendar.monthrange(prev_year, prev_month)[1]
            effective_day_prev = min(start_day, days_in_prev)
            cycle_start = date(prev_year, prev_month, effective_day_prev)
        else:
            cycle_start = candidate

        cycle_end = cycle_start + timedelta(days=30)
        return cycle_start, cycle_end

    # ── Password helpers ──────────────────────────────────────────────────────

    def set_password(self, plain_text: str) -> None:
        self.password_hash = bcrypt.hashpw(
            plain_text.encode("utf-8"),
            bcrypt.gensalt(rounds=12),
        ).decode("utf-8")

    def check_password(self, plain_text: str) -> bool:
        if not self.password_hash:
            return False
        return bcrypt.checkpw(
            plain_text.encode("utf-8"),
            self.password_hash.encode("utf-8"),
        )

    # ── Serialisation ─────────────────────────────────────────────────────────

    def to_dict(self) -> dict:
        cycle_start, cycle_end = self.current_cycle_bounds()
        return {
            "id":                   self.id,
            "username":             self.username,
            "email":                self.email,
            "google_email":         self.google_email,
            "account_type":         self.account_type,
            "oauth_provider":       self.oauth_provider,
            "google_sheet_id":      self.google_sheet_id,
            "spreadsheet_id":       self.spreadsheet_id,
            "effective_sheet_id":   self.effective_sheet_id,
            "has_refresh_token":    self.refresh_token is not None,
            # Billing cycle
            "billing_start_day":    self.billing_start_day,
            "income_type":          self.income_type,
            "fixed_salary_amount":  self.fixed_salary_amount,
            "billing_configured":   self.billing_configured,
            "cycle_start":          cycle_start.isoformat() if cycle_start else None,
            "cycle_end":            cycle_end.isoformat()   if cycle_end   else None,
            "created_at":           self.created_at.isoformat(),
        }

    # ── Validation ────────────────────────────────────────────────────────────

    @staticmethod
    def validate_account_type(value: str) -> str:
        allowed = {"household", "business"}
        if value not in allowed:
            raise ValueError(f"account_type must be one of {allowed}, got '{value}'")
        return value

    @staticmethod
    def validate_income_type(value: str) -> str:
        allowed = {"fixed", "variable"}
        if value not in allowed:
            raise ValueError(f"income_type must be one of {allowed}, got '{value}'")
        return value

    def __repr__(self) -> str:
        return (
            f"<User id={self.id} username={self.username!r} "
            f"type={self.account_type} oauth={self.oauth_provider}>"
        )


# ─────────────────────────────────────────────────────────────────────────────
#  Transaction
# ─────────────────────────────────────────────────────────────────────────────

class Transaction(db.Model):
    """
    Local SQLite mirror of every AI-processed expense/income entry.

    Why local instead of reading from Google Sheets?
      - Zero API latency (SQLite query vs. Sheets HTTP round-trip)
      - No Google API rate-limit exposure for dashboard queries
      - Enables complex SQL aggregations (GROUP BY cycle, SUM, etc.)
      - Google Sheets remains the user-facing "export/view" layer

    source:
      'ai'     — created by the AI pipeline (voice / receipt)
      'auto'   — system-generated (e.g. fixed salary auto-entry)
      'manual' — future: direct form entry
    """

    __tablename__ = "transactions"

    # ── Primary key ───────────────────────────────────────────────────────────
    id = db.Column(db.Integer, primary_key=True)

    # ── Foreign key ───────────────────────────────────────────────────────────
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Core financial fields ─────────────────────────────────────────────────
    type        = db.Column(db.String(10),  nullable=False)   # 'Income' | 'Expense'
    amount      = db.Column(db.Float,       nullable=False)
    currency    = db.Column(db.String(10),  nullable=False, default="PKR")
    category    = db.Column(db.String(80),  nullable=False, default="Uncategorised")
    notes       = db.Column(db.Text,        nullable=True)

    # ── Date of the actual transaction (from receipt / voice / auto) ──────────
    # Stored as Python date; used for billing-cycle windowing
    transaction_date = db.Column(db.Date, nullable=False, index=True)

    # ── Metadata ──────────────────────────────────────────────────────────────
    source      = db.Column(db.String(20),  nullable=False, default="ai")
    ai_provider = db.Column(db.String(50),  nullable=True)
    account_type = db.Column(db.String(20), nullable=True)

    # ── Timestamps ────────────────────────────────────────────────────────────
    created_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    # ── Relationship ──────────────────────────────────────────────────────────
    user = db.relationship("User", back_populates="transactions")

    # ── Serialisation ─────────────────────────────────────────────────────────

    def to_dict(self) -> dict:
        return {
            "id":               self.id,
            "type":             self.type,
            "amount":           self.amount,
            "currency":         self.currency,
            "category":         self.category,
            "notes":            self.notes,
            "transaction_date": self.transaction_date.isoformat(),
            "source":           self.source,
            "ai_provider":      self.ai_provider,
            "account_type":     self.account_type,
            "created_at":       self.created_at.isoformat(),
        }

    def __repr__(self) -> str:
        return (
            f"<Transaction id={self.id} user_id={self.user_id} "
            f"type={self.type} amount={self.amount} date={self.transaction_date}>"
        )