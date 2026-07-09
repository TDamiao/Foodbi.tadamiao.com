CREATE TABLE IF NOT EXISTS cities (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  uf CHAR(2) NOT NULL,
  name VARCHAR(120) NOT NULL,
  ibge_code INT NULL,
  latitude DECIMAL(10, 7) NULL,
  longitude DECIMAL(10, 7) NULL,
  collection_status ENUM('never_collected','fresh','stale','running','failed','unsupported') NOT NULL DEFAULT 'never_collected',
  last_update_at DATETIME NULL,
  last_requested_at DATETIME NULL,
  last_error TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cities_uf_name (uf, name),
  KEY idx_cities_uf (uf),
  KEY idx_cities_ibge (ibge_code),
  KEY idx_cities_status (collection_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cnae_categories (
  cnae VARCHAR(7) NOT NULL PRIMARY KEY,
  category VARCHAR(80) NOT NULL,
  description VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cnae_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS establishments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  cnpj VARCHAR(14) NOT NULL,
  trade_name VARCHAR(255) NULL,
  legal_name VARCHAR(255) NULL,
  cnae VARCHAR(7) NOT NULL,
  category VARCHAR(80) NOT NULL,
  registration_status VARCHAR(40) NULL,
  opening_date DATE NULL,
  uf CHAR(2) NOT NULL,
  municipality VARCHAR(120) NOT NULL,
  neighborhood VARCHAR(120) NULL,
  address VARCHAR(255) NULL,
  address_number VARCHAR(30) NULL,
  zip_code VARCHAR(12) NULL,
  source VARCHAR(60) NOT NULL,
  source_updated_at DATETIME NULL,
  collected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_establishments_cnpj (cnpj),
  KEY idx_est_uf_city (uf, municipality),
  KEY idx_est_cnae (cnae),
  KEY idx_est_category (category),
  KEY idx_est_status (registration_status),
  FULLTEXT KEY ft_est_name (trade_name, legal_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS city_aggregates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  city_id BIGINT UNSIGNED NOT NULL,
  uf CHAR(2) NOT NULL,
  municipality VARCHAR(120) NOT NULL,
  category VARCHAR(80) NOT NULL,
  total INT UNSIGNED NOT NULL DEFAULT 0,
  last_update_at DATETIME NOT NULL,
  UNIQUE KEY uq_city_category (city_id, category),
  KEY idx_agg_uf_city (uf, municipality),
  KEY idx_agg_category (category),
  CONSTRAINT fk_agg_city FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS etl_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  city_id BIGINT UNSIGNED NULL,
  requested_uf CHAR(2) NULL,
  requested_city VARCHAR(120) NULL,
  source VARCHAR(60) NOT NULL,
  status ENUM('started','success','failed','skipped','unsupported','rate_limited') NOT NULL,
  message TEXT NULL,
  error_code VARCHAR(80) NULL,
  records_found INT UNSIGNED NOT NULL DEFAULT 0,
  duration_ms INT UNSIGNED NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  KEY idx_etl_city (city_id),
  KEY idx_etl_status (status),
  KEY idx_etl_requested (requested_uf, requested_city),
  CONSTRAINT fk_etl_city FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS data_sources (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  source_key VARCHAR(60) NOT NULL,
  name VARCHAR(120) NOT NULL,
  base_url VARCHAR(255) NOT NULL,
  supports_city_search BOOLEAN NOT NULL DEFAULT FALSE,
  supports_uf_search BOOLEAN NOT NULL DEFAULT FALSE,
  supports_cnae_filter BOOLEAN NOT NULL DEFAULT FALSE,
  supports_pagination BOOLEAN NOT NULL DEFAULT FALSE,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  known_limit VARCHAR(255) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'available',
  notes TEXT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_data_sources_key (source_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
