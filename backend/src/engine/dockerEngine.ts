import { exec } from 'child_process';
import { promisify } from 'util';
import { resolve } from 'path';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);
const VOLUME_BASE = process.env.PERSISTENT_VOLUME_BASE ?? '/var/flame-volumes';

export interface ContainerMount {
  hostPath: string;
  containerPath: string;
  readOnly?: boolean;
}

export interface ContainerResources {
  memoryMb?: number;
  cpus?: number;
  restartPolicy?: 'unless-stopped' | 'no' | 'always' | 'on-failure';
  restartRetries?: number;
}

function quote(v: string) {
  return `'${v.replace(/'/g, `'"'"'`)}'`;
}

function safeMounts(mounts: ContainerMount[]): ContainerMount[] {
  return mounts.filter((m) => {
    const host = resolve(m.hostPath);
    const container = m.containerPath;
    return host.startsWith(resolve(VOLUME_BASE)) && container.startsWith('/data/');
  });
}

/**
 * Docker runtime engine.
 *
 * Hardened for multi-tenant PaaS workloads:
 *  - no privileged mode
 *  - no host networking
 *  - no docker.sock exposure
 *  - read-only root filesystem
 *  - tmpfs for ephemeral tmp data
 *  - per-container CPU/RAM limits
 *  - persistent volumes only from approved base path
 */
export const dockerEngine = {
  async buildImage(dockerfilePath: string, imageName: string, tag: string = 'latest'): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info('Building Docker image', { imageName, tag });
      const fullImageName = `${imageName}:${tag}`;
      const { stdout } = await execAsync(`docker build -t ${quote(fullImageName)} -f ${quote(dockerfilePath)} .`, {
        cwd: dockerfilePath.replace('/Dockerfile', '').replace('/Dockerfile.generated', ''),
      });
      logger.info('Docker build complete', { imageName });
      return { success: true };
    } catch (error: any) {
      logger.error('Docker build failed', error);
      return { success: false, error: error.message };
    }
  },

  async startContainer(
    imageName: string,
    containerName: string,
    internalPort: number,
    envVars: Record<string, string> = {},
    mounts: ContainerMount[] = [],
    resources: ContainerResources = {}
  ): Promise<{ success: boolean; containerId?: string; error?: string }> {
    try {
      logger.info('Starting container', { containerName, imageName, internalPort });

      const envFlags = Object.entries(envVars)
        .map(([key, value]) => `-e ${quote(key)}=${quote(String(value))}`)
        .join(' ');

      const approvedMounts = safeMounts(mounts);
      const mountFlags = approvedMounts
        .map((m) => `-v ${quote(resolve(m.hostPath))}:${quote(m.containerPath)}${m.readOnly ? ':ro' : ''}`)
        .join(' ');

      const memoryMb = resources.memoryMb ?? 512;
      const cpus = resources.cpus ?? 0.5;
      const restartPolicy = resources.restartPolicy ?? 'unless-stopped';
      const restartFlag = restartPolicy === 'on-failure'
        ? `on-failure:${resources.restartRetries ?? 3}`
        : restartPolicy;

      const cmd = [
        'docker run -d',
        `--name ${quote(containerName)}`,
        `--publish ${internalPort}:3000`,
        `--memory ${memoryMb}m`,
        `--memory-swap ${memoryMb}m`,
        `--cpus ${cpus}`,
        '--pids-limit 256',
        `--restart ${restartFlag}`,
        '--network bridge',
        '--cap-drop ALL',
        '--security-opt no-new-privileges',
        '--read-only',
        '--tmpfs /tmp:rw,noexec,nosuid,size=64m',
        '--user 10001:10001',
        mountFlags,
        envFlags,
        `${quote(imageName)}:latest`,
      ].filter(Boolean).join(' ');

      const { stdout } = await execAsync(cmd);
      const containerId = stdout.trim();
      logger.info('Container started', { containerId, containerName, mounts: approvedMounts.length });
      return { success: true, containerId };
    } catch (error: any) {
      logger.error('Container start failed', error);
      return { success: false, error: error.message };
    }
  },

  async stopContainer(containerName: string): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info('Stopping container', { containerName });
      await execAsync(`docker stop ${quote(containerName)}`);
      return { success: true };
    } catch (error: any) {
      logger.error('Container stop failed', error);
      return { success: false, error: error.message };
    }
  },

  async removeContainer(containerName: string): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info('Removing container', { containerName });
      await execAsync(`docker rm -f ${quote(containerName)}`);
      return { success: true };
    } catch (error: any) {
      logger.error('Container removal failed', error);
      return { success: false, error: error.message };
    }
  },

  async getContainerLogs(containerName: string): Promise<string> {
    try {
      const { stdout, stderr } = await execAsync(`docker logs ${quote(containerName)}`);
      return `${stdout}${stderr}`;
    } catch (error: any) {
      return `Error retrieving logs: ${error.message}`;
    }
  },

  async containerExists(containerName: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`docker ps -a --filter name=^${quote(containerName)}$ --format {{.ID}}`);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  },
};
