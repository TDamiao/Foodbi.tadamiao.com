from __future__ import annotations

import csv
import io
import logging
import sqlite3
import zipfile
from pathlib import Path

from .cnaes import FOOD_CNAES

LOGGER = logging.getLogger(__name__)

ACTIVE_STATUS_CODE = "02"


def _rows_from_zip(path: Path):
    with zipfile.ZipFile(path) as archive:
        members = [name for name in archive.namelist() if not name.endswith("/")]
        if not members:
            return
        with archive.open(members[0]) as raw:
            text = io.TextIOWrapper(raw, encoding="latin1", newline="")
            reader = csv.reader(text, delimiter=";", quotechar='"')
            for row in reader:
                yield row


def parse_municipalities(zip_path: Path) -> dict[str, str]:
    municipalities: dict[str, str] = {}
    for row in _rows_from_zip(zip_path):
        if len(row) >= 2:
            municipalities[row[0].strip()] = row[1].strip()
    LOGGER.info("Municipios carregados: %s", len(municipalities))
    return municipalities


def parse_cnaes(zip_path: Path) -> dict[str, str]:
    cnaes: dict[str, str] = {}
    for row in _rows_from_zip(zip_path):
        if len(row) >= 2:
            cnaes[row[0].strip()] = row[1].strip()
    LOGGER.info("CNAEs carregados: %s", len(cnaes))
    return cnaes


def date_or_none(value: str) -> str | None:
    value = (value or "").strip()
    if len(value) != 8 or value == "00000000":
        return None
    return f"{value[0:4]}-{value[4:6]}-{value[6:8]}"


def parse_establishments(
    zip_paths: list[Path],
    conn: sqlite3.Connection,
    municipalities: dict[str, str],
    only_uf: str | None,
    import_only_active: bool,
) -> dict[str, int]:
    stats = {"read": 0, "filtered": 0}
    insert_sql = """
        INSERT OR REPLACE INTO filtered_establishments
        (cnpj, cnpj_base, trade_name, cnae, category, registration_status, opening_date,
         uf, municipality_code, municipality, neighborhood, address, address_number, zip_code)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """

    for zip_path in zip_paths:
        batch = []
        LOGGER.info("Processando estabelecimentos: %s", zip_path.name)
        for row in _rows_from_zip(zip_path):
            stats["read"] += 1
            if len(row) < 28:
                continue
            cnae = row[11].strip()
            uf = row[19].strip().upper()
            status = row[5].strip()
            if cnae not in FOOD_CNAES:
                continue
            if only_uf and uf != only_uf:
                continue
            if import_only_active and status != ACTIVE_STATUS_CODE:
                continue

            cnpj_base = row[0].strip().zfill(8)
            cnpj = f"{cnpj_base}{row[1].strip().zfill(4)}{row[2].strip().zfill(2)}"
            municipality_code = row[20].strip()
            street_type = row[13].strip()
            street = row[14].strip()
            address = " ".join(part for part in [street_type, street] if part) or None

            batch.append(
                (
                    cnpj,
                    cnpj_base,
                    row[4].strip() or None,
                    cnae,
                    FOOD_CNAES[cnae],
                    "Ativa" if status == ACTIVE_STATUS_CODE else status,
                    date_or_none(row[10]),
                    uf,
                    municipality_code,
                    municipalities.get(municipality_code),
                    row[17].strip() or None,
                    address,
                    row[15].strip() or None,
                    row[18].strip() or None,
                )
            )
            stats["filtered"] += 1
            if len(batch) >= 5000:
                conn.executemany(insert_sql, batch)
                conn.commit()
                batch.clear()
        if batch:
            conn.executemany(insert_sql, batch)
            conn.commit()
    LOGGER.info("Estabelecimentos lidos=%s filtrados=%s", stats["read"], stats["filtered"])
    return stats


def parse_companies(zip_paths: list[Path], conn: sqlite3.Connection) -> dict[str, int]:
    stats = {"read": 0, "matched": 0}
    insert_sql = "INSERT OR REPLACE INTO companies (cnpj_base, legal_name) VALUES (?, ?)"
    needed_bases = {
        row[0]
        for row in conn.execute("SELECT DISTINCT cnpj_base FROM filtered_establishments")
    }
    LOGGER.info("Raizes de CNPJ necessarias para cruzar empresas: %s", len(needed_bases))

    for zip_path in zip_paths:
        batch = []
        LOGGER.info("Processando empresas: %s", zip_path.name)
        for row in _rows_from_zip(zip_path):
            stats["read"] += 1
            if len(row) < 2:
                continue
            cnpj_base = row[0].strip().zfill(8)
            if cnpj_base not in needed_bases:
                continue
            batch.append((cnpj_base, row[1].strip() or None))
            stats["matched"] += 1
            if len(batch) >= 5000:
                conn.executemany(insert_sql, batch)
                conn.commit()
                batch.clear()
        if batch:
            conn.executemany(insert_sql, batch)
            conn.commit()
    LOGGER.info("Empresas lidas=%s combinadas=%s", stats["read"], stats["matched"])
    return stats
