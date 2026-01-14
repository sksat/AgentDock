/**
 * Container configuration for running Claude Code in Podman containers.
 */

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

  // Extra arguments
  args.push(...config.extraArgs);

  // Container image
  args.push(config.image);

  return args;
}

/**
 * Create default container configuration.
 */
export function createDefaultContainerConfig(
  image: string,
  options?: Partial<ContainerConfig>
): ContainerConfig {
  return {
    enabled: true,
    runtime: 'podman',
    image,
    workdirOverlay: true,
    extraMounts: [
      {
        source: '~/.gitconfig',
        target: '/home/user/.gitconfig',
        options: 'ro',
      },
    ],
    extraArgs: [],
    ...options,
  };
}
