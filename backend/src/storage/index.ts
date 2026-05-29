import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { logger } from '../utils/logger.js';
import type { StorageProviderKind, StorageVisibility } from '../types/index.js';

/**
 * Storage abstraction layer.
 *
 * Supports:
 *  - Local filesystem (MVP)
 *  - AWS S3 (production)
 *  - Cloudflare R2 (S3-compatible)
 *  - Backblaze B2 (S3-compatible)
 *
 * Key namespace:
 *  - deployments/<id>/build.log
 *  - deployments/<id>/runtime.log
 *  - uploads/<team>/<project>/<file>
 *  - media/<team>/<project>/<variant>
 *  - backups/...
 */

export interface StoredObjectMeta {
  etag?: string | null;
  contentType?: string;
  sizeBytes?: number;
  provider: StorageProviderKind;
}

export interface StoragePutOptions {
  contentType?: string;
  visibility?: StorageVisibility;
  metadata?: Record<string, string>;
  cacheControl?: string;
}

export interface StorageProvider {
  kind: StorageProviderKind;
  put(key: string, body: Buffer | string, options?: StoragePutOptions): Promise<StoredObjectMeta>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  list(prefix: string): Promise<string[]>;
  publicUrl(key: string): string;
  signedDownloadUrl?(key: string, expiresInSeconds?: number): Promise<string>;
  health(): Promise<{ ok: boolean; message: string }>;
}

class LocalStorage implements StorageProvider {
  kind: StorageProviderKind = 'local';

  constructor(private basePath: string, private publicBase = '/storage') {}

  private path(key: string) {
    return join(this.basePath, key.replace(/\.{2,}/g, '').replace(/^\/+/, ''));
  }

  async put(key: string, body: Buffer | string, options?: StoragePutOptions): Promise<StoredObjectMeta> {
    const p = this.path(key);
    await fs.mkdir(dirname(p), { recursive: true });
    const buffer = typeof body === 'string' ? Buffer.from(body) : body;
    await fs.writeFile(p, buffer);
    return {
      provider: this.kind,
      sizeBytes: buffer.byteLength,
      contentType: options?.contentType,
      etag: null,
    };
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.path(key));
  }

  async delete(key: string): Promise<void> {
    try { await fs.unlink(this.path(key)); } catch { /* ignore */ }
  }

  async exists(key: string): Promise<boolean> {
    try { await fs.access(this.path(key)); return true; } catch { return false; }
  }

  async list(prefix: string): Promise<string[]> {
    const dir = this.path(prefix);
    try {
      const entries = await fs.readdir(dir, { recursive: true });
      return entries.map((e) => join(prefix, e.toString()));
    } catch {
      return [];
    }
  }

  publicUrl(key: string): string {
    return `${this.publicBase}/${key}`;
  }

  async signedDownloadUrl(key: string): Promise<string> {
    return `${this.publicBase}/${key}`;
  }

  async health() {
    try {
      await fs.mkdir(this.basePath, { recursive: true });
      return { ok: true, message: `local:${this.basePath}` };
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  }
}

class S3Storage implements StorageProvider {
  kind: StorageProviderKind;
  private bucket: string;
  private endpoint: string;
  private region: string;
  private publicBase?: string;

  constructor(kind: StorageProviderKind) {
    this.kind = kind;
    this.bucket = process.env.S3_BUCKET ?? '';
    this.endpoint = process.env.S3_ENDPOINT ?? '';
    this.region = process.env.S3_REGION ?? 'us-east-1';
    this.publicBase = process.env.S3_PUBLIC_BASE_URL ?? undefined;
  }

  private async getSdk() {
    const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({
      region: this.region,
      endpoint: this.endpoint || undefined,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? '',
        secretAccessKey: process.env.S3_SECRET_KEY ?? '',
      },
      forcePathStyle: !!this.endpoint,
    });
    return { client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand };
  }

  async put(key: string, body: Buffer | string, options?: StoragePutOptions): Promise<StoredObjectMeta> {
    const { client, PutObjectCommand } = await this.getSdk();
    const buffer = typeof body === 'string' ? Buffer.from(body) : body;
    const out = await client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: options?.contentType ?? 'application/octet-stream',
      CacheControl: options?.cacheControl,
      Metadata: options?.metadata,
      ACL: this.kind === 's3' && options?.visibility === 'public' ? 'public-read' : undefined,
    }));
    return {
      provider: this.kind,
      sizeBytes: buffer.byteLength,
      contentType: options?.contentType,
      etag: out.ETag ?? null,
    };
  }

  async get(key: string): Promise<Buffer> {
    const { client, GetObjectCommand } = await this.getSdk();
    const res = await client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as any) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<void> {
    const { client, DeleteObjectCommand } = await this.getSdk();
    await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    try {
      const { client, HeadObjectCommand } = await this.getSdk();
      await client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async list(prefix: string): Promise<string[]> {
    const { client, ListObjectsV2Command } = await this.getSdk();
    const res = await client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, MaxKeys: 1000 }));
    return (res.Contents ?? []).map((c) => c.Key!).filter(Boolean);
  }

  publicUrl(key: string): string {
    if (this.publicBase) return `${this.publicBase.replace(/\/$/, '')}/${key}`;
    if (this.endpoint) return `${this.endpoint.replace(/\/$/, '')}/${this.bucket}/${key}`;
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  async health() {
    try {
      const { client, ListObjectsV2Command } = await this.getSdk();
      await client.send(new ListObjectsV2Command({ Bucket: this.bucket, MaxKeys: 1 }));
      return { ok: true, message: `${this.kind}:${this.bucket}` };
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  }
}

function detectProviderKind(): StorageProviderKind {
  const explicit = (process.env.STORAGE_PROVIDER ?? '').toLowerCase();
  if (explicit === 'r2') return 'r2';
  if (explicit === 'b2') return 'b2';
  if (explicit === 's3') return 's3';
  if (process.env.S3_BUCKET) {
    if ((process.env.S3_ENDPOINT ?? '').includes('cloudflarestorage')) return 'r2';
    if ((process.env.S3_ENDPOINT ?? '').includes('backblazeb2')) return 'b2';
    return 's3';
  }
  return 'local';
}

function createStorage(): StorageProvider {
  const kind = detectProviderKind();
  if (kind !== 'local') {
    logger.info('storage: using object storage', {
      kind,
      bucket: process.env.S3_BUCKET,
      endpoint: process.env.S3_ENDPOINT ?? 'aws-default',
    });
    return new S3Storage(kind);
  }

  const localPath = process.env.LOCAL_STORAGE_PATH ?? '/var/flame-storage';
  logger.info('storage: using local filesystem', { path: localPath });
  return new LocalStorage(localPath);
}

export const storage = createStorage();
