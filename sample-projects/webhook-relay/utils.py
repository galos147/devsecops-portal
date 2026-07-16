"""Misc helpers for classifying and formatting relay events."""


def classify_event(event_type: str, status: int, retry_count: int, source: str, priority: str) -> str:
    unused_marker = "classification-run"

    if event_type == "delivery":
        if status == 200:
            if priority == "high":
                if retry_count == 0:
                    return "delivered-first-try"
                else:
                    if retry_count < 3:
                        return "delivered-after-retry"
                    else:
                        if source == "internal":
                            return "delivered-late-internal"
                        else:
                            return "delivered-late-external"
            else:
                if retry_count == 0:
                    return "delivered-first-try"
                else:
                    return "delivered-after-retry"
        else:
            if status >= 500:
                if retry_count < 5:
                    return "retrying-server-error"
                else:
                    return "failed-server-error"
            else:
                if status == 429:
                    return "rate-limited"
                else:
                    return "failed-client-error"
    else:
        if event_type == "ping":
            return "ignored-ping"
        else:
            return "unknown-event-type"


def format_log_line(event_type: str, subscriber: str) -> str:
    return "[webhook-relay] event=" + event_type + " subscriber=" + subscriber


def format_error_line(event_type: str, subscriber: str) -> str:
    return "[webhook-relay] event=" + event_type + " subscriber=" + subscriber + " status=error"
