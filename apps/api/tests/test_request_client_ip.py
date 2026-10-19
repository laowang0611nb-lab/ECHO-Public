from __future__ import annotations

from starlette.requests import Request

from app.services.resource_limits import request_client_ip


def make_request(
    peer: tuple[str, int],
    headers: dict[str, str] | None = None,
) -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/",
            "raw_path": b"/",
            "query_string": b"",
            "headers": [
                (name.lower().encode(), value.encode())
                for name, value in (headers or {}).items()
            ],
            "client": peer,
            "server": ("testserver", 80),
            "scheme": "http",
        }
    )


def test_loopback_uses_trusted_real_ip_over_forwarded_for() -> None:
    request = make_request(
        ("127.0.0.1", 12345),
        {
            "x-real-ip": "203.0.113.9",
            "x-forwarded-for": "198.51.100.7, 203.0.113.9",
        },
    )

    assert request_client_ip(request) == "203.0.113.9"


def test_loopback_uses_last_forwarded_for_when_real_ip_missing() -> None:
    request = make_request(
        ("127.0.0.1", 12345),
        {"x-forwarded-for": "198.51.100.7, 203.0.113.9"},
    )

    assert request_client_ip(request) == "203.0.113.9"


def test_non_loopback_ignores_spoofed_proxy_headers() -> None:
    request = make_request(
        ("198.51.100.20", 12345),
        {
            "x-real-ip": "203.0.113.9",
            "x-forwarded-for": "203.0.113.9",
        },
    )

    assert request_client_ip(request) == "198.51.100.20"


def test_invalid_trusted_header_falls_back_to_peer() -> None:
    request = make_request(
        ("127.0.0.1", 12345),
        {
            "x-real-ip": "not-an-ip",
            "x-forwarded-for": "also-not-an-ip",
        },
    )

    assert request_client_ip(request) == "127.0.0.1"
