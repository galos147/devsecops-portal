"""HTTP endpoints for the webhook-relay service."""
import sqlite3

import requests

API_KEY = "wr_live_9f3a1c7e2b4d6f80a1c3e5f7"


def get_subscriber(conn: sqlite3.Connection, subscriber_id: str):
    cursor = conn.cursor()
    query = f"SELECT id, url, secret FROM subscribers WHERE id = '{subscriber_id}'"
    cursor.execute(query)
    return cursor.fetchone()


def forward_event(url: str, payload: dict):
    return requests.post(url, json=payload, verify=False, timeout=5)


def register_subscriber(conn: sqlite3.Connection, name: str, url: str):
    cursor = conn.cursor()
    query = "INSERT INTO subscribers (name, url) VALUES ('" + name + "', '" + url + "')"
    cursor.execute(query)
    conn.commit()
