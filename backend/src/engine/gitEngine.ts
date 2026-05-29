import { simpleGit } from 'simple-git';
import { promises as fs } from 'fs';
import { logger } from '../utils/logger.js';

export const gitEngine = {
  async cloneRepository(
    githubUrl: string,
    targetPath: string,
    branch: string = 'main'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info('Cloning repository', { githubUrl, targetPath, branch });

      // Create directory if it doesn't exist
      await fs.mkdir(targetPath, { recursive: true });

      const git = simpleGit();
      await git.clone(githubUrl, targetPath, ['--branch', branch]);

      logger.info('Repository cloned successfully');
      return { success: true };
    } catch (error: any) {
      logger.error('Git clone failed', error);
      return { success: false, error: error.message };
    }
  },

  async detectFramework(repoPath: string): Promise<string | null> {
    try {
      const packageJsonPath = `${repoPath}/package.json`;
      const requirementsPath = `${repoPath}/requirements.txt`;
      const dockerfilePath = `${repoPath}/Dockerfile`;

      // Check for package.json to detect Node.js frameworks
      try {
        const packageJson = JSON.parse(
          await fs.readFile(packageJsonPath, 'utf-8')
        );

        if (packageJson.dependencies) {
          if (packageJson.dependencies.next) return 'nextjs';
          if (packageJson.dependencies.express) return 'express';
          if (packageJson.dependencies.fastify) return 'fastify';
          return 'nodejs';
        }
      } catch {
        // package.json not found
      }

      // Check for Python
      try {
        await fs.stat(requirementsPath);
        return 'python';
      } catch {
        // requirements.txt not found
      }

      // Check for Dockerfile
      try {
        await fs.stat(dockerfilePath);
        return 'docker';
      } catch {
        // Dockerfile not found
      }

      // Default to nodejs if no framework detected but has package.json
      try {
        await fs.stat(packageJsonPath);
        return 'nodejs';
      } catch {
        // package.json not found
      }

      return 'static';
    } catch (error) {
      logger.error('Framework detection failed', error);
      return 'nodejs'; // Default fallback
    }
  },

  async getLastCommit(repoPath: string): Promise<{ hash: string; message: string } | null> {
    try {
      const git = simpleGit(repoPath);
      const log = await git.log(['-1']);

      if (log.latest) {
        return {
          hash: log.latest.hash,
          message: log.latest.message,
        };
      }

      return null;
    } catch (error) {
      logger.error('Get last commit failed', error);
      return null;
    }
  },
};
