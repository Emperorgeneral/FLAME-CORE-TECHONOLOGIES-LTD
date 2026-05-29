import bcrypt from 'bcrypt';
import { FastifyInstance } from 'fastify';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function registerAuth(fastify: FastifyInstance, secret: string) {
  await fastify.register(require('@fastify/jwt'), {
    secret,
    sign: { expiresIn: '7d' },
  });
}

export function generateAPIKey(): string {
  return `fc_${Math.random().toString(36).substr(2, 9)}_${Date.now().toString(36)}`;
}
