from __future__ import annotations

import argparse
import logging
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

from .config import load_settings
from .downloader import download_release_files, latest_release, list_local_zip_files, list_release_files, wanted_files
from .logging_setup import setup_logging
from .coords import import_municipality_coordinates
from .mysql_writer import rebuild_aggregates, upsert_establishments, write_metadata
from .parser import parse_cnaes, parse_companies, parse_establishments, parse_municipalities
from .staging import connect

LOGGER = logging.getLogger(__name__)


def project_dir() -> Path:
    return Path(__file__).resolve().parents[1]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="foodbi-etl")
    parser.add_argument("--verbose", action="store_true", help="Exibe logs detalhados.")
    sub = parser.add_subparsers(dest="command", required=True)

    full = sub.add_parser("full-load", help="Baixa/processa a base oficial e grava apenas dados minimos no MySQL.")
    full.add_argument("--only-uf", help="Filtra uma UF para teste ou carga parcial, ex: SP.")
    full.add_argument("--release", help="Usa uma pasta mensal especifica, ex: 2026-01. Por padrao usa a mais recente.")
    full.add_argument("--local-dir", help="Usa uma pasta local com ZIPs ja baixados manualmente da Receita.")
    full.add_argument("--keep-downloads", action="store_true", help="Mantem ZIPs e staging local ao final.")
    full.add_argument("--force-download", action="store_true", help="Baixa novamente mesmo se o ZIP ja existir.")
    full.add_argument("--dry-run", action="store_true", help="Processa staging, mas nao grava no MySQL.")
    full.add_argument("--insert-ignore", action="store_true", help="Insere apenas CNPJs ainda ausentes; util para retomar carga interrompida.")

    coords = sub.add_parser("import-coords", help="Importa latitude/longitude de municipios a partir de CSV pequeno.")
    coords.add_argument("csv_path", help="CSV com colunas codigo_ibge,nome,latitude,longitude,codigo_uf,siafi_id.")
    return parser


def run_full_load(args: argparse.Namespace) -> int:
    settings = load_settings(project_dir())
    started_at = datetime.now(timezone.utc)
    only_uf = args.only_uf.upper() if args.only_uf else None

    local_dir = Path(args.local_dir).expanduser() if args.local_dir else settings.receita_local_dir
    release_name = args.release or (local_dir.name if local_dir else None)
    run_dir = settings.temp_dir / f"run-{started_at.strftime('%Y%m%d-%H%M%S')}"
    download_dir = run_dir / "downloads"
    staging_db = run_dir / "staging.sqlite"
    run_dir.mkdir(parents=True, exist_ok=True)

    try:
        if local_dir:
            LOGGER.info("Usando ZIPs locais em: %s", local_dir)
            paths = list_local_zip_files(local_dir, extract_dir=run_dir / "local-zips")
            release_name = release_name or local_dir.name
        else:
            release = latest_release(settings.receita_base_url)
            if args.release:
                release = type(release)(name=args.release, url=f"{settings.receita_base_url.rstrip('/')}/{args.release}/")
            release_name = release.name
            LOGGER.info("Release Receita selecionado: %s", release.name)
            files = wanted_files(list_release_files(release))
            LOGGER.info("Arquivos selecionados: %s", ", ".join(files))
            paths = download_release_files(release, files, download_dir, force=args.force_download)

        by_name = {path.name.lower(): path for path in paths}
        municipios_zip = next(path for name, path in by_name.items() if name.startswith("municipios"))
        cnaes_zip = next(path for name, path in by_name.items() if name.startswith("cnaes"))
        establishment_zips = [path for name, path in by_name.items() if name.startswith("estabelecimentos")]
        company_zips = [path for name, path in by_name.items() if name.startswith("empresas")]

        municipalities = parse_municipalities(municipios_zip)
        parse_cnaes(cnaes_zip)

        sqlite_conn = connect(staging_db)
        try:
            est_stats = parse_establishments(
                establishment_zips,
                sqlite_conn,
                municipalities,
                only_uf=only_uf,
                import_only_active=settings.import_only_active,
            )
            company_stats = parse_companies(company_zips, sqlite_conn)
            stats = {
                "establishments_read": est_stats["read"],
                "companies_read": company_stats["read"],
                "companies_matched": company_stats["matched"],
            }

            imported = 0
            if args.dry_run:
                imported = sqlite_conn.execute("SELECT COUNT(*) FROM filtered_establishments").fetchone()[0]
                LOGGER.info("Dry-run finalizado. Registros filtrados: %s", imported)
            else:
                imported = upsert_establishments(settings, sqlite_conn, release_name, insert_ignore=args.insert_ignore)
                rebuild_aggregates(settings, only_uf=only_uf)
                write_metadata(
                    settings,
                    release=release_name,
                    mode="full-load",
                    only_uf=only_uf,
                    import_only_active=settings.import_only_active,
                    started_at=started_at,
                    stats=stats,
                    imported=imported,
                )
                LOGGER.info("Carga concluida. Importados no MySQL: %s", imported)
        finally:
            sqlite_conn.close()
    finally:
        if args.keep_downloads:
            LOGGER.info("Arquivos mantidos em: %s", run_dir)
        else:
            shutil.rmtree(run_dir, ignore_errors=True)
            LOGGER.info("Arquivos temporarios removidos.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    setup_logging(args.verbose)
    if args.command == "full-load":
        return run_full_load(args)
    if args.command == "import-coords":
        settings = load_settings(project_dir())
        import_municipality_coordinates(settings, Path(args.csv_path).expanduser())
        return 0
    parser.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
