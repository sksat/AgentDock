import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModelSelector, type ModelSelectorProps, MODEL_OPTIONS } from '../ModelSelector';

describe('ModelSelector', () => {
  const defaultProps: ModelSelectorProps = {
    currentModel: 'claude-sonnet-4-5-20250929',
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
    expect(screen.getByText('Default (recommended)')).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('option', { name: /Default \(recommended\)/i }));

    expect(onSelectModel).toHaveBeenCalledWith(MODEL_OPTIONS[0].id);
  });

  it('should call onClose after selecting a model', () => {
    const onClose = vi.fn();
    render(
      <ModelSelector {...defaultProps} isOpen={true} onClose={onClose} />
    );

    fireEvent.click(screen.getByRole('option', { name: /Default \(recommended\)/i }));

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
    expect(screen.getByText(/Opus 4\.5/)).toBeInTheDocument();
    expect(screen.getByText(/Sonnet 4\.5/)).toBeInTheDocument();
    expect(screen.getByText(/Haiku 4\.5/)).toBeInTheDocument();
  });
});
