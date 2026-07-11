# FoodBI ETL

ETL local em Python para carregar dados oficiais de CNPJ da Receita Federal no banco MySQL do FoodBI Map.

Este pacote baixa e processa os ZIPs oficiais localmente, mas grava no MySQL somente o minimo necessario para o mapa:

- estabelecimentos ativos;
- CNAEs de alimentacao definidos pelo FoodBI;
- cidades correspondentes;
- agregados por cidade/categoria;
- metadata da carga.

Nao importa socios, Simples Nacional, natureza juridica, paises, motivos ou arquivos brutos.

## Fonte oficial

Indice publico da Receita Federal:

https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj/

O ETL seleciona a pasta mensal mais recente e baixa apenas:

- `Estabelecimentos*.zip`
- `Empresas*.zip`
- `Municipios.zip`
- `Cnaes.zip`

Se o indice direto retornar 404, baixe manualmente pelo compartilhamento publico:

https://arquivos.receitafederal.gov.br/index.php/s/gn672Ad4CF8N6TK?dir=/Dados/Cadastros/CNPJ

Entre na pasta da competencia desejada, por exemplo `2026-06`, e baixe estes arquivos:

- `Estabelecimentos0.zip` ate `Estabelecimentos9.zip`
- `Empresas0.zip` ate `Empresas9.zip`
- `Municipios.zip`
- `Cnaes.zip`

Coloque todos em:

```text
foodbi-etl/downloads/2026-06/
```

Os ZIPs ficam ignorados pelo Git.

Se o download gerar um unico arquivo como `2026-06.zip` contendo todos esses ZIPs dentro, pode colocar esse arquivo diretamente na mesma pasta:

```text
foodbi-etl/downloads/2026-06/2026-06.zip
```

O ETL extrai seletivamente somente os ZIPs necessarios para a carga.

## Instalar

```bash
cd foodbi-etl
python3 -m venv .venv
. .venv/bin/activate
pip install -e .
cp .env.example .env
```

Preencha o `.env` com o MySQL do FoodBI Map.

## Teste com uma UF

```bash
python -m foodbi_etl full-load --only-uf SP --dry-run
```

Usando arquivos baixados manualmente:

```bash
python -m foodbi_etl full-load --local-dir downloads/2026-06 --only-uf SP --dry-run
```

## Carga de uma UF

```bash
python -m foodbi_etl full-load --only-uf SP
```

## Carga full Brasil

```bash
python -m foodbi_etl full-load
```

Com arquivos baixados manualmente:

```bash
python -m foodbi_etl full-load --local-dir downloads/2026-06
```

No macOS, tambem pode executar a carga completa pelo arquivo interativo:

```bash
./rodar-carga.command
```

Ele lista as pastas dentro de `downloads`, pergunta a competencia desejada, por exemplo `2026-07`, valida se existem arquivos `.zip`, roda a carga completa e depois atualiza as coordenadas municipais para habilitar estados/cidades no mapa:

```bash
.venv/bin/python -m foodbi_etl full-load --local-dir downloads/2026-07
.venv/bin/python -m foodbi_etl import-coords /tmp/foodbi-municipios.csv
```

Para retomar uma carga interrompida sem atualizar CNPJs que ja foram inseridos:

```bash
python -m foodbi_etl full-load --local-dir downloads/2026-06 --insert-ignore
```

Por padrao, arquivos temporarios sao apagados no final. Para manter downloads/staging:

```bash
python -m foodbi_etl full-load --keep-downloads
```

## Observacoes

- A carga full baixa varios GB de ZIPs da Receita e pode demorar bastante.
- O MySQL recebe somente dados tratados.
- A base oficial nao traz latitude/longitude de municipios. Para desenhar bolhas no mapa, preencha `MUNICIPALITY_COORDS_CSV` com um CSV pequeno contendo `ibge_code,uf,name,latitude,longitude`.
- A tabela `etl_metadata` registra release da Receita, data da carga e totais importados.

## Carga validada

Em `2026-07-09`, a competencia `2026-06` foi processada a partir de `downloads/2026-06/2026-06.zip`.

Totais no MySQL:

- estabelecimentos importados: `1.600.869`;
- cidades frescas: `5.571`;
- linhas de agregados: `34.445`;
- soma dos agregados: `1.600.869`.

## Coordenadas municipais

Para preencher `cities.latitude` e `cities.longitude`, use um CSV pequeno de municipios com `siafi_id`, latitude e longitude.

Exemplo:

```bash
curl -L -o /tmp/municipios.csv https://raw.githubusercontent.com/kelvins/Municipios-Brasileiros/main/csv/municipios.csv
python -m foodbi_etl import-coords /tmp/municipios.csv
```

O campo `cities.ibge_code` recebe o codigo municipal da Receita, equivalente ao `siafi_id` desse CSV.
