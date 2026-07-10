# FoodBI

FoodBI e um MVP open-source em Node.js + MySQL para analisar estabelecimentos de alimentacao por cidade, com backend proprio, MySQL como base tratada e frontend simples com Leaflet.

O projeto comecou validando APIs publicas de CNPJ, mas a carga regional completa foi implementada em um subprojeto ETL local separado, usando os ZIPs oficiais da Receita Federal na maquina do operador. A aplicacao web consulta apenas o MySQL tratado, sem BigQuery e sem depender de arquivos brutos na VPS.

## Estado atual dos dados

Em `2026-07-09`, foi executada uma carga local pelo subprojeto [foodbi-etl](foodbi-etl/README.md) com a competencia `2026-06` da Receita Federal.

- Fonte: Receita Federal Dados Abertos CNPJ
- Competencia dos arquivos: `2026-06`
- Estabelecimentos ativos de alimentacao importados: `1.600.869`
- Cidades com dados: `5.571`
- Agregados gerados: `34.445`
- Coordenadas municipais atualizadas: `5.570` cidades

A validacao inicial encontrou que CNPJ.ws publica, BrasilAPI CNPJ e ReceitaWS gratuita funcionam principalmente por consulta individual de CNPJ. Como elas nao oferecem busca publica por UF/municipio/CNAE com paginacao, o dashboard nao tenta varrer cidades por essas APIs. Esse conector ficou preparado para uma fonte regional futura.

## Requisitos

- Node.js 20+
- MySQL 8+

## Configuracao

Crie um `.env` baseado em `.env.example` e configure o banco MySQL.

```bash
npm install
npm run db:setup
npm start
```

Abra `http://localhost:3000`.

## Scripts

- `npm run db:setup`: cria tabelas e popula CNAEs/fontes.
- `npm run dev`: inicia API e frontend com watch.
- `npm start`: inicia em modo normal.
- `npm run job:daily`: executa a rotina leve de atualizacao de fontes regionais, quando houver uma fonte compativel configurada.

## Endpoints internos

- `GET /api/totals`
- `GET /api/categories/totals`
- `GET /api/map/rollups?level=state|city&uf=&category=`
- `GET /api/states/:uf/analysis`
- `GET /api/cities`
- `GET /api/cities/search?q=&uf=`
- `GET /api/cities/:uf/:city/status`
- `GET /api/cities/:uf/:city/aggregates`
- `GET /api/cities/:uf/:city/categories`
- `GET /api/cities/:uf/:city/establishments?page=&pageSize=`
- `GET /api/establishments/search?uf=&city=&q=`
- `GET /api/ranking/cities`
- `GET /api/last-update`
- `GET /api/sources`

## Dashboard

A interface web esta organizada em tres telas:

- `Mapa`: visao geografica com bolhas agregadas por UF ou cidade conforme o zoom.
- `Estados`: analise por UF com totais, top cidades do estado e distribuicao por categoria.
- `Cidades`: ranking nacional, detalhe da cidade, categorias e tabela paginada de estabelecimentos.
- `Dados`: fonte, escopo e metodologia da carga local.

O frontend nunca consulta fontes externas diretamente. Ele usa somente os endpoints internos e o MySQL tratado.

## Banco

Tabelas principais:

- `cities`
- `cnae_categories`
- `establishments`
- `city_aggregates`
- `etl_runs`
- `data_sources`

O schema cria chave unica por CNPJ em `establishments` e indices para UF, municipio, CNAE, categoria, situacao e CNPJ. O projeto guarda somente dados tratados.

## Fontes

Leia [docs/data-sources.md](docs/data-sources.md) para as limitacoes das APIs publicas e para o contrato esperado de uma fonte regional futura.

## Carga oficial local

O subprojeto [foodbi-etl](foodbi-etl/README.md) permite rodar uma carga local dos ZIPs oficiais da Receita Federal e gravar no MySQL apenas estabelecimentos ativos dos CNAEs de alimentacao, cidades, agregados e metadata da carga. Ele e separado do servidor web para manter a VPS leve.

As coordenadas municipais foram enriquecidas com um CSV pequeno de municipios brasileiros, usando o campo `siafi_id` como equivalente ao codigo municipal da Receita Federal. Com isso, as bolhas do mapa aparecem para as cidades que possuem coordenadas.
