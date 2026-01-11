import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PermissionRequest } from '../PermissionRequest';

describe('PermissionRequest', () => {
  const defaultProps = {
    requestId: 'req-123',
    toolName: 'Bash',
    input: { command: 'rm -rf /' },
    onAllow: vi.fn(),
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

  it('should render allow and deny buttons', () => {
    render(<PermissionRequest {...defaultProps} />);

    expect(screen.getByRole('button', { name: /許可/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /拒否/ })).toBeInTheDocument();
  });

  it('should call onAllow with updatedInput when allow is clicked', () => {
    const onAllow = vi.fn();
    render(<PermissionRequest {...defaultProps} onAllow={onAllow} />);

    fireEvent.click(screen.getByRole('button', { name: /許可/ }));

    expect(onAllow).toHaveBeenCalledWith(defaultProps.requestId, defaultProps.input);
  });

  it('should call onDeny when deny is clicked', () => {
    const onDeny = vi.fn();
    render(<PermissionRequest {...defaultProps} onDeny={onDeny} />);

    fireEvent.click(screen.getByRole('button', { name: /拒否/ }));

    expect(onDeny).toHaveBeenCalledWith(defaultProps.requestId, expect.any(String));
  });

  it('should display Write tool input with file path', () => {
    const writeInput = {
      file_path: '/home/user/test.txt',
      content: 'Hello World',
    };
    render(<PermissionRequest {...defaultProps} toolName="Write" input={writeInput} />);

    expect(screen.getByText('Write')).toBeInTheDocument();
    expect(screen.getByText(/\/home\/user\/test.txt/)).toBeInTheDocument();
  });

  it('should disable buttons after clicking allow', () => {
    render(<PermissionRequest {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /許可/ }));

    expect(screen.getByRole('button', { name: /許可/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /拒否/ })).toBeDisabled();
  });

  it('should disable buttons after clicking deny', () => {
    render(<PermissionRequest {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /拒否/ }));

    expect(screen.getByRole('button', { name: /許可/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /拒否/ })).toBeDisabled();
  });
});
