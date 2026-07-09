from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def env_bool(key: str, default: bool) -> bool:
    value = os.environ.get(key)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "sim", "y"}


@dataclass(frozen=True)
class Settings:
    mysql_host: str
    mysql_port: int
    mysql_database: str
    mysql_user: str
    mysql_password: str
    receita_base_url: str
    temp_dir: Path
    receita_local_dir: Path | None
    import_only_active: bool
    mysql_batch_size: int
    municipality_coords_csv: Path | None


def load_settings(project_dir: Path) -> Settings:
    load_dotenv(project_dir / ".env")
    coords = os.environ.get("MUNICIPALITY_COORDS_CSV", "").strip()
    local_dir = os.environ.get("RECEITA_LOCAL_DIR", "").strip()
    return Settings(
        mysql_host=os.environ.get("MYSQL_HOST", "127.0.0.1"),
        mysql_port=int(os.environ.get("MYSQL_PORT", "3306")),
        mysql_database=os.environ.get("MYSQL_DATABASE", "foodbi_map"),
        mysql_user=os.environ.get("MYSQL_USER", "root"),
        mysql_password=os.environ.get("MYSQL_PASSWORD", ""),
        receita_base_url=os.environ.get(
            "RECEITA_BASE_URL",
            "https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj/",
        ),
        temp_dir=Path(os.environ.get("FOODBI_ETL_TEMP_DIR", "/tmp/foodbi-etl")),
        receita_local_dir=Path(local_dir) if local_dir else None,
        import_only_active=env_bool("IMPORT_ONLY_ACTIVE", True),
        mysql_batch_size=int(os.environ.get("MYSQL_BATCH_SIZE", "1000")),
        municipality_coords_csv=Path(coords) if coords else None,
    )
