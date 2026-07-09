INSERT INTO data_sources
  (source_key, name, base_url, supports_city_search, supports_uf_search, supports_cnae_filter, supports_pagination, known_limit, status, notes)
VALUES
  ('cnpjws', 'CNPJ.ws API Publica', 'https://publica.cnpj.ws', FALSE, FALSE, FALSE, FALSE, 'Ate 3 consultas por minuto na API publica, somente por CNPJ.', 'limited', 'Nao usar para varredura regional. Serve para consulta pontual por CNPJ e normalizacao futura.'),
  ('brasilapi', 'BrasilAPI CNPJ', 'https://brasilapi.com.br/api/cnpj/v1', FALSE, FALSE, FALSE, FALSE, 'Consulta publica por CNPJ individual.', 'limited', 'Nao oferece busca regional por UF/municipio/CNAE na API publica de CNPJ.'),
  ('receitaws', 'ReceitaWS', 'https://www.receitaws.com.br/v1/cnpj', FALSE, FALSE, FALSE, FALSE, 'Plano publico historicamente limitado e sujeito a bloqueios.', 'limited', 'Consulta individual por CNPJ; nao usar para varredura.'),
  ('opencnpj', 'OpenCNPJ', 'https://opencnpj.org', FALSE, FALSE, FALSE, FALSE, 'Validar contrato atual antes de habilitar.', 'pending_validation', 'Fonte candidata. Mantida desabilitada ate confirmar endpoint publico sem chave com filtros regionais e paginacao.')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  base_url = VALUES(base_url),
  supports_city_search = VALUES(supports_city_search),
  supports_uf_search = VALUES(supports_uf_search),
  supports_cnae_filter = VALUES(supports_cnae_filter),
  supports_pagination = VALUES(supports_pagination),
  known_limit = VALUES(known_limit),
  status = VALUES(status),
  notes = VALUES(notes);
