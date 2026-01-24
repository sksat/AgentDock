/**
 * Container configuration for running Claude Code in Podman containers.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface ContainerMount {
  /** Host path (supports ~ expansion) */
  source: string;
  /** Container path */
  target: string;
  /** Mount options: 'ro' (readonly), 'rw' (read-write), 'O' (overlay) */
  options: string;
}

export interface ContainerConfig {
  /** Enable container mode */
  enabled: boolean;
  /** Container runtime (currently only 'podman') */
  runtime: 'podman';
  /** Container image name */
  image: string;
  /** Use overlay mount for workdir (copy-on-write) */
  workdirOverlay: boolean;
  /** Additional volume mounts */
  extraMounts: ContainerMount[];
  /** Additional arguments to pass to podman */
  extraArgs: string[];
  /** Enable browser bridge in the container (Issue #78: same-container mode) */
  browserBridgeEnabled?: boolean;
  /** Bridge port number (default: 3002) */
  bridgePort?: number;
}

/**
 * Expand ~ to home directory in path.
 */
export function expandPath(path: string): string {
  if (path.startsWith('~/')) {
    return `${process.env.HOME}${path.slice(1)}`;
  }
  return path;
}

/**
 * Build podman run arguments from container configuration.
 *
 * @param config Container configuration
 * @param workingDir Host working directory to mount
 * @param env Environment variables to pass to container
 * @returns Array of podman arguments
 */
export function buildPodmanArgs(
  config: ContainerConfig,
  workingDir: string,
  env: Record<string, string>
): string[] {
  const args: string[] = ['run'];

  // Interactive mode with TTY
  args.push('-it');

  // Remove container after exit
  args.push('--rm');

  // Map host UID to container (rootless compatibility)
  args.push('--userns=keep-id');

  // Working directory mount
  const workdirOptions = config.workdirOverlay ? 'O' : 'rw';
  args.push('-v', `${workingDir}:/workspace:${workdirOptions}`);

  // Set working directory inside container
  args.push('-w', '/workspace');

  // Extra mounts
  for (const mount of config.extraMounts) {
    const expandedSource = expandPath(mount.source);
    args.push('-v', `${expandedSource}:${mount.target}:${mount.options}`);
  }

  // Environment variables
  for (const [key, value] of Object.entries(env)) {
    args.push('-e', `${key}=${value}`);
  }

  // Browser bridge environment variables (Issue #78: same-container mode)
  if (config.browserBridgeEnabled) {
    args.push('-e', 'BROWSER_BRIDGE_ENABLED=true');
    args.push('-e', `BRIDGE_PORT=${config.bridgePort ?? 3002}`);
  }

  // Extra arguments
  args.push(...config.extraArgs);

  // Container image
  args.push(config.image);

  return args;
}

export interface CreateContainerConfigOptions extends Partial<ContainerConfig> {
  /** Skip default mounts (~/.gitconfig, ~/.claude). Useful for testing. */
  skipDefaultMounts?: boolean;
}

/**
 * Check if a path exists (expanding ~ to home directory).
 */
function pathExists(p: string): boolean {
  const expanded = expandPath(p);
  try {
    fs.accessSync(expanded);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create default container configuration.
 */
export function createDefaultContainerConfig(
  image: string,
  options?: CreateContainerConfigOptions
): ContainerConfig {
  // Build default mounts, only including files that exist
  const defaultMounts: ContainerMount[] = [];
  if (!options?.skipDefaultMounts) {
    // Git config (optional)
    if (pathExists('~/.gitconfig')) {
      defaultMounts.push({
        source: '~/.gitconfig',
        target: '/home/node/.gitconfig',
        options: 'ro',
      });
    }
    // Claude Max/Pro authentication credentials (optional but important)
    if (pathExists('~/.claude')) {
      defaultMounts.push({
        source: '~/.claude',
        target: '/home/node/.claude',
        options: 'rw',
      });
    }
    // gh-cli authentication (optional)
    if (pathExists('~/.config/gh')) {
      defaultMounts.push({
        source: '~/.config/gh',
        target: '/home/node/.config/gh',
        options: 'ro',
      });
    }
  }

  // Merge extraMounts: default mounts + user-provided mounts
  const extraMounts = options?.extraMounts?.length
    ? [...defaultMounts, ...options.extraMounts]
    : defaultMounts;

  return {
    enabled: true,
    runtime: 'podman',
    image,
    workdirOverlay: true,
    extraMounts,
    extraArgs: options?.extraArgs ?? [],
  };
}

/**
 * Get a git config value from the host system.
 * Returns null if the config is not set or git is not available.
 */
function getGitConfig(key: string): string | null {
  try {
    return execSync(`git config --global ${key}`, { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/**
 * Get Git environment variables for container.
 * Reads user.name and user.email from host's git config
 * and returns them as environment variables for the container entrypoint.
 */
export function getGitEnvVars(): Record<string, string> {
  const env: Record<string, string> = {};

  const userName = getGitConfig('user.name');
  const userEmail = getGitConfig('user.email');

  if (userName) {
    env['GIT_USER_NAME'] = userName;
  }
  if (userEmail) {
    env['GIT_USER_EMAIL'] = userEmail;
  }

  return env;
}
