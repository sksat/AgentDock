import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkingDirectorySelector } from '../WorkingDirectorySelector';

describe('WorkingDirectorySelector', () => {
  it('should render input with placeholder', () => {
    render(<WorkingDirectorySelector value="" onChange={() => {}} />);
    expect(screen.getByPlaceholderText(/Default/)).toBeInTheDocument();
  });

  it('should display current value', () => {
    render(<WorkingDirectorySelector value="/home/user/project" onChange={() => {}} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('/home/user/project');
  });

  it('should call onChange when input changes', () => {
    const onChange = vi.fn();
    render(<WorkingDirectorySelector value="" onChange={onChange} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '/new/path' } });

    expect(onChange).toHaveBeenCalledWith('/new/path');
  });

  it('should display recent directories on focus when available', () => {
    const recentDirs = ['/home/user/proj1', '/home/user/proj2'];
    render(
      <WorkingDirectorySelector
        value=""
        onChange={() => {}}
        recentDirectories={recentDirs}
      />
    );

    const input = screen.getByRole('textbox');
    fireEvent.focus(input);

    // Should show formatted paths with ~
    expect(screen.getByText('~/proj1')).toBeInTheDocument();
    expect(screen.getByText('~/proj2')).toBeInTheDocument();
  });

  it('should not show dropdown when no recent directories', () => {
    render(
      <WorkingDirectorySelector
        value=""
        onChange={() => {}}
        recentDirectories={[]}
      />
    );

    const input = screen.getByRole('textbox');
    fireEvent.focus(input);

    // Should not show dropdown
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('should select directory from dropdown', () => {
    const onChange = vi.fn();
    const recentDirs = ['/home/user/proj1'];
    render(
      <WorkingDirectorySelector
        value=""
        onChange={onChange}
        recentDirectories={recentDirs}
      />
    );

    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.click(screen.getByText('~/proj1'));

    expect(onChange).toHaveBeenCalledWith('/home/user/proj1');
  });

  it('should close dropdown after selection', () => {
    const recentDirs = ['/home/user/proj1'];
    render(
      <WorkingDirectorySelector
        value=""
        onChange={() => {}}
        recentDirectories={recentDirs}
      />
    );

    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.click(screen.getByText('~/proj1'));

    // Dropdown should be closed
    expect(screen.queryByText('~/proj1')).not.toBeInTheDocument();
  });

  it('should format macOS paths with ~ for home directory', () => {
    const recentDirs = ['/Users/mac/proj1', '/other/path'];
    render(
      <WorkingDirectorySelector
        value=""
        onChange={() => {}}
        recentDirectories={recentDirs}
      />
    );

    const input = screen.getByRole('textbox');
    fireEvent.focus(input);

    expect(screen.getByText('~/proj1')).toBeInTheDocument();
    expect(screen.getByText('/other/path')).toBeInTheDocument();
  });

  it('should be disabled when disabled prop is true', () => {
    render(<WorkingDirectorySelector value="" onChange={() => {}} disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('should toggle dropdown with arrow button', () => {
    const recentDirs = ['/home/user/proj1'];
    render(
      <WorkingDirectorySelector
        value=""
        onChange={() => {}}
        recentDirectories={recentDirs}
      />
    );

    // Click the dropdown arrow button
    const dropdownButton = screen.getByRole('button');
    fireEvent.click(dropdownButton);

    expect(screen.getByText('~/proj1')).toBeInTheDocument();

    // Click again to close
    fireEvent.click(dropdownButton);
    expect(screen.queryByText('~/proj1')).not.toBeInTheDocument();
  });

  it('should highlight selected directory', () => {
    const recentDirs = ['/home/user/proj1', '/home/user/proj2'];
    render(
      <WorkingDirectorySelector
        value="/home/user/proj1"
        onChange={() => {}}
        recentDirectories={recentDirs}
      />
    );

    const input = screen.getByRole('textbox');
    fireEvent.focus(input);

    // The selected item should have accent color
    const selectedItem = screen.getByText('~/proj1');
    expect(selectedItem).toHaveClass('text-accent-primary');
  });

  it('should apply custom className', () => {
    const { container } = render(
      <WorkingDirectorySelector
        value=""
        onChange={() => {}}
        className="custom-class"
      />
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });
});
