import { describe, it, expect } from 'vitest';
import {
  parsePermissionPattern,
  matchesPermission,
  suggestPattern,
  type PermissionPattern,
} from '../permission-pattern';

describe('parsePermissionPattern', () => {
  it('should parse simple tool name', () => {
    expect(parsePermissionPattern('Bash')).toEqual({ toolName: 'Bash' });
  });

  it('should parse tool name with empty pattern', () => {
    expect(parsePermissionPattern('Bash()')).toEqual({ toolName: 'Bash', pattern: '' });
  });

  it('should parse pattern with prefix wildcard', () => {
    expect(parsePermissionPattern('Bash(git:*)')).toEqual({
      toolName: 'Bash',
      pattern: 'git:*',
    });
  });

  it('should parse pattern with glob wildcard', () => {
    expect(parsePermissionPattern('Bash(git*)')).toEqual({
      toolName: 'Bash',
      pattern: 'git*',
    });
  });

  it('should parse pattern with file path', () => {
    expect(parsePermissionPattern('Write(./src/**)')).toEqual({
      toolName: 'Write',
      pattern: './src/**',
    });
  });

  it('should parse complex pattern with spaces', () => {
    expect(parsePermissionPattern('Bash(git commit -m:*)')).toEqual({
      toolName: 'Bash',
      pattern: 'git commit -m:*',
    });
  });

  it('should handle nested parentheses in pattern', () => {
    expect(parsePermissionPattern('Bash(echo $(date):*)')).toEqual({
      toolName: 'Bash',
      pattern: 'echo $(date):*',
    });
  });
});

describe('matchesPermission - Bash tool', () => {
  it('should match exact command', () => {
    const patterns: PermissionPattern[] = [{ toolName: 'Bash', pattern: 'git status' }];
    expect(matchesPermission('Bash', { command: 'git status' }, patterns)).toBe(true);
    expect(matchesPermission('Bash', { command: 'git log' }, patterns)).toBe(false);
  });

  it('should match prefix pattern with :*', () => {
    const patterns: PermissionPattern[] = [{ toolName: 'Bash', pattern: 'git:*' }];
    expect(matchesPermission('Bash', { command: 'git status' }, patterns)).toBe(true);
    expect(matchesPermission('Bash', { command: 'git commit -m "msg"' }, patterns)).toBe(true);
    expect(matchesPermission('Bash', { command: 'git' }, patterns)).toBe(true);
    // Should NOT match - :* is prefix matching with word boundary
    expect(matchesPermission('Bash', { command: 'gitk' }, patterns)).toBe(false);
  });

  it('should match glob pattern with *', () => {
    const patterns: PermissionPattern[] = [{ toolName: 'Bash', pattern: 'git*' }];
    expect(matchesPermission('Bash', { command: 'git status' }, patterns)).toBe(true);
    expect(matchesPermission('Bash', { command: 'gitk' }, patterns)).toBe(true);
    expect(matchesPermission('Bash', { command: 'git' }, patterns)).toBe(true);
  });

  it('should match pattern with * in middle', () => {
    const patterns: PermissionPattern[] = [{ toolName: 'Bash', pattern: 'git * main' }];
    expect(matchesPermission('Bash', { command: 'git checkout main' }, patterns)).toBe(true);
    expect(matchesPermission('Bash', { command: 'git merge main' }, patterns)).toBe(true);
    expect(matchesPermission('Bash', { command: 'git checkout feature' }, patterns)).toBe(false);
  });

  it('should match tool-only pattern (no specific pattern)', () => {
    const patterns: PermissionPattern[] = [{ toolName: 'Bash' }];
    expect(matchesPermission('Bash', { command: 'rm -rf /' }, patterns)).toBe(true);
    expect(matchesPermission('Bash', { command: 'ls' }, patterns)).toBe(true);
  });

  it('should not match different tool', () => {
    const patterns: PermissionPattern[] = [{ toolName: 'Bash', pattern: 'git:*' }];
    expect(matchesPermission('Write', { command: 'git status' }, patterns)).toBe(false);
  });

  it('should match if any pattern matches', () => {
    const patterns: PermissionPattern[] = [
      { toolName: 'Bash', pattern: 'git:*' },
      { toolName: 'Bash', pattern: 'npm:*' },
    ];
    expect(matchesPermission('Bash', { command: 'git status' }, patterns)).toBe(true);
    expect(matchesPermission('Bash', { command: 'npm install' }, patterns)).toBe(true);
    expect(matchesPermission('Bash', { command: 'rm -rf /' }, patterns)).toBe(false);
  });

  it('should handle missing command in input', () => {
    const patterns: PermissionPattern[] = [{ toolName: 'Bash', pattern: 'git:*' }];
    expect(matchesPermission('Bash', {}, patterns)).toBe(false);
    expect(matchesPermission('Bash', null, patterns)).toBe(false);
    expect(matchesPermission('Bash', undefined, patterns)).toBe(false);
  });
});

