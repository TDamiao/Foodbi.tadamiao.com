# Fontes de dados e limitacoes

Este projeto nao baixa a base completa da Receita Federal, nao usa BigQuery e nao salva arquivos brutos na VPS.

## Resultado da validacao inicial

As fontes publicas gratuitas mais comuns de CNPJ sao boas para consulta pontual por CNPJ, mas nao devem ser usadas para varrer cidades:

| Fonte | Busca por UF/municipio/CNAE | Paginacao regional | Uso no MVP |
| --- | --- | --- | --- |
| CNPJ.ws publica | Nao | Nao | Consulta pontual por CNPJ, sem varredura |
| BrasilAPI CNPJ | Nao | Nao | Consulta pontual por CNPJ |
| ReceitaWS gratuita | Nao confiavel para filtros regionais | Nao | Consulta pontual, respeitando limites |
| OpenCNPJ | Pendente de contrato publico estavel | Pendente | Conector preparado |

## Decisao de arquitetura

O backend so executa coleta regional quando a fonte configurada declara suporte simultaneo a:

- filtro por UF;
- filtro por municipio;
- filtro por CNAE;
- paginacao;
- uso publico compativel com atualizacao leve.

Se esses requisitos nao forem atendidos, a API interna registra uma execucao `unsupported` em `etl_runs`, atualiza a cidade como `unsupported` e retorna uma mensagem tecnica amigavel. O sistema nao tenta contornar limites consultando milhares de CNPJs individualmente.

## Como plugar uma fonte regional futura

Crie uma classe em `src/services/sources/` que estenda `BaseCnpjSource`, implemente `fetchByCity({ uf, city, cnaes })`, normalize os dados para a tabela `establishments` e marque a fonte em `data_sources` com os quatro campos de suporte como verdadeiros.

## Carga oficial local executada

Em `2026-07-09`, foi executada uma carga local pelo subprojeto `foodbi-etl` usando os arquivos da competencia `2026-06` da Receita Federal.

Resultado validado no MySQL:

- `1.600.869` estabelecimentos ativos de alimentacao;
- `5.571` cidades com status `fresh`;
- `34.445` linhas em `city_aggregates`;
- soma dos agregados: `1.600.869`.
