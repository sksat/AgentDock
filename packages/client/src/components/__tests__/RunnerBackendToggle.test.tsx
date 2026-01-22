import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RunnerBackendToggle } from '../RunnerBackendToggle';

describe('RunnerBackendToggle', () => {
  it('should render current backend value', () => {
    render(<RunnerBackendToggle value="native" onChange={() => {}} podmanAvailable />);
    expect(screen.getByText('native')).toBeInTheDocument();
  });

  it('should not render when podmanAvailable is false', () => {
    const { container } = render(
      <RunnerBackendToggle value="native" onChange={() => {}} podmanAvailable={false} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('should not render when podmanAvailable is undefined', () => {
    const { container } = render(
      <RunnerBackendToggle value="native" onChange={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('should toggle to podman when native is selected', () => {
    const onChange = vi.fn();
    render(<RunnerBackendToggle value="native" onChange={onChange} podmanAvailable />);

    fireEvent.click(screen.getByRole('button'));

    expect(onChange).toHaveBeenCalledWith('podman');
  });

  it('should toggle to native when podman is selected', () => {
    const onChange = vi.fn();
    render(<RunnerBackendToggle value="podman" onChange={onChange} podmanAvailable />);

    fireEvent.click(screen.getByRole('button'));

    expect(onChange).toHaveBeenCalledWith('native');
  });

  it('should show toggle switch visual state for native', () => {
    render(<RunnerBackendToggle value="native" onChange={() => {}} podmanAvailable />);

    const toggleSwitch = screen.getByTestId('toggle-switch');
    expect(toggleSwitch).toHaveClass('bg-gray-600');
  });

  it('should show toggle switch visual state for podman', () => {
    render(<RunnerBackendToggle value="podman" onChange={() => {}} podmanAvailable />);

    const toggleSwitch = screen.getByTestId('toggle-switch');
    expect(toggleSwitch).toHaveClass('bg-accent-primary');
  });

  it('should display podman when value is podman', () => {
    render(<RunnerBackendToggle value="podman" onChange={() => {}} podmanAvailable />);
    expect(screen.getByText('podman')).toBeInTheDocument();
  });

  it('should be disabled when disabled prop is true', () => {
    render(
      <RunnerBackendToggle value="native" onChange={() => {}} podmanAvailable disabled />
    );

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('should have proper title attribute', () => {
    render(<RunnerBackendToggle value="native" onChange={() => {}} podmanAvailable />);
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Running natively');

    render(
      <RunnerBackendToggle value="podman" onChange={() => {}} podmanAvailable />
    );
    // Re-query after second render
    expect(screen.getAllByRole('button')[1]).toHaveAttribute('title', 'Running with Podman');
  });

  it('should apply custom className', () => {
    const { container } = render(
      <RunnerBackendToggle
        value="native"
        onChange={() => {}}
        podmanAvailable
        className="custom-class"
      />
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });
});
