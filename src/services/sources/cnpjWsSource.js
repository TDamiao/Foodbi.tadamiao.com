import axios from 'axios';
import { env } from '../../config/env.js';
import { BaseCnpjSource } from './baseSource.js';
import { withRetry } from '../../utils/retry.js';

export class CnpjWsSource extends BaseCnpjSource {
  constructor(metadata) {
    super(metadata);
    this.client = axios.create({
      baseURL: 'https://publica.cnpj.ws',
      timeout: env.externalTimeoutMs
    });
  }

  async fetchByCnpj(cnpj) {
    const cleanCnpj = String(cnpj).replace(/\D/g, '');
    const response = await withRetry(() => this.client.get(`/cnpj/${cleanCnpj}`), {
      attempts: env.retryAttempts,
      baseDelayMs: env.retryBaseDelayMs,
      retryStatusCodes: [408, 425, 429, 500, 502, 503, 504]
    });
    return response.data;
  }
}
