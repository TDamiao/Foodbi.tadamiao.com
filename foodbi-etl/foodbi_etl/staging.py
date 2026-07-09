from __future__ import annotations

import sqlite3
from pathlib import Path


def connect(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA temp_store=MEMORY")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS filtered_establishments (
            cnpj TEXT PRIMARY KEY,
            cnpj_base TEXT NOT NULL,
            trade_name TEXT,
            cnae TEXT NOT NULL,
            category TEXT NOT NULL,
            registration_status TEXT,
            opening_date TEXT,
            uf TEXT NOT NULL,
            municipality_code TEXT NOT NULL,
            municipality TEXT,
            neighborhood TEXT,
            address TEXT,
            address_number TEXT,
            zip_code TEXT
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_filtered_base ON filtered_establishments (cnpj_base)")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS companies (
            cnpj_base TEXT PRIMARY KEY,
            legal_name TEXT
        )
        """
    )
    conn.commit()
    return conn
