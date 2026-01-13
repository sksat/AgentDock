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
});
