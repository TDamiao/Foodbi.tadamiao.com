export class UnsupportedRegionalSearchError extends Error {
  constructor(sourceKey) {
    super(`A fonte ${sourceKey} nao permite busca por UF/municipio/CNAE com paginacao na API publica.`);
    this.code = 'UNSUPPORTED_REGIONAL_SEARCH';
    this.status = 422;
  }
}

export class BaseCnpjSource {
  constructor(metadata) {
    this.metadata = metadata;
  }

  get key() {
    return this.metadata.sourceKey;
  }

  supportsRegionalSearch() {
    return Boolean(
      this.metadata.supportsCitySearch &&
      this.metadata.supportsUfSearch &&
      this.metadata.supportsCnaeFilter &&
      this.metadata.supportsPagination
    );
  }

  async fetchByCity() {
    throw new UnsupportedRegionalSearchError(this.key);
  }
}
