import { getR2Env } from './r2-config';
import { getAwsClient } from './r2-client';

export type PresignPutResult = {
  uploadUrl: string;
  r2Key: string;
  expiresAt: Date;
  headers: Record<string, string>;
};

export type PresignGetResult = {
  downloadUrl: string;
  expiresAt: Date;
};

function objectUrl(r2Key: string): string {
  const env = getR2Env();
  const base = env.R2_ENDPOINT.replace(/\/$/, '');
  return `${base}/${env.R2_BUCKET}/${r2Key}`;
}

/** URL pública vía custom domain de R2 (sin firma). Requiere R2_PUBLIC_BASE_URL. */
export function buildPublicObjectUrl(r2Key: string): string | null {
  const base = getR2Env().R2_PUBLIC_BASE_URL?.replace(/\/$/, '');
  if (!base) {
    return null;
  }
  return `${base}/${r2Key}`;
}

function presignTargetUrl(r2Key: string, ttlSeconds: number): string {
  const url = new URL(objectUrl(r2Key));
  url.searchParams.set('X-Amz-Expires', String(ttlSeconds));
  return url.toString();
}

export async function presignPut(params: {
  r2Key: string;
  contentType: string;
  ttlSeconds?: number;
}): Promise<PresignPutResult> {
  const env = getR2Env();
  const ttl = params.ttlSeconds ?? env.R2_PRESIGN_TTL_SECONDS;
  const client = getAwsClient();

  const signed = await client.sign(presignTargetUrl(params.r2Key, ttl), {
    method: 'PUT',
    headers: { 'Content-Type': params.contentType },
    aws: { signQuery: true }
  });

  return {
    uploadUrl: signed.url,
    r2Key: params.r2Key,
    expiresAt: new Date(Date.now() + ttl * 1000),
    headers: { 'Content-Type': params.contentType }
  };
}

export async function presignGet(params: {
  r2Key: string;
  ttlSeconds?: number;
}): Promise<PresignGetResult> {
  const env = getR2Env();
  const ttl = params.ttlSeconds ?? env.R2_PRESIGN_TTL_SECONDS;

  const publicUrl = buildPublicObjectUrl(params.r2Key);
  if (publicUrl) {
    return {
      downloadUrl: publicUrl,
      expiresAt: new Date(Date.now() + ttl * 1000)
    };
  }

  const client = getAwsClient();

  const signed = await client.sign(presignTargetUrl(params.r2Key, ttl), {
    method: 'GET',
    aws: { signQuery: true }
  });

  return {
    downloadUrl: signed.url,
    expiresAt: new Date(Date.now() + ttl * 1000)
  };
}
