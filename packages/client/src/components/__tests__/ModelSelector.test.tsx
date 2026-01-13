import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
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

    // The listbox should be focused, so pressing Escape on it should close it
    const listbox = screen.getByRole('listbox');
    fireEvent.keyDown(listbox, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  it('should show model description in the popover', () => {
    render(<ModelSelector {...defaultProps} isOpen={true} />);

    // Check for model descriptions
    expect(screen.getByText(/Opus 4\.5/)).toBeInTheDocument();
    expect(screen.getByText(/Sonnet 4\.5/)).toBeInTheDocument();
    expect(screen.getByText(/Haiku 4\.5/)).toBeInTheDocument();
  });

  describe('keyboard navigation', () => {
    it('should focus the popover when opened', () => {
      render(<ModelSelector {...defaultProps} isOpen={true} />);

      const listbox = screen.getByRole('listbox');
      expect(listbox).toHaveFocus();
    });

    it('should move highlight down when pressing ArrowDown', () => {
      // Start with first option (opus) selected
      render(
        <ModelSelector
          {...defaultProps}
          currentModel="claude-opus-4-5-20250514"
          isOpen={true}
        />
      );

      const listbox = screen.getByRole('listbox');

      // Initially, first option should be highlighted (has bg-accent-primary class)
      const options = screen.getAllByRole('option');
      expect(options[0]).toHaveClass('bg-accent-primary');

      // Press ArrowDown on the focused listbox
      act(() => {
        fireEvent.keyDown(listbox, { key: 'ArrowDown' });
      });

      // Now second option should be highlighted
      expect(options[0]).not.toHaveClass('bg-accent-primary');
      expect(options[1]).toHaveClass('bg-accent-primary');
    });

    it('should move highlight up when pressing ArrowUp', () => {
      // Start with second option (sonnet) selected
      render(
        <ModelSelector
          {...defaultProps}
          currentModel="claude-sonnet-4-5-20250929"
          isOpen={true}
        />
      );

      const listbox = screen.getByRole('listbox');

      // Initially, second option should be highlighted
      const options = screen.getAllByRole('option');
      expect(options[1]).toHaveClass('bg-accent-primary');

      // Press ArrowUp on the focused listbox
      act(() => {
        fireEvent.keyDown(listbox, { key: 'ArrowUp' });
      });

      // Now first option should be highlighted
      expect(options[0]).toHaveClass('bg-accent-primary');
      expect(options[1]).not.toHaveClass('bg-accent-primary');
    });

    it('should wrap around when pressing ArrowDown on last option', () => {
      // Start with last option (haiku) selected
      render(
        <ModelSelector
          {...defaultProps}
          currentModel="claude-haiku-4-5-20251001"
          isOpen={true}
        />
      );

      const listbox = screen.getByRole('listbox');
      const options = screen.getAllByRole('option');

      // Last option (index 2) should be highlighted
      expect(options[2]).toHaveClass('bg-accent-primary');

      // Press ArrowDown on the focused listbox
      act(() => {
        fireEvent.keyDown(listbox, { key: 'ArrowDown' });
      });

      // Should wrap to first option
      expect(options[0]).toHaveClass('bg-accent-primary');
      expect(options[2]).not.toHaveClass('bg-accent-primary');
    });

    it('should select highlighted option when pressing Enter', () => {
      const onSelectModel = vi.fn();
      render(
        <ModelSelector
          {...defaultProps}
          currentModel="claude-opus-4-5-20250514"
          isOpen={true}
          onSelectModel={onSelectModel}
        />
      );

      const listbox = screen.getByRole('listbox');

      // Move to second option
      act(() => {
        fireEvent.keyDown(listbox, { key: 'ArrowDown' });
      });

      // Press Enter to select
      act(() => {
        fireEvent.keyDown(listbox, { key: 'Enter' });
      });

      // Should have selected the second model (sonnet)
      expect(onSelectModel).toHaveBeenCalledWith(MODEL_OPTIONS[1].id);
    });
  });
});