describe('matchesPermission - Read/Write/Edit tools', () => {
  it('should match exact file path', () => {
    const patterns: PermissionPattern[] = [{ toolName: 'Write', pattern: './src/index.ts' }];
    expect(matchesPermission('Write', { file_path: './src/index.ts' }, patterns)).toBe(true);
    expect(matchesPermission('Write', { file_path: './src/other.ts' }, patterns)).toBe(false);
  });

  it('should match directory glob pattern with **', () => {
    const patterns: PermissionPattern[] = [{ toolName: 'Write', pattern: './src/**' }];
    expect(matchesPermission('Write', { file_path: './src/index.ts' }, patterns)).toBe(true);
    expect(matchesPermission('Write', { file_path: './src/components/App.tsx' }, patterns)).toBe(true);
    expect(matchesPermission('Write', { file_path: './test/index.ts' }, patterns)).toBe(false);
  });

  it('should match file extension pattern', () => {
    const patterns: PermissionPattern[] = [{ toolName: 'Read', pattern: '**/*.ts' }];
    expect(matchesPermission('Read', { file_path: './src/index.ts' }, patterns)).toBe(true);
    expect(matchesPermission('Read', { file_path: './src/style.css' }, patterns)).toBe(false);
  });

  it('should work with Edit tool', () => {
    const patterns: PermissionPattern[] = [{ toolName: 'Edit', pattern: './src/**' }];
    expect(matchesPermission('Edit', { file_path: './src/app.ts' }, patterns)).toBe(true);
    expect(matchesPermission('Edit', { file_path: './package.json' }, patterns)).toBe(false);
  });

  it('should handle missing file_path in input', () => {
    const patterns: PermissionPattern[] = [{ toolName: 'Write', pattern: './src/**' }];
    expect(matchesPermission('Write', {}, patterns)).toBe(false);
    expect(matchesPermission('Write', null, patterns)).toBe(false);
  });
});

describe('matchesPermission - empty patterns', () => {
  it('should return false for empty patterns array', () => {
    expect(matchesPermission('Bash', { command: 'git status' }, [])).toBe(false);
  });

  it('should return false for undefined patterns', () => {
    expect(matchesPermission('Bash', { command: 'git status' }, undefined as unknown as PermissionPattern[])).toBe(false);
  });
});

describe('suggestPattern', () => {
  describe('Bash tool', () => {
    it('should suggest pattern based on command prefix', () => {
      expect(suggestPattern('Bash', { command: 'git status' })).toBe('Bash(git:*)');
    });

    it('should suggest pattern for npm commands', () => {
      expect(suggestPattern('Bash', { command: 'npm run test' })).toBe('Bash(npm:*)');
    });

    it('should suggest pattern for complex commands', () => {
      expect(suggestPattern('Bash', { command: 'pnpm install --save-dev vitest' })).toBe('Bash(pnpm:*)');
    });

    it('should handle single-word commands', () => {
      expect(suggestPattern('Bash', { command: 'ls' })).toBe('Bash(ls:*)');
    });

    it('should return tool name only for missing command', () => {
      expect(suggestPattern('Bash', {})).toBe('Bash');
      expect(suggestPattern('Bash', null)).toBe('Bash');
    });
  });

  describe('Write/Edit/Read tools', () => {
    it('should suggest pattern based on directory', () => {
      // Returns the immediate parent directory
      expect(suggestPattern('Write', { file_path: './src/components/App.tsx' })).toBe('Write(./src/components/**)');
    });

    it('should suggest pattern for nested paths', () => {
      expect(suggestPattern('Edit', { file_path: '/home/user/project/src/index.ts' })).toBe('Edit(/home/user/project/src/**)');
    });

    it('should handle root-level files', () => {
      expect(suggestPattern('Write', { file_path: './package.json' })).toBe('Write(./**)');
    });

    it('should return tool name only for missing file_path', () => {
      expect(suggestPattern('Read', {})).toBe('Read');
      expect(suggestPattern('Write', null)).toBe('Write');
    });
  });

  describe('Other tools', () => {
    it('should return tool name only for unknown tools', () => {
      expect(suggestPattern('WebFetch', { url: 'https://example.com' })).toBe('WebFetch');
    });
  });
});
