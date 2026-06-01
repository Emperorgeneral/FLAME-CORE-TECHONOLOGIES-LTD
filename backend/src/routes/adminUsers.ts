import { FastifyInstance, FastifyRequest } from 'fastify';
import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';

/**
 * Admin User Management & Billing Routes
 * Protected by requireAdmin middleware in admin.ts
 */

interface GetUsersQuery {
  page?: string;
  limit?: string;
  search?: string;
  role?: string;
}

interface UpdateUserBody {
  role?: 'admin' | 'owner' | 'member' | 'viewer';
  status?: 'active' | 'suspended' | 'deleted';
}

interface Plan {
  id: string;
  name: string;
  priceUSD: number;
  cpu: string;
  ram: string;
  storage: string;
}

interface UpdatePlanBody {
  name?: string;
  priceUSD?: number;
  cpu?: string;
  ram?: string;
  storage?: string;
}

export async function registerAdminUserRoutes(fastify: FastifyInstance) {
  // ─── Users Management ────────────────────────────────────
  
  // GET /api/admin/users - List all users with pagination & search
  fastify.get<{ Querystring: GetUsersQuery }>(
    '/api/admin/users',
    async (request, reply) => {
      const page = parseInt(request.query.page || '1');
      const limit = Math.min(parseInt(request.query.limit || '50'), 100);
      const search = request.query.search || '';
      const role = request.query.role || '';

      const offset = (page - 1) * limit;

      // Build query
      let whereClause = '1=1';
      const params: any[] = [];

      if (search) {
        whereClause += ` AND (email ILIKE $${params.length + 1} OR first_name ILIKE $${params.length + 1})`;
        params.push(`%${search}%`);
      }

      if (role) {
        whereClause += ` AND role = $${params.length + 1}`;
        params.push(role);
      }

      const countResult = await query(
        `SELECT COUNT(*)::int AS total FROM users WHERE ${whereClause}`,
        params
      );

      const usersResult = await query(
        `SELECT 
          id, email, first_name, last_name, role, status, 
          created_at, last_login, 
          (SELECT COUNT(*) FROM teams WHERE owner_id = users.id)::int AS teams_count
         FROM users 
         WHERE ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      );

      return reply.send({
        users: usersResult.rows.map((u: any) => ({
          id: u.id,
          email: u.email,
          name: `${u.first_name || ''} ${u.last_name || ''}`.trim(),
          role: u.role,
          status: u.status,
          teamsCount: u.teams_count,
          createdAt: u.created_at,
          lastLogin: u.last_login,
        })),
        pagination: {
          page,
          limit,
          total: countResult.rows[0].total,
          pages: Math.ceil(countResult.rows[0].total / limit),
        },
      });
    }
  );

  // GET /api/admin/users/:id - Get user details
  fastify.get<{ Params: { id: string } }>(
    '/api/admin/users/:id',
    async (request, reply) => {
      const result = await query(
        `SELECT id, email, first_name, last_name, role, status, company, 
                created_at, last_login, phone
         FROM users WHERE id = $1`,
        [request.params.id]
      );

      if (!result.rows[0]) {
        return reply.status(404).send({ error: 'user not found' });
      }

      return reply.send(result.rows[0]);
    }
  );

  // PATCH /api/admin/users/:id - Update user role or status
  fastify.patch<{ Params: { id: string }; Body: UpdateUserBody }>(
    '/api/admin/users/:id',
    async (request, reply) => {
      const { role, status } = request.body;

      // Prevent demoting last admin
      if (role && role !== 'admin') {
        const adminCount = await query(
          `SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin'`
        );
        if (adminCount.rows[0].n === 1) {
          return reply.status(400).send({ error: 'cannot demote last admin' });
        }
      }

      const updates: string[] = [];
      const params: any[] = [];

      if (role) {
        updates.push(`role = $${params.length + 1}`);
        params.push(role);
      }
      if (status) {
        updates.push(`status = $${params.length + 1}`);
        params.push(status);
      }

      if (updates.length === 0) {
        return reply.status(400).send({ error: 'no fields to update' });
      }

      params.push(request.params.id);
      const result = await query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
        params
      );

      logger.info(`admin-update-user id=${request.params.id} role=${role} status=${status}`);

      return reply.send({
        id: result.rows[0].id,
        email: result.rows[0].email,
        role: result.rows[0].role,
        status: result.rows[0].status,
      });
    }
  );

  // DELETE /api/admin/users/:id - Delete user (soft delete)
  fastify.delete<{ Params: { id: string } }>(
    '/api/admin/users/:id',
    async (request, reply) => {
      // Check if last admin
      if (request.params.id) {
        const userRole = await query(
          `SELECT role FROM users WHERE id = $1`,
          [request.params.id]
        );

        if (userRole.rows[0]?.role === 'admin') {
          const adminCount = await query(
            `SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin'`
          );
          if (adminCount.rows[0].n === 1) {
            return reply.status(400).send({ error: 'cannot delete last admin' });
          }
        }
      }

      await query(
        `UPDATE users SET status = 'deleted', deleted_at = NOW() WHERE id = $1`,
        [request.params.id]
      );

      logger.info(`admin-delete-user id=${request.params.id}`);

      return reply.send({ success: true });
    }
  );

  // ─── Billing & Plans Management ──────────────────────────

  // GET /api/admin/plans - List all pricing plans
  fastify.get(
    '/api/admin/plans',
    async (request, reply) => {
      const result = await query(
        `SELECT id, name, price_usd, cpu, ram, storage, bandwidth, 
                builds_per_month, projects_limit, features, created_at, updated_at
         FROM plans ORDER BY price_usd ASC`
      );

      return reply.send({
        plans: result.rows.map((p: any) => ({
          id: p.id,
          name: p.name,
          priceUSD: p.price_usd,
          cpu: p.cpu,
          ram: p.ram,
          storage: p.storage,
          bandwidth: p.bandwidth,
          buildsPerMonth: p.builds_per_month,
          projectsLimit: p.projects_limit,
          features: p.features || [],
        })),
      });
    }
  );

  // PATCH /api/admin/plans/:id - Update plan pricing or details
  fastify.patch<{ Params: { id: string }; Body: UpdatePlanBody }>(
    '/api/admin/plans/:id',
    async (request, reply) => {
      const { name, priceUSD, cpu, ram, storage } = request.body;

      const updates: string[] = [];
      const params: any[] = [];

      if (name) {
        updates.push(`name = $${params.length + 1}`);
        params.push(name);
      }
      if (priceUSD !== undefined) {
        updates.push(`price_usd = $${params.length + 1}`);
        params.push(priceUSD);
      }
      if (cpu) {
        updates.push(`cpu = $${params.length + 1}`);
        params.push(cpu);
      }
      if (ram) {
        updates.push(`ram = $${params.length + 1}`);
        params.push(ram);
      }
      if (storage) {
        updates.push(`storage = $${params.length + 1}`);
        params.push(storage);
      }

      if (updates.length === 0) {
        return reply.status(400).send({ error: 'no fields to update' });
      }

      updates.push(`updated_at = NOW()`);
      params.push(request.params.id);

      const result = await query(
        `UPDATE plans SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
        params
      );

      logger.info(`admin-update-plan id=${request.params.id}`);

      return reply.send({
        id: result.rows[0].id,
        name: result.rows[0].name,
        priceUSD: result.rows[0].price_usd,
        cpu: result.rows[0].cpu,
      });
    }
  );

  // GET /api/admin/billing - Billing overview (MRR, subscriptions, etc.)
  fastify.get(
    '/api/admin/billing',
    async (request, reply) => {
      const [mrrResult, activeSubsResult, canceledSubsResult] = await Promise.all([
        query(
          `SELECT COALESCE(SUM(amount_usd_minor),0)::bigint AS total_usd_minor
           FROM invoices WHERE status = 'paid' AND created_at >= date_trunc('month', now())`
        ),
        query(`SELECT COUNT(*)::int AS n FROM subscriptions WHERE status = 'active'`),
        query(`SELECT COUNT(*)::int AS n FROM subscriptions WHERE status = 'canceled'`),
      ]);

      return reply.send({
        mrr: {
          totalUSD: mrrResult.rows[0].total_usd_minor / 100,
          totalUSDMinor: mrrResult.rows[0].total_usd_minor,
        },
        subscriptions: {
          active: activeSubsResult.rows[0].n,
          canceled: canceledSubsResult.rows[0].n,
        },
      });
    }
  );
}
