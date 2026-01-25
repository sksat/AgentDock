import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PermissionRequest } from '../PermissionRequest';

describe('PermissionRequest', () => {
  const defaultProps = {
    requestId: 'req-123',
    toolName: 'Bash',
    input: { command: 'rm -rf /' },
    onAllow: vi.fn(),
    onAllowForSession: vi.fn(),
    onDeny: vi.fn(),
  };

  it('should render tool name', () => {
    render(<PermissionRequest {...defaultProps} />);

    expect(screen.getByText('Bash')).toBeInTheDocument();
  });

  it('should render input as JSON', () => {
    render(<PermissionRequest {...defaultProps} />);

    expect(screen.getByText(/rm -rf/)).toBeInTheDocument();
  });

  it('should render allow, allow for session, and deny buttons', () => {
    render(<PermissionRequest {...defaultProps} />);

    expect(screen.getByRole('button', { name: /^Allow$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Allow for session/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Deny/ })).toBeInTheDocument();
  });

  it('should call onAllow with updatedInput when allow is clicked', () => {
    const onAllow = vi.fn();
    render(<PermissionRequest {...defaultProps} onAllow={onAllow} />);

    fireEvent.click(screen.getByRole('button', { name: /^Allow$/ }));

    expect(onAllow).toHaveBeenCalledWith(defaultProps.requestId, defaultProps.input);
  });

  it('should call onAllowForSession when allow for session is clicked', () => {
    const onAllowForSession = vi.fn();
    render(<PermissionRequest {...defaultProps} onAllowForSession={onAllowForSession} />);

    fireEvent.click(screen.getByRole('button', { name: /Allow for session/ }));

    expect(onAllowForSession).toHaveBeenCalledWith(defaultProps.requestId, defaultProps.toolName, defaultProps.input);
  });

  it('should call onDeny when deny is clicked', () => {
    const onDeny = vi.fn();
    render(<PermissionRequest {...defaultProps} onDeny={onDeny} />);

    fireEvent.click(screen.getByRole('button', { name: /Deny/ }));

    expect(onDeny).toHaveBeenCalledWith(defaultProps.requestId, expect.any(String));
  });

  it('should display Write tool with DiffView', () => {
    const writeInput = {
      file_path: '/home/user/test.txt',
      content: 'Hello World',
    };
    render(<PermissionRequest {...defaultProps} toolName="Write" input={writeInput} />);

    // "Write" appears in both PermissionRequest header and DiffView header
    const writeElements = screen.getAllByText('Write');
    expect(writeElements.length).toBe(2);
    expect(screen.getByText(/\/home\/user\/test.txt/)).toBeInTheDocument();
    // Should show "New file" indicator for Write without old content
    expect(screen.getByText(/New file/)).toBeInTheDocument();
  });

  it('should display Edit tool with DiffView showing changes', () => {
    const editInput = {
      file_path: '/home/user/code.ts',
      old_string: 'const x = 1;',
      new_string: 'const x = 2;',
    };
    render(<PermissionRequest {...defaultProps} toolName="Edit" input={editInput} />);

    // "Edit" appears in both PermissionRequest header and DiffView header
    const editElements = screen.getAllByText('Edit');
    expect(editElements.length).toBe(2);
    expect(screen.getByText('/home/user/code.ts')).toBeInTheDocument();
    // Should have a diff container
    expect(screen.getByTestId('diff-container')).toBeInTheDocument();
  });

  it('should disable buttons after clicking allow', () => {
    render(<PermissionRequest {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /^Allow$/ }));

    expect(screen.getByRole('button', { name: /^Allow$/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Allow for session/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Deny/ })).toBeDisabled();
  });

  it('should disable buttons after clicking allow for session', () => {
    render(<PermissionRequest {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /Allow for session/ }));

    expect(screen.getByRole('button', { name: /^Allow$/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Allow for session/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Deny/ })).toBeDisabled();
  });

  it('should disable buttons after clicking deny', () => {
    render(<PermissionRequest {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /Deny/ }));

    expect(screen.getByRole('button', { name: /^Allow$/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Allow for session/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Deny/ })).toBeDisabled();
  });

  it('should display Read tool with FileReadView', () => {
    const readInput = {
      file_path: '/home/user/document.txt',
    };
    render(<PermissionRequest {...defaultProps} toolName="Read" input={readInput} />);

    // "Read" appears in both PermissionRequest header and FileReadView header
    const readElements = screen.getAllByText('Read');
    expect(readElements.length).toBe(2);
    expect(screen.getByText('/home/user/document.txt')).toBeInTheDocument();
    // Should show "Reading file contents" indicator
    expect(screen.getByText(/Reading file contents/)).toBeInTheDocument();
  });

  it('should display Read tool with offset and limit', () => {
    const readInput = {
      file_path: '/home/user/large-file.log',
      offset: 100,
      limit: 50,
    };
    render(<PermissionRequest {...defaultProps} toolName="Read" input={readInput} />);

    expect(screen.getByText('/home/user/large-file.log')).toBeInTheDocument();
    expect(screen.getByText(/offset: 100/)).toBeInTheDocument();
    expect(screen.getByText(/limit: 50/)).toBeInTheDocument();
  });

  it('should display Bash tool with shell-like command view', () => {
    const bashInput = {
      command: 'ls -la',
    };
    render(<PermissionRequest {...defaultProps} toolName="Bash" input={bashInput} />);

    expect(screen.getByText('Bash')).toBeInTheDocument();
    // Should show shell prompt
    expect(screen.getByText('$')).toBeInTheDocument();
    // Should show command
    expect(screen.getByText('ls -la')).toBeInTheDocument();
  });

  it('should display Bash tool with description as title', () => {
    const bashInput = {
      command: 'git status',
      description: 'Check repository status',
    };
    render(<PermissionRequest {...defaultProps} toolName="Bash" input={bashInput} />);

    // Should show description as title
    expect(screen.getByText('Check repository status')).toBeInTheDocument();
    // Should show shell prompt and command
    expect(screen.getByText('$')).toBeInTheDocument();
    expect(screen.getByText('git status')).toBeInTheDocument();
  });

  describe('content height constraints', () => {
    it('should have max-height and overflow-y-auto on Bash command view', () => {
      const bashInput = { command: 'echo "test"' };
      const { container } = render(
        <PermissionRequest {...defaultProps} toolName="Bash" input={bashInput} />
      );

      const bashContainer = container.querySelector('[data-testid="bash-command-container"]');
      expect(bashContainer).toBeInTheDocument();
      expect(bashContainer).toHaveClass('max-h-[400px]');
      expect(bashContainer).toHaveClass('overflow-y-auto');
    });

    it('should have max-height and overflow-y-auto on JSON fallback view', () => {
      const unknownInput = { customField: 'value' };
      const { container } = render(
        <PermissionRequest {...defaultProps} toolName="UnknownTool" input={unknownInput} />
      );

      const preElement = container.querySelector('pre');
      expect(preElement).toBeInTheDocument();
      expect(preElement).toHaveClass('max-h-[400px]');
      expect(preElement).toHaveClass('overflow-y-auto');
    });

    it('should not crash with very long Bash command', () => {
      const longCommand = 'a'.repeat(10000);
      const bashInput = { command: longCommand };

      expect(() =>
        render(<PermissionRequest {...defaultProps} toolName="Bash" input={bashInput} />)
      ).not.toThrow();

      expect(screen.getByText(/aaa/)).toBeInTheDocument();
    });

    it('should not crash with very large JSON input', () => {
      const largeInput = {
        data: Array.from({ length: 100 }, (_, i) => ({ id: i, value: 'x'.repeat(100) })),
      };

      expect(() =>
        render(<PermissionRequest {...defaultProps} toolName="UnknownTool" input={largeInput} />)
      ).not.toThrow();
    });
  });
});
