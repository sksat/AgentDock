import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModelSelector, type ModelSelectorProps } from '../ModelSelector';

describe('ModelSelector', () => {
  const defaultProps: ModelSelectorProps = {
    currentModel: 'claude-sonnet-4-20250514',
    onSelectModel: vi.fn(),
    isOpen: false,
    onClose: vi.fn(),
  };

  it('should not render popover when isOpen is false', () => {
    render(<ModelSelector {...defaultProps} />);

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('should render popover with model options when isOpen is true', () => {
    render(<ModelSelector {...defaultProps} isOpen={true} />);

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByText('Sonnet')).toBeInTheDocument();
    expect(screen.getByText('Opus')).toBeInTheDocument();
    expect(screen.getByText('Haiku')).toBeInTheDocument();
  });

  it('should highlight current model in the list', () => {
    render(<ModelSelector {...defaultProps} isOpen={true} />);

    const sonnetOption = screen.getByRole('option', { name: /Sonnet/i });
    expect(sonnetOption).toHaveAttribute('aria-selected', 'true');
  });

  it('should call onSelectModel when a model is clicked', () => {
    const onSelectModel = vi.fn();
    render(
      <ModelSelector
        {...defaultProps}
        isOpen={true}
        onSelectModel={onSelectModel}
      />
    );

    fireEvent.click(screen.getByRole('option', { name: /Opus/i }));

    expect(onSelectModel).toHaveBeenCalledWith('claude-opus-4-20250514');
  });

  it('should call onClose after selecting a model', () => {
    const onClose = vi.fn();
    render(
      <ModelSelector {...defaultProps} isOpen={true} onClose={onClose} />
    );

    fireEvent.click(screen.getByRole('option', { name: /Opus/i }));

    expect(onClose).toHaveBeenCalled();
  });

  it('should close when clicking outside', () => {
    const onClose = vi.fn();
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <ModelSelector {...defaultProps} isOpen={true} onClose={onClose} />
      </div>
    );

    fireEvent.mouseDown(screen.getByTestId('outside'));

    expect(onClose).toHaveBeenCalled();
  });

  it('should close when pressing Escape', () => {
    const onClose = vi.fn();
    render(<ModelSelector {...defaultProps} isOpen={true} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  it('should show model description in the popover', () => {
    render(<ModelSelector {...defaultProps} isOpen={true} />);

    // Check for model descriptions
    expect(screen.getByText(/claude-sonnet-4/)).toBeInTheDocument();
    expect(screen.getByText(/claude-opus-4/)).toBeInTheDocument();
    expect(screen.getByText(/claude-haiku-3/)).toBeInTheDocument();
  });
});
