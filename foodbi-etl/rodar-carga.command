#!/bin/zsh
set -e

cd "$(dirname "$0")"

echo "FoodBI ETL - carga completa"
echo

if [ ! -d ".venv" ]; then
  echo "ERRO: ambiente .venv nao encontrado."
  echo "Rode primeiro: python3 -m venv .venv && .venv/bin/pip install -e ."
  echo
  read "dummy?Pressione ENTER para fechar..."
  exit 1
fi

if [ ! -x ".venv/bin/python" ]; then
  echo "ERRO: .venv/bin/python nao encontrado ou sem permissao de execucao."
  echo
  read "dummy?Pressione ENTER para fechar..."
  exit 1
fi

if [ ! -d "downloads" ]; then
  echo "ERRO: pasta downloads nao encontrada."
  echo
  read "dummy?Pressione ENTER para fechar..."
  exit 1
fi

echo "Pastas encontradas em downloads:"
find downloads -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort
echo

read "competencia?Digite a pasta da competencia, exemplo 2026-07: "
competencia="${competencia// /}"

if [ -z "$competencia" ]; then
  echo "ERRO: nenhuma pasta informada."
  echo
  read "dummy?Pressione ENTER para fechar..."
  exit 1
fi

local_dir="downloads/$competencia"

if [ ! -d "$local_dir" ]; then
  echo "ERRO: pasta nao encontrada: $local_dir"
  echo "Crie essa pasta e coloque nela o ZIP da Receita, por exemplo:"
  echo "  $local_dir/$competencia.zip"
  echo
  read "dummy?Pressione ENTER para fechar..."
  exit 1
fi

zip_count=$(find "$local_dir" -maxdepth 1 -type f -name "*.zip" | wc -l | tr -d " ")
if [ "$zip_count" = "0" ]; then
  echo "ERRO: nenhum arquivo .zip encontrado em $local_dir"
  echo
  read "dummy?Pressione ENTER para fechar..."
  exit 1
fi

echo
echo "A carga completa sera executada usando: $local_dir"
echo "Isso vai gravar no MySQL configurado no arquivo .env."
echo
read "confirmacao?Continuar? Digite SIM para confirmar: "

if [ "$confirmacao" != "SIM" ]; then
  echo "Carga cancelada."
  echo
  read "dummy?Pressione ENTER para fechar..."
  exit 0
fi

echo
echo "Iniciando carga completa..."
echo

.venv/bin/python -m foodbi_etl full-load --local-dir "$local_dir"

echo
echo "Atualizando coordenadas das cidades..."
coords_csv="/tmp/foodbi-municipios.csv"
coords_url="https://raw.githubusercontent.com/kelvins/Municipios-Brasileiros/main/csv/municipios.csv"

if curl -L -o "$coords_csv" "$coords_url"; then
  .venv/bin/python -m foodbi_etl import-coords "$coords_csv"
else
  echo
  echo "AVISO: carga concluida, mas nao foi possivel baixar o CSV de coordenadas."
  echo "Para atualizar manualmente depois, rode:"
  echo "  curl -L -o /tmp/foodbi-municipios.csv $coords_url"
  echo "  .venv/bin/python -m foodbi_etl import-coords /tmp/foodbi-municipios.csv"
fi

echo
echo "Carga finalizada."
read "dummy?Pressione ENTER para fechar..."
