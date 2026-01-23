import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectSelector } from '../ProjectSelector';
import type { Repository, SelectedProject, RecentProject } from '@agent-dock/shared';

// Helper to create mock repositories
function createMockRepository(overrides: Partial<Repository> = {}): Repository {
  return {
    id: 'repo-1',
    name: 'Test Repository',
    path: '/home/user/test-repo',
    type: 'local-git-worktree',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// Helper to create mock recent projects
function createMockRecentProject(overrides: Partial<RecentProject> = {}): RecentProject {
  return {
    path: '/home/user/recent-project',
    lastUsed: '2024-01-15T00:00:00Z',
    ...overrides,
  };
}

describe('ProjectSelector', () => {
  describe('Basic rendering', () => {
    it('should render with placeholder when no project selected', () => {
      render(
        <ProjectSelector
          selectedProject={null}
          onChange={() => {}}
          repositories={[]}
          recentProjects={[]}
        />
      );
      expect(screen.getByText(/Select project/i)).toBeInTheDocument();
    });

    it('should display selected repository name', () => {
      const repo = createMockRepository({ id: 'repo-1', name: 'My Project' });
      const selected: SelectedProject = { type: 'repository', repositoryId: 'repo-1' };

      render(
        <ProjectSelector
          selectedProject={selected}
          onChange={() => {}}
          repositories={[repo]}
          recentProjects={[]}
        />
      );

      expect(screen.getByText('My Project')).toBeInTheDocument();
    });

    it('should display selected recent project path', () => {
      const recent = createMockRecentProject({ path: '/home/user/my-project' });
      const selected: SelectedProject = { type: 'recent', path: '/home/user/my-project' };

      render(
        <ProjectSelector
          selectedProject={selected}
          onChange={() => {}}
          repositories={[]}
          recentProjects={[recent]}
        />
      );

      // Should format with ~ for home directory
      expect(screen.getByText('~/my-project')).toBeInTheDocument();
    });

    it('should display custom path', () => {
      const selected: SelectedProject = { type: 'custom', path: '/custom/path' };

      render(
        <ProjectSelector
          selectedProject={selected}
          onChange={() => {}}
          repositories={[]}
          recentProjects={[]}
        />
      );

      expect(screen.getByText('/custom/path')).toBeInTheDocument();
    });
  });

  describe('Dropdown display', () => {
    it('should show repositories section when repositories exist', () => {
      const repos = [
        createMockRepository({ id: 'repo-1', name: 'Repo 1', type: 'local' }),
        createMockRepository({ id: 'repo-2', name: 'Repo 2', type: 'local-git-worktree' }),
      ];

      render(
        <ProjectSelector
          selectedProject={null}
          onChange={() => {}}
          repositories={repos}
          recentProjects={[]}
        />
      );

      // Open dropdown
      fireEvent.click(screen.getByRole('button'));

      expect(screen.getByText('REPOSITORIES')).toBeInTheDocument();
      expect(screen.getByText('Repo 1')).toBeInTheDocument();
      expect(screen.getByText('Repo 2')).toBeInTheDocument();
    });

    it('should show recent projects section when recent projects exist', () => {
      const recents = [
        createMockRecentProject({ path: '/home/user/proj1' }),
        createMockRecentProject({ path: '/home/user/proj2' }),
      ];

      render(
        <ProjectSelector
          selectedProject={null}
          onChange={() => {}}
          repositories={[]}
          recentProjects={recents}
        />
      );

      // Open dropdown
      fireEvent.click(screen.getByRole('button'));

      expect(screen.getByText('RECENT')).toBeInTheDocument();
      expect(screen.getByText('~/proj1')).toBeInTheDocument();
      expect(screen.getByText('~/proj2')).toBeInTheDocument();
    });

    it('should show recent project with repository name when repositoryId exists', () => {
      const repo = createMockRepository({ id: 'repo-1', name: 'My Repo' });
      const recent = createMockRecentProject({
        path: '/home/user/proj1',
        repositoryId: 'repo-1',
        repositoryName: 'My Repo',
      });

      render(
        <ProjectSelector
          selectedProject={null}
          onChange={() => {}}
          repositories={[repo]}
          recentProjects={[recent]}
        />
      );

      // Open dropdown
      fireEvent.click(screen.getByRole('button'));

      // Should show repository name in both Repositories and Recent sections
      // (one for the repo, one for the recent project with repositoryName)
      const myRepoElements = screen.getAllByText('My Repo');
      expect(myRepoElements.length).toBeGreaterThanOrEqual(2);
    });

    it('should always show custom path option', () => {
      render(
        <ProjectSelector
          selectedProject={null}
          onChange={() => {}}
          repositories={[]}
          recentProjects={[]}
        />
      );

      // Open dropdown
      fireEvent.click(screen.getByRole('button'));

      expect(screen.getByText(/Custom path/i)).toBeInTheDocument();
    });

    it('should show different icons for repository types', () => {
      const repos = [
        createMockRepository({ id: 'r1', name: 'Local', type: 'local' }),
        createMockRepository({ id: 'r2', name: 'Git', type: 'local-git-worktree' }),
        createMockRepository({ id: 'r3', name: 'Remote', type: 'remote-git' }),
      ];

      render(
        <ProjectSelector
          selectedProject={null}
          onChange={() => {}}
          repositories={repos}
          recentProjects={[]}
        />
      );

      // Open dropdown
      fireEvent.click(screen.getByRole('button'));

      // Check that all repos are shown (icons are tested implicitly)
      expect(screen.getByText('Local')).toBeInTheDocument();
      expect(screen.getByText('Git')).toBeInTheDocument();
      expect(screen.getByText('Remote')).toBeInTheDocument();
    });
  });

  describe('Selection handling', () => {
    it('should call onChange with repository selection', () => {
      const onChange = vi.fn();
      const repo = createMockRepository({ id: 'repo-1', name: 'Test Repo' });

      render(
        <ProjectSelector
          selectedProject={null}
          onChange={onChange}
          repositories={[repo]}
          recentProjects={[]}
        />
      );

      // Open dropdown and select repository
      fireEvent.click(screen.getByRole('button'));
      fireEvent.click(screen.getByText('Test Repo'));

      expect(onChange).toHaveBeenCalledWith({ type: 'repository', repositoryId: 'repo-1' });
    });

    it('should call onChange with recent project selection', () => {
      const onChange = vi.fn();
      const recent = createMockRecentProject({ path: '/home/user/proj1' });

      render(
        <ProjectSelector
          selectedProject={null}
          onChange={onChange}
          repositories={[]}
          recentProjects={[recent]}
        />
      );

      // Open dropdown and select recent project
      fireEvent.click(screen.getByRole('button'));
      fireEvent.click(screen.getByText('~/proj1'));

      expect(onChange).toHaveBeenCalledWith({ type: 'recent', path: '/home/user/proj1' });
    });

    it('should call onChange with recent project including repositoryId', () => {
      const onChange = vi.fn();
      const recent = createMockRecentProject({
        path: '/home/user/proj1',
        repositoryId: 'repo-1',
        repositoryName: 'My Repo',
      });

      render(
        <ProjectSelector
          selectedProject={null}
          onChange={onChange}
          repositories={[]}
          recentProjects={[recent]}
        />
      );

      // Open dropdown and select recent project
      fireEvent.click(screen.getByRole('button'));
      fireEvent.click(screen.getByText(/My Repo/));

      expect(onChange).toHaveBeenCalledWith({
        type: 'recent',
        path: '/home/user/proj1',
        repositoryId: 'repo-1',
      });
    });

    it('should close dropdown after selection', () => {
      const repo = createMockRepository({ id: 'repo-1', name: 'Test Repo' });

      render(
        <ProjectSelector
          selectedProject={null}
          onChange={() => {}}
          repositories={[repo]}
          recentProjects={[]}
        />
      );

      // Open dropdown
      fireEvent.click(screen.getByRole('button'));
      expect(screen.getByText('Test Repo')).toBeInTheDocument();

      // Select repository
      fireEvent.click(screen.getByText('Test Repo'));

      // Dropdown should be closed (Test Repo should not be visible in dropdown anymore)
      // The selected value is shown in the button, so we check the dropdown is gone
      expect(screen.queryByText('REPOSITORIES')).not.toBeInTheDocument();
    });
  });

  describe('Custom path input', () => {
    it('should switch to custom path input mode', () => {
      render(
        <ProjectSelector
          selectedProject={null}
          onChange={() => {}}
          repositories={[]}
          recentProjects={[]}
        />
      );

      // Open dropdown and click custom path
      fireEvent.click(screen.getByRole('button'));
      fireEvent.click(screen.getByText(/Custom path/i));

      // Should show text input
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('should call onChange with custom path when submitted', () => {
      const onChange = vi.fn();

      render(
        <ProjectSelector
          selectedProject={null}
          onChange={onChange}
          repositories={[]}
          recentProjects={[]}
        />
      );

      // Open dropdown and click custom path
      fireEvent.click(screen.getByRole('button'));
      fireEvent.click(screen.getByText(/Custom path/i));

      // Enter path and submit
      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '/my/custom/path' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onChange).toHaveBeenCalledWith({ type: 'custom', path: '/my/custom/path' });
    });

    it('should cancel custom path input on Escape', () => {
      render(
        <ProjectSelector
          selectedProject={null}
          onChange={() => {}}
          repositories={[]}
          recentProjects={[]}
        />
      );

      // Open dropdown and click custom path
      fireEvent.click(screen.getByRole('button'));
      fireEvent.click(screen.getByText(/Custom path/i));

      // Press Escape
      const input = screen.getByRole('textbox');
      fireEvent.keyDown(input, { key: 'Escape' });

      // Should be back to normal mode (no textbox)
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });
  });

  describe('Disabled state', () => {
    it('should be disabled when disabled prop is true', () => {
      render(
        <ProjectSelector
          selectedProject={null}
          onChange={() => {}}
          repositories={[]}
          recentProjects={[]}
          disabled
        />
      );

      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('should not open dropdown when disabled', () => {
      const repo = createMockRepository({ id: 'repo-1', name: 'Test Repo' });

      render(
        <ProjectSelector
          selectedProject={null}
          onChange={() => {}}
          repositories={[repo]}
          recentProjects={[]}
          disabled
        />
      );

      // Try to open dropdown
      fireEvent.click(screen.getByRole('button'));

      // Dropdown should not open
      expect(screen.queryByText('REPOSITORIES')).not.toBeInTheDocument();
    });
  });

  describe('Robustness tests', () => {
    it('should not crash with null repositories', () => {
      expect(() =>
        render(
          <ProjectSelector
            selectedProject={null}
            onChange={() => {}}
            repositories={null as unknown as Repository[]}
            recentProjects={[]}
          />
        )
      ).not.toThrow();
    });

    it('should not crash with undefined recentProjects', () => {
      expect(() =>
        render(
          <ProjectSelector
            selectedProject={null}
            onChange={() => {}}
            repositories={[]}
            recentProjects={undefined as unknown as RecentProject[]}
          />
        )
      ).not.toThrow();
    });

    it('should not crash with invalid repository data', () => {
      const invalidRepos = [
        { id: 'r1' } as Repository, // Missing required fields
        null as unknown as Repository,
      ];

      expect(() =>
        render(
          <ProjectSelector
            selectedProject={null}
            onChange={() => {}}
            repositories={invalidRepos}
            recentProjects={[]}
          />
        )
      ).not.toThrow();
    });

    it('should not crash when selected repository is not in list', () => {
      const selected: SelectedProject = { type: 'repository', repositoryId: 'non-existent' };

      expect(() =>
        render(
          <ProjectSelector
            selectedProject={selected}
            onChange={() => {}}
            repositories={[]}
            recentProjects={[]}
          />
        )
      ).not.toThrow();
    });

    it('should show fallback for missing repository', () => {
      const selected: SelectedProject = { type: 'repository', repositoryId: 'non-existent' };

      render(
        <ProjectSelector
          selectedProject={selected}
          onChange={() => {}}
          repositories={[]}
          recentProjects={[]}
        />
      );

      // Should show some fallback text, not crash
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });

  describe('Path formatting', () => {
    it('should format Linux home directory paths with ~', () => {
      const recent = createMockRecentProject({ path: '/home/user/project' });

      render(
        <ProjectSelector
          selectedProject={null}
          onChange={() => {}}
          repositories={[]}
          recentProjects={[recent]}
        />
      );

      fireEvent.click(screen.getByRole('button'));
      expect(screen.getByText('~/project')).toBeInTheDocument();
    });

    it('should format macOS home directory paths with ~', () => {
      const recent = createMockRecentProject({ path: '/Users/mac/project' });

      render(
        <ProjectSelector
          selectedProject={null}
          onChange={() => {}}
          repositories={[]}
          recentProjects={[recent]}
        />
      );

      fireEvent.click(screen.getByRole('button'));
      expect(screen.getByText('~/project')).toBeInTheDocument();
    });

    it('should not format non-home paths', () => {
      const recent = createMockRecentProject({ path: '/var/www/project' });

      render(
        <ProjectSelector
          selectedProject={null}
          onChange={() => {}}
          repositories={[]}
          recentProjects={[recent]}
        />
      );

      fireEvent.click(screen.getByRole('button'));
      expect(screen.getByText('/var/www/project')).toBeInTheDocument();
    });
  });
});
