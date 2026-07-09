from __future__ import annotations

import logging
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urljoin

import requests

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class ReceitaRelease:
    name: str
    url: str


def latest_release(base_url: str) -> ReceitaRelease:
    response = requests.get(base_url, timeout=30)
    response.raise_for_status()
    releases = sorted(set(re.findall(r'href="(\d{4}-\d{2})/"', response.text)))
    if not releases:
        raise RuntimeError(f"Nenhuma pasta mensal encontrada em {base_url}")
    name = releases[-1]
    return ReceitaRelease(name=name, url=urljoin(base_url, f"{name}/"))


def list_release_files(release: ReceitaRelease) -> list[str]:
    response = requests.get(release.url, timeout=30)
    response.raise_for_status()
    files = re.findall(r'href="([^"]+\.zip)"', response.text, flags=re.IGNORECASE)
    return sorted(set(files))


def wanted_files(files: list[str], include_companies: bool = True) -> list[str]:
    prefixes = ["Estabelecimentos", "Municipios", "Cnaes"]
    if include_companies:
        prefixes.append("Empresas")
    return [
        name
        for name in files
        if any(name.lower().startswith(prefix.lower()) for prefix in prefixes)
    ]


def list_local_zip_files(local_dir: Path, extract_dir: Path | None = None) -> list[Path]:
    if not local_dir.exists():
        raise RuntimeError(f"Pasta local nao encontrada: {local_dir}")
    files = sorted(path for path in local_dir.iterdir() if path.is_file() and path.suffix.lower() == ".zip")
    wanted_names = set(wanted_files([path.name for path in files]))
    selected = [path for path in files if path.name in wanted_names]
    if selected:
        return selected

    nested = []
    for package in files:
        try:
            with zipfile.ZipFile(package) as archive:
                members = [name for name in archive.namelist() if name.lower().endswith(".zip")]
                wanted_nested = [
                    member
                    for member in members
                    if Path(member).name in set(wanted_files([Path(member).name]))
                ]
                if wanted_nested:
                    if extract_dir is None:
                        raise RuntimeError("extract_dir e obrigatorio para ZIP externo com ZIPs internos.")
                    extract_dir.mkdir(parents=True, exist_ok=True)
                    LOGGER.info("Extraindo seletivamente ZIPs internos de %s", package.name)
                    for member in wanted_nested:
                        target = extract_dir / Path(member).name
                        if not target.exists() or target.stat().st_size == 0:
                            with archive.open(member) as source, target.open("wb") as dest:
                                while True:
                                    chunk = source.read(1024 * 1024)
                                    if not chunk:
                                        break
                                    dest.write(chunk)
                        nested.append(target)
        except zipfile.BadZipFile:
            LOGGER.warning("Ignorando ZIP invalido: %s", package)
    if nested:
        return sorted(nested)

    if not selected:
        raise RuntimeError(
            f"Nenhum ZIP esperado encontrado em {local_dir}. "
            "Coloque Estabelecimentos0.zip..Estabelecimentos9.zip, "
            "Empresas0.zip..Empresas9.zip, Municipios.zip e Cnaes.zip nessa pasta."
        )
    return selected


def download_file(url: str, destination: Path, force: bool = False) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and destination.stat().st_size > 0 and not force:
        LOGGER.info("Reusando arquivo existente: %s", destination)
        return destination

    tmp = destination.with_suffix(destination.suffix + ".part")
    LOGGER.info("Baixando %s", url)
    with requests.get(url, stream=True, timeout=(30, 120)) as response:
        response.raise_for_status()
        with tmp.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    handle.write(chunk)
    tmp.replace(destination)
    return destination


def download_release_files(release: ReceitaRelease, files: list[str], download_dir: Path, force: bool = False) -> list[Path]:
    paths = []
    for name in files:
        paths.append(download_file(urljoin(release.url, name), download_dir / name, force=force))
    return paths
