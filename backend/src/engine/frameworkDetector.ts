import { promises as fs } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';
import type { FrameworkType } from '../types/index.js';

interface FrameworkDetection {
  framework: FrameworkType;
  confidence: number; // 0-100
  buildCommand?: string;
  startCommand?: string;
  installCommand?: string;
  port?: number;
  dockerfile?: string;
  envVars?: Record<string, string>;
}

/**
 * Advanced framework detection.
 *
 * Reads package.json, requirements.txt, go.mod, Cargo.toml, etc.
 * Returns the most likely framework with build/start commands pre-filled.
 *
 * This powers the "auto-detect" option in the deploy modal.
 */
export const frameworkDetector = {
  async detect(repoPath: string): Promise<FrameworkDetection> {
    const detectors = [
      this.detectNextJs,
      this.detectNuxt,
      this.detectSvelteKit,
      this.detectAstro,
      this.detectRemix,
      this.detectReact,
      this.detectVue,
      this.detectExpress,
      this.detectFastify,
      this.detectNestJs,
      this.detectDjango,
      this.detectFlask,
      this.detectFastAPI,
      this.detectGo,
      this.detectRust,
      this.detectBun,
      this.detectDeno,
      this.detectDocker,
      this.detectStatic,
    ];

    for (const detector of detectors) {
      try {
        const result = await detector.call(this, repoPath);
        if (result) {
          logger.info('framework detected', { framework: result.framework, confidence: result.confidence });
          return result;
        }
      } catch (err) {
        // Continue to next detector
      }
    }

    // Fallback
    return {
      framework: 'nodejs',
      confidence: 50,
      buildCommand: 'npm run build',
      startCommand: 'npm start',
      installCommand: 'npm ci',
      port: 3000,
    };
  },

  async detectNextJs(repoPath: string): Promise<FrameworkDetection | null> {
    const pkg = await this.readPackageJson(repoPath);
    if (!pkg) return null;
    if (pkg.dependencies?.next || pkg.devDependencies?.next) {
      return {
        framework: 'nextjs',
        confidence: 95,
        buildCommand: 'npm run build',
        startCommand: 'npm start',
        installCommand: 'npm ci',
        port: 3000,
        envVars: { NODE_ENV: 'production' },
      };
    }
    return null;
  },

  async detectNuxt(repoPath: string): Promise<FrameworkDetection | null> {
    const pkg = await this.readPackageJson(repoPath);
    if (!pkg) return null;
    if (pkg.dependencies?.nuxt || pkg.devDependencies?.nuxt || pkg.dependencies?.['@nuxt/core']) {
      return {
        framework: 'nuxt',
        confidence: 95,
        buildCommand: 'npm run build',
        startCommand: 'npm start',
        installCommand: 'npm ci',
        port: 3000,
      };
    }
    return null;
  },

  async detectSvelteKit(repoPath: string): Promise<FrameworkDetection | null> {
    const pkg = await this.readPackageJson(repoPath);
    if (!pkg) return null;
    if (pkg.devDependencies?.['@sveltejs/kit']) {
      return {
        framework: 'svelte',
        confidence: 90,
        buildCommand: 'npm run build',
        startCommand: 'node build',
        installCommand: 'npm ci',
        port: 3000,
      };
    }
    return null;
  },

  async detectAstro(repoPath: string): Promise<FrameworkDetection | null> {
    const pkg = await this.readPackageJson(repoPath);
    if (!pkg) return null;
    if (pkg.dependencies?.astro || pkg.devDependencies?.astro) {
      return {
        framework: 'astro',
        confidence: 90,
        buildCommand: 'npm run build',
        startCommand: 'npm run preview',
        installCommand: 'npm ci',
        port: 4321,
      };
    }
    return null;
  },

  async detectRemix(repoPath: string): Promise<FrameworkDetection | null> {
    const pkg = await this.readPackageJson(repoPath);
    if (!pkg) return null;
    if (pkg.dependencies?.['@remix-run/node'] || pkg.dependencies?.['@remix-run/react']) {
      return {
        framework: 'remix',
        confidence: 90,
        buildCommand: 'npm run build',
        startCommand: 'npm start',
        installCommand: 'npm ci',
        port: 3000,
      };
    }
    return null;
  },

  async detectReact(repoPath: string): Promise<FrameworkDetection | null> {
    const pkg = await this.readPackageJson(repoPath);
    if (!pkg) return null;
    if (pkg.dependencies?.react && !pkg.dependencies?.next && !pkg.dependencies?.['@remix-run/react']) {
      // Likely Create React App or Vite
      const isVite = await this.fileExists(join(repoPath, 'vite.config.js')) || await this.fileExists(join(repoPath, 'vite.config.ts'));
      return {
        framework: 'react',
        confidence: 80,
        buildCommand: isVite ? 'npm run build' : 'npm run build',
        startCommand: isVite ? 'npm run preview' : 'npx serve -s build',
        installCommand: 'npm ci',
        port: isVite ? 4173 : 3000,
      };
    }
    return null;
  },

  async detectVue(repoPath: string): Promise<FrameworkDetection | null> {
    const pkg = await this.readPackageJson(repoPath);
    if (!pkg) return null;
    if (pkg.dependencies?.vue && !pkg.dependencies?.nuxt) {
      return {
        framework: 'vue',
        confidence: 80,
        buildCommand: 'npm run build',
        startCommand: 'npm run preview',
        installCommand: 'npm ci',
        port: 4173,
      };
    }
    return null;
  },

  async detectExpress(repoPath: string): Promise<FrameworkDetection | null> {
    const pkg = await this.readPackageJson(repoPath);
    if (!pkg) return null;
    if (pkg.dependencies?.express) {
      return {
        framework: 'express',
        confidence: 85,
        buildCommand: undefined,
        startCommand: pkg.scripts?.start ?? 'node index.js',
        installCommand: 'npm ci',
        port: 3000,
      };
    }
    return null;
  },

  async detectFastify(repoPath: string): Promise<FrameworkDetection | null> {
    const pkg = await this.readPackageJson(repoPath);
    if (!pkg) return null;
    if (pkg.dependencies?.fastify) {
      return {
        framework: 'fastify',
        confidence: 85,
        buildCommand: undefined,
        startCommand: pkg.scripts?.start ?? 'node server.js',
        installCommand: 'npm ci',
        port: 3000,
      };
    }
    return null;
  },

  async detectNestJs(repoPath: string): Promise<FrameworkDetection | null> {
    const pkg = await this.readPackageJson(repoPath);
    if (!pkg) return null;
    if (pkg.dependencies?.['@nestjs/core']) {
      return {
        framework: 'nestjs',
        confidence: 90,
        buildCommand: 'npm run build',
        startCommand: 'npm run start:prod',
        installCommand: 'npm ci',
        port: 3000,
      };
    }
    return null;
  },

  async detectDjango(repoPath: string): Promise<FrameworkDetection | null> {
    const hasRequirements = await this.fileExists(join(repoPath, 'requirements.txt'));
    const hasManagePy = await this.fileExists(join(repoPath, 'manage.py'));
    if (hasRequirements && hasManagePy) {
      const requirements = await fs.readFile(join(repoPath, 'requirements.txt'), 'utf-8');
      if (requirements.toLowerCase().includes('django')) {
        return {
          framework: 'django',
          confidence: 90,
          buildCommand: 'python manage.py collectstatic --noinput',
          startCommand: 'gunicorn app.wsgi:application',
          installCommand: 'pip install -r requirements.txt',
          port: 8000,
          envVars: { PYTHONUNBUFFERED: '1' },
        };
      }
    }
    return null;
  },

  async detectFlask(repoPath: string): Promise<FrameworkDetection | null> {
    const hasRequirements = await this.fileExists(join(repoPath, 'requirements.txt'));
    if (hasRequirements) {
      const requirements = await fs.readFile(join(repoPath, 'requirements.txt'), 'utf-8');
      if (requirements.toLowerCase().includes('flask')) {
        return {
          framework: 'flask',
          confidence: 85,
          startCommand: 'gunicorn app:app',
          installCommand: 'pip install -r requirements.txt',
          port: 5000,
        };
      }
    }
    return null;
  },

  async detectFastAPI(repoPath: string): Promise<FrameworkDetection | null> {
    const hasRequirements = await this.fileExists(join(repoPath, 'requirements.txt'));
    if (hasRequirements) {
      const requirements = await fs.readFile(join(repoPath, 'requirements.txt'), 'utf-8');
      if (requirements.toLowerCase().includes('fastapi')) {
        return {
          framework: 'fastapi',
          confidence: 85,
          startCommand: 'uvicorn main:app --host 0.0.0.0 --port 8000',
          installCommand: 'pip install -r requirements.txt',
          port: 8000,
        };
      }
    }
    return null;
  },

  async detectGo(repoPath: string): Promise<FrameworkDetection | null> {
    const hasGoMod = await this.fileExists(join(repoPath, 'go.mod'));
    if (hasGoMod) {
      return {
        framework: 'go',
        confidence: 90,
        buildCommand: 'go build -o app',
        startCommand: './app',
        port: 8080,
      };
    }
    return null;
  },

  async detectRust(repoPath: string): Promise<FrameworkDetection | null> {
    const hasCargo = await this.fileExists(join(repoPath, 'Cargo.toml'));
    if (hasCargo) {
      return {
        framework: 'rust',
        confidence: 90,
        buildCommand: 'cargo build --release',
        startCommand: './target/release/app',
        port: 8080,
      };
    }
    return null;
  },

  async detectBun(repoPath: string): Promise<FrameworkDetection | null> {
    const hasBunLock = await this.fileExists(join(repoPath, 'bun.lockb'));
    if (hasBunLock) {
      return {
        framework: 'bun',
        confidence: 85,
        buildCommand: undefined,
        startCommand: 'bun run start',
        installCommand: 'bun install',
        port: 3000,
      };
    }
    return null;
  },

  async detectDeno(repoPath: string): Promise<FrameworkDetection | null> {
    const hasDenoJson = await this.fileExists(join(repoPath, 'deno.json')) || await this.fileExists(join(repoPath, 'deno.jsonc'));
    if (hasDenoJson) {
      return {
        framework: 'deno',
        confidence: 85,
        startCommand: 'deno run --allow-net main.ts',
        port: 8000,
      };
    }
    return null;
  },

  async detectDocker(repoPath: string): Promise<FrameworkDetection | null> {
    const hasDockerfile = await this.fileExists(join(repoPath, 'Dockerfile')) || await this.fileExists(join(repoPath, 'dockerfile'));
    if (hasDockerfile) {
      return {
        framework: 'docker',
        confidence: 100,
        dockerfile: 'Dockerfile',
        port: 3000,
      };
    }
    return null;
  },

  async detectStatic(repoPath: string): Promise<FrameworkDetection | null> {
    const hasIndex = await this.fileExists(join(repoPath, 'index.html'));
    if (hasIndex) {
      return {
        framework: 'static',
        confidence: 70,
        port: 80,
      };
    }
    return null;
  },

  // ─── Helpers ─────────────────────────────────────────────────────────
  async readPackageJson(repoPath: string): Promise<any | null> {
    try {
      const content = await fs.readFile(join(repoPath, 'package.json'), 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  },

  async fileExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  },
};
