from __future__ import annotations

import logging
import csv
import sqlite3
from datetime import datetime, timezone

import pymysql

from .cnaes import CNAE_DESCRIPTIONS, FOOD_CNAES
from .config import Settings

LOGGER = logging.getLogger(__name__)


def mysql_connect(settings: Settings):
    return pymysql.connect(
        host=settings.mysql_host,
        port=settings.mysql_port,
        user=settings.mysql_user,
        password=settings.mysql_password,
        database=settings.mysql_database,
        charset="utf8mb4",
        autocommit=False,
        cursorclass=pymysql.cursors.DictCursor,
    )


def ensure_metadata_table(conn) -> None:
    with conn.cursor() as cursor:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS etl_metadata (
              id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
              source VARCHAR(120) NOT NULL,
              source_release VARCHAR(40) NULL,
              mode VARCHAR(40) NOT NULL,
              only_uf CHAR(2) NULL,
              import_only_active BOOLEAN NOT NULL DEFAULT TRUE,
              establishments_read BIGINT UNSIGNED NOT NULL DEFAULT 0,
              establishments_imported BIGINT UNSIGNED NOT NULL DEFAULT 0,
              companies_read BIGINT UNSIGNED NOT NULL DEFAULT 0,
              companies_matched BIGINT UNSIGNED NOT NULL DEFAULT 0,
              started_at DATETIME NOT NULL,
              finished_at DATETIME NOT NULL,
              notes TEXT NULL,
              KEY idx_etl_metadata_source (source, source_release),
              KEY idx_etl_metadata_finished (finished_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
    conn.commit()


def seed_cnaes(conn) -> None:
    with conn.cursor() as cursor:
        for code, category in FOOD_CNAES.items():
            cursor.execute(
                """
                INSERT INTO cnae_categories (cnae, category, description)
                VALUES (%s, %s, %s)
                ON DUPLICATE KEY UPDATE category = VALUES(category), description = VALUES(description)
                """,
                (code, category, CNAE_DESCRIPTIONS[code]),
            )
    conn.commit()


def load_coordinates(settings: Settings) -> dict[tuple[str, str], tuple[float, float]]:
    path = settings.municipality_coords_csv
    if not path or not path.exists():
        return {}
    coords: dict[tuple[str, str], tuple[float, float]] = {}
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            ibge_code = (row.get("ibge_code") or "").strip()
            uf = (row.get("uf") or "").strip().upper()
            name = (row.get("name") or "").strip()
            lat = row.get("latitude")
            lon = row.get("longitude")
            if lat and lon:
                if ibge_code:
                    coords[("ibge", ibge_code)] = (float(lat), float(lon))
                if uf and name:
                    coords[(uf, name.upper())] = (float(lat), float(lon))
    LOGGER.info("Coordenadas municipais carregadas: %s", len(coords))
    return coords


def execute_many_values(cursor, prefix: str, values_sql: str, suffix: str, rows: list[tuple]) -> None:
    if not rows:
        return
    values = ",\n".join(cursor.mogrify(values_sql, row) for row in rows)
    cursor.execute(f"{prefix}\nVALUES\n{values}\n{suffix}")


def upsert_establishments(settings: Settings, sqlite_conn: sqlite3.Connection, release: str, insert_ignore: bool = False) -> int:
    mysql_conn = mysql_connect(settings)
    ensure_metadata_table(mysql_conn)
    seed_cnaes(mysql_conn)
    coordinates = load_coordinates(settings)

    total = 0
    batch_size = settings.mysql_batch_size
    query = """
        SELECT
            e.cnpj, e.trade_name, c.legal_name, e.cnae, e.category, e.registration_status,
            e.opening_date, e.uf, e.municipality, e.municipality_code, e.neighborhood,
            e.address, e.address_number, e.zip_code
        FROM filtered_establishments e
        LEFT JOIN companies c ON c.cnpj_base = e.cnpj_base
        WHERE e.municipality IS NOT NULL
        ORDER BY e.uf, e.municipality, e.cnpj
    """
    cursor = sqlite_conn.execute(query)
    try:
        while True:
            rows = cursor.fetchmany(batch_size)
            if not rows:
                break
            city_rows = {}
            establishment_rows = []
            for row in rows:
                lat_lon = coordinates.get(("ibge", row["municipality_code"])) or coordinates.get(
                    (row["uf"], row["municipality"].upper())
                )
                latitude = lat_lon[0] if lat_lon else None
                longitude = lat_lon[1] if lat_lon else None
                city_rows[(row["uf"], row["municipality"])] = (
                    row["uf"],
                    row["municipality"],
                    int(row["municipality_code"]),
                    latitude,
                    longitude,
                )
                establishment_rows.append(
                    (
                        row["cnpj"],
                        row["trade_name"],
                        row["legal_name"],
                        row["cnae"],
                        row["category"],
                        row["registration_status"],
                        row["opening_date"],
                        row["uf"],
                        row["municipality"],
                        row["neighborhood"],
                        row["address"],
                        row["address_number"],
                        row["zip_code"],
                        f"{release}-01 00:00:00",
                    )
                )
            for attempt in range(1, 4):
                try:
                    with mysql_conn.cursor() as mysql_cursor:
                        execute_many_values(
                            mysql_cursor,
                            """
                            INSERT INTO cities (uf, name, ibge_code, latitude, longitude, collection_status, last_update_at)
                            """,
                            "(%s, %s, %s, %s, %s, 'fresh', NOW())",
                            """
                            ON DUPLICATE KEY UPDATE
                              ibge_code = COALESCE(VALUES(ibge_code), ibge_code),
                              latitude = COALESCE(VALUES(latitude), latitude),
                              longitude = COALESCE(VALUES(longitude), longitude),
                              collection_status = 'fresh',
                              last_update_at = NOW(),
                              last_error = NULL
                            """,
                            list(city_rows.values()),
                        )
                        establishment_prefix = """
                            INSERT INTO establishments
                              (cnpj, trade_name, legal_name, cnae, category, registration_status,
                               opening_date, uf, municipality, neighborhood, address, address_number,
                               zip_code, source, source_updated_at, collected_at)
                            """
                        establishment_suffix = ""
                        if insert_ignore:
                            establishment_prefix = establishment_prefix.replace("INSERT INTO", "INSERT IGNORE INTO", 1)
                        else:
                            establishment_suffix = """
                            ON DUPLICATE KEY UPDATE
                              trade_name = VALUES(trade_name),
                              legal_name = VALUES(legal_name),
                              cnae = VALUES(cnae),
                              category = VALUES(category),
                              registration_status = VALUES(registration_status),
                              opening_date = VALUES(opening_date),
                              uf = VALUES(uf),
                              municipality = VALUES(municipality),
                              neighborhood = VALUES(neighborhood),
                              address = VALUES(address),
                              address_number = VALUES(address_number),
                              zip_code = VALUES(zip_code),
                              source = VALUES(source),
                              source_updated_at = VALUES(source_updated_at),
                              collected_at = NOW()
                            """
                        execute_many_values(
                            mysql_cursor,
                            establishment_prefix,
                            """(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                               'receita_federal_dados_abertos', %s, NOW())""",
                            establishment_suffix,
                            establishment_rows,
                        )
                    mysql_conn.commit()
                    break
                except pymysql.err.OperationalError as error:
                    LOGGER.warning("Falha na gravacao do lote; tentativa %s/3: %s", attempt, error)
                    try:
                        mysql_conn.rollback()
                    except Exception:
                        pass
                    try:
                        mysql_conn.close()
                    except Exception:
                        pass
                    if attempt == 3:
                        raise
                    mysql_conn = mysql_connect(settings)
            total += len(rows)
            LOGGER.info("Registros gravados no MySQL: %s", total)
    finally:
        mysql_conn.close()
    return total


def rebuild_aggregates(settings: Settings, only_uf: str | None = None) -> None:
    conn = mysql_connect(settings)
    try:
        with conn.cursor() as cursor:
            if only_uf:
                cursor.execute(
                    """
                    DELETE a FROM city_aggregates a
                    JOIN cities c ON c.id = a.city_id
                    WHERE c.uf = %s
                    """,
                    (only_uf,),
                )
            else:
                cursor.execute("DELETE FROM city_aggregates")
            cursor.execute(
                """
                INSERT INTO city_aggregates (city_id, uf, municipality, category, total, last_update_at)
                SELECT c.id, e.uf, e.municipality, e.category, COUNT(*) AS total, NOW()
                FROM establishments e
                JOIN cities c ON c.uf = e.uf AND c.name = e.municipality
                WHERE (%s IS NULL OR e.uf = %s)
                GROUP BY c.id, e.uf, e.municipality, e.category
                """,
                (only_uf, only_uf),
            )
            cursor.execute(
                """
                INSERT INTO data_sources
                  (source_key, name, base_url, supports_city_search, supports_uf_search,
                   supports_cnae_filter, supports_pagination, is_enabled, known_limit, status, notes)
                VALUES
                  ('receita_federal_dados_abertos', 'Receita Federal Dados Abertos CNPJ',
                   'https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj/',
                   TRUE, TRUE, TRUE, TRUE, TRUE, 'Download local manual dos ZIPs oficiais.',
                   'available', 'Fonte oficial processada pelo foodbi-etl local; nao roda na VPS.')
                ON DUPLICATE KEY UPDATE status = VALUES(status), notes = VALUES(notes), updated_at = NOW()
                """
            )
            cursor.execute(
                """
                UPDATE cities c
                JOIN (
                  SELECT city_id, MAX(last_update_at) AS last_update_at
                  FROM city_aggregates
                  GROUP BY city_id
                ) a ON a.city_id = c.id
                SET c.collection_status = 'fresh',
                    c.last_update_at = a.last_update_at,
                    c.last_error = NULL
                WHERE (%s IS NULL OR c.uf = %s)
                """,
                (only_uf, only_uf),
            )
        conn.commit()
    finally:
        conn.close()


def write_metadata(
    settings: Settings,
    release: str,
    mode: str,
    only_uf: str | None,
    import_only_active: bool,
    started_at: datetime,
    stats: dict[str, int],
    imported: int,
) -> None:
    conn = mysql_connect(settings)
    ensure_metadata_table(conn)
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO etl_metadata
                  (source, source_release, mode, only_uf, import_only_active,
                   establishments_read, establishments_imported, companies_read, companies_matched,
                   started_at, finished_at, notes)
                VALUES
                  (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    "receita_federal_dados_abertos",
                    release,
                    mode,
                    only_uf,
                    import_only_active,
                    stats.get("establishments_read", 0),
                    imported,
                    stats.get("companies_read", 0),
                    stats.get("companies_matched", 0),
                    started_at.strftime("%Y-%m-%d %H:%M:%S"),
                    datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
                    "Carga local filtrada por CNAEs de alimentacao e situacao ativa.",
                ),
            )
        conn.commit()
    finally:
        conn.close()
