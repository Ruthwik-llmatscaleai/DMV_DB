"""
Layer 4 — PII Scrubber
======================
Scans ALL outbound data VALUES (not field names) using regex patterns.
Replaces any detected PII with [REDACTED].

Supports:
  - Email addresses (*@*.*)
  - Phone numbers (various formats)
  - SSN patterns (NNN-NN-NNNN)
"""

import re
from typing import Any, Dict

# Compiled regex patterns for performance
_EMAIL_RE = re.compile(
    r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"
)

_PHONE_RE = re.compile(
    r"(?:\+?\d{1,3}[\s\-]?)?"           # optional country code
    r"(?:\(?\d{3}\)?[\s\-]?)?"           # optional area code
    r"\d{3}[\s\-]?\d{4}"                 # core 7-digit number
)

_SSN_RE = re.compile(
    r"\b\d{3}-\d{2}-\d{4}\b"
)

_PATTERNS = [_EMAIL_RE, _PHONE_RE, _SSN_RE]
_REDACTED = "[REDACTED]"


def _scrub_value(value: Any) -> Any:
    """Scrub a single value. Only string values are inspected."""
    if not isinstance(value, str):
        return value
    result = value
    for pattern in _PATTERNS:
        result = pattern.sub(_REDACTED, result)
    return result


def scrub(row: Dict[str, Any]) -> Dict[str, Any]:
    """
    Scrub all values in a row dict.
    Returns a new dict with PII-matching values replaced by [REDACTED].
    """
    if not row:
        return row
    return {key: _scrub_value(val) for key, val in row.items()}
