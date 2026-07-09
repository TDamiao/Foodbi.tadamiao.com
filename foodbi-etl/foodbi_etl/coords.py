from __future__ import annotations

import csv
import logging
from pathlib import Path

from .config import Settings
from .mysql_writer import mysql_connect

LOGGER = logging.getLogger(__name__)


UF_BY_CODE = {
    "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO",
    "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL",
    "28": "SE", "29": "BA", "31": "MG", "32": "ES", "33": "RJ", "35": "SP", "41": "PR",
    "42": "SC", "43": "RS", "50": "MS", "51": "MT", "52": "GO", "53": "DF",
}


def import_municipality_coordinates(settings: Settings, csv_path: Path) -> int:
    if not csv_path.exists():
        raise RuntimeError(f"CSV de municipios nao encontrado: {csv_path}")

    rows = []
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            siafi_id = (row.get("siafi_id") or "").strip()
            latitude = (row.get("latitude") or "").strip()
            longitude = (row.get("longitude") or "").strip()
            uf = UF_BY_CODE.get((row.get("codigo_uf") or "").strip())
            if not siafi_id or not latitude or not longitude:
                continue
            rows.append((float(latitude), float(longitude), int(siafi_id), uf))

    conn = mysql_connect(settings)
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                CREATE TEMPORARY TABLE tmp_municipality_coords (
                  siafi_id INT NOT NULL,
                  uf CHAR(2) NOT NULL,
                  latitude DECIMAL(10, 7) NOT NULL,
                  longitude DECIMAL(10, 7) NOT NULL,
                  PRIMARY KEY (siafi_id, uf)
                ) ENGINE=MEMORY
                """
            )
            values = ",\n".join(
                cursor.mogrify("(%s, %s, %s, %s)", (siafi, uf, lat, lon))
                for lat, lon, siafi, uf in rows
                if uf
            )
            cursor.execute(
                f"""
                INSERT INTO tmp_municipality_coords (siafi_id, uf, latitude, longitude)
                VALUES
                {values}
                """
            )
            cursor.execute(
                """
                UPDATE cities c
                JOIN tmp_municipality_coords m
                  ON m.siafi_id = c.ibge_code AND m.uf = c.uf
                SET c.latitude = m.latitude,
                    c.longitude = m.longitude
                """
            )
            affected = cursor.rowcount
        conn.commit()
    finally:
        conn.close()

    LOGGER.info("Coordenadas atualizadas em cities: %s", affected)
    return affected
