import { describe, it, expect } from 'vitest';
import { expandSystemPromptTemplate, buildSystemPromptVariables } from '../system-prompt.js';

describe('expandSystemPromptTemplate', () => {
  it('should expand all known variables', () => {
    const template = 'Session: {{session_id}}, URL: {{session_url}}, Dir: {{working_dir}}';
    const variables = {
      session_id: 'abc123',
      session_url: 'http://localhost:5173/session/abc123',
      working_dir: '/home/user/project',
    };

    const result = expandSystemPromptTemplate(template, variables);

    expect(result).toBe(
      'Session: abc123, URL: http://localhost:5173/session/abc123, Dir: /home/user/project'
    );
  });

  it('should preserve unknown variables', () => {
    const template = 'Known: {{session_id}}, Unknown: {{unknown_var}}';
    const variables = {
      session_id: 'abc123',
      session_url: 'http://localhost:5173/session/abc123',
      working_dir: '/home/user/project',
    };

    const result = expandSystemPromptTemplate(template, variables);

    expect(result).toBe('Known: abc123, Unknown: {{unknown_var}}');
  });

  it('should handle empty template', () => {
    const result = expandSystemPromptTemplate('', {
      session_id: 'abc123',
      session_url: 'http://localhost:5173/session/abc123',
      working_dir: '/home/user/project',
    });

    expect(result).toBe('');
  });

  it('should handle template without variables', () => {
    const template = 'This is a plain text template without any variables.';
    const variables = {
      session_id: 'abc123',
      session_url: 'http://localhost:5173/session/abc123',
      working_dir: '/home/user/project',
    };

    const result = expandSystemPromptTemplate(template, variables);

    expect(result).toBe('This is a plain text template without any variables.');
  });

  it('should handle optional repository variables when present', () => {
    const template = 'Repo: {{repository_name}} at {{repository_path}}';
    const variables = {
      session_id: 'abc123',
      session_url: 'http://localhost:5173/session/abc123',
      working_dir: '/home/user/project',
      repository_name: 'my-repo',
      repository_path: '/home/user/repos/my-repo',
    };

    const result = expandSystemPromptTemplate(template, variables);

    expect(result).toBe('Repo: my-repo at /home/user/repos/my-repo');
  });

  it('should preserve optional repository variables when absent', () => {
    const template = 'Repo: {{repository_name}}';
    const variables = {
      session_id: 'abc123',
      session_url: 'http://localhost:5173/session/abc123',
      working_dir: '/home/user/project',
      // repository_name is undefined
    };

    const result = expandSystemPromptTemplate(template, variables);

    expect(result).toBe('Repo: {{repository_name}}');
  });

  it('should handle multiline templates', () => {
    const template = `Session ID: {{session_id}}
Session URL: {{session_url}}
Working Directory: {{working_dir}}`;
    const variables = {
      session_id: 'abc123',
      session_url: 'http://localhost:5173/session/abc123',
      working_dir: '/home/user/project',
    };

    const result = expandSystemPromptTemplate(template, variables);

    expect(result).toBe(`Session ID: abc123
Session URL: http://localhost:5173/session/abc123
Working Directory: /home/user/project`);
  });

  it('should handle multiple occurrences of the same variable', () => {
    const template = '{{session_id}} - {{session_id}} - {{session_id}}';
    const variables = {
      session_id: 'abc123',
      session_url: 'http://localhost:5173/session/abc123',
      working_dir: '/home/user/project',
    };

    const result = expandSystemPromptTemplate(template, variables);

    expect(result).toBe('abc123 - abc123 - abc123');
  });
});

describe('buildSystemPromptVariables', () => {
  it('should build variables with required fields', () => {
    const result = buildSystemPromptVariables({
      sessionId: 'abc123',
      workingDir: '/home/user/project',
      baseUrl: 'http://localhost:5173',
    });

    expect(result).toEqual({
      session_id: 'abc123',
      session_url: 'http://localhost:5173/session/abc123',
      working_dir: '/home/user/project',
      repository_name: undefined,
      repository_path: undefined,
    });
  });

  it('should build variables with optional repository fields', () => {
    const result = buildSystemPromptVariables({
      sessionId: 'abc123',
      workingDir: '/home/user/project',
      baseUrl: 'http://localhost:5173',
      repositoryName: 'my-repo',
      repositoryPath: '/home/user/repos/my-repo',
    });

    expect(result).toEqual({
      session_id: 'abc123',
      session_url: 'http://localhost:5173/session/abc123',
      working_dir: '/home/user/project',
      repository_name: 'my-repo',
      repository_path: '/home/user/repos/my-repo',
    });
  });

  it('should handle different base URLs', () => {
    const result = buildSystemPromptVariables({
      sessionId: 'xyz789',
      workingDir: '/tmp/work',
      baseUrl: 'https://agentdock.example.com',
    });

    expect(result.session_url).toBe('https://agentdock.example.com/session/xyz789');
  });

  it('should handle base URL with trailing slash', () => {
    const result = buildSystemPromptVariables({
      sessionId: 'abc123',
      workingDir: '/home/user/project',
      baseUrl: 'http://localhost:5173/',
    });

    // Should not double the slash
    expect(result.session_url).toBe('http://localhost:5173/session/abc123');
  });
});
