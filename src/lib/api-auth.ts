import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { env } from './env';

export type ApiScope = 'analytics:read' | 'analytics:sync';

export type ApiClient = {
  id: string;
  secret: string;
  scopes: ApiScope[];
  description?: string;
};

export type ApiAuthorization =
  | { ok: true; client: Omit<ApiClient, 'secret'> }
  | { ok: false; status: 401 | 403 | 500; error: string; clientId: string | null };

function parseClients(): ApiClient[] {
  let value: unknown;
  try {
    value = JSON.parse(env.apiClientsJson());
  } catch {
    throw new Error('API_CLIENTS_JSON must be valid JSON');
  }

  if (!Array.isArray(value)) throw new Error('API_CLIENTS_JSON must be a JSON array');
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`API client ${index} must be an object`);
    const client = item as Record<string, unknown>;
    if (typeof client.id !== 'string' || !client.id.trim()) throw new Error(`API client ${index} is missing id`);
    if (typeof client.secret !== 'string' || client.secret.length < 32) {
      throw new Error(`API client ${client.id} must have a secret of at least 32 characters`);
    }
    if (!Array.isArray(client.scopes) || client.scopes.some((scope) => !['analytics:read', 'analytics:sync'].includes(String(scope)))) {
      throw new Error(`API client ${client.id} has invalid scopes`);
    }
    return {
      id: client.id,
      secret: client.secret,
      scopes: client.scopes as ApiScope[],
      description: typeof client.description === 'string' ? client.description : undefined,
    };
  });
}

function secretsMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function authorizeApiClient(req: NextRequest, requiredScope: ApiScope): ApiAuthorization {
  const clientId = req.headers.get('x-pillexis-client-id');
  const authorization = req.headers.get('authorization');
  const secret = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;

  if (!clientId || !secret) {
    return { ok: false, status: 401, error: 'client_id_and_bearer_token_required', clientId };
  }

  let clients: ApiClient[];
  try {
    clients = parseClients();
  } catch (error) {
    console.error('API client configuration error', error);
    return { ok: false, status: 500, error: 'api_auth_not_configured', clientId };
  }

  const client = clients.find((candidate) => candidate.id === clientId);
  if (!client || !secretsMatch(secret, client.secret)) {
    return { ok: false, status: 401, error: 'invalid_api_credentials', clientId };
  }
  if (!client.scopes.includes(requiredScope)) {
    return { ok: false, status: 403, error: 'insufficient_scope', clientId };
  }

  const { secret: _secret, ...safeClient } = client;
  return { ok: true, client: safeClient };
}
