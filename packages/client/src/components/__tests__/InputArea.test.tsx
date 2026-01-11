import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InputArea } from '../InputArea';

describe('InputArea', () => {
  it('should render textarea and send button', () => {
    render(<InputArea onSend={() => {}} />);

    expect(screen.getByPlaceholderText(/Type a message/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send/ })).toBeInTheDocument();
  });

  it('should call onSend when button is clicked', () => {
    const onSend = vi.fn();
    render(<InputArea onSend={onSend} />);

    const textarea = screen.getByPlaceholderText(/Type a message/);
    fireEvent.change(textarea, { target: { value: 'Hello Claude' } });
    fireEvent.click(screen.getByRole('button', { name: /Send/ }));

    expect(onSend).toHaveBeenCalledWith('Hello Claude');
  });

  it('should clear input after sending', () => {
    render(<InputArea onSend={() => {}} />);

    const textarea = screen.getByPlaceholderText(/Type a message/) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hello Claude' } });
    fireEvent.click(screen.getByRole('button', { name: /Send/ }));

    expect(textarea.value).toBe('');
  });

  it('should call onSend when Enter key is pressed (without Shift)', () => {
    const onSend = vi.fn();
    render(<InputArea onSend={onSend} />);

    const textarea = screen.getByPlaceholderText(/Type a message/);
    fireEvent.change(textarea, { target: { value: 'Hello Claude' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(onSend).toHaveBeenCalledWith('Hello Claude');
  });

  it('should not call onSend when Shift+Enter is pressed', () => {
    const onSend = vi.fn();
    render(<InputArea onSend={onSend} />);

    const textarea = screen.getByPlaceholderText(/Type a message/);
    fireEvent.change(textarea, { target: { value: 'Hello Claude' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('should not send empty messages', () => {
    const onSend = vi.fn();
    render(<InputArea onSend={onSend} />);

    fireEvent.click(screen.getByRole('button', { name: /Send/ }));

    expect(onSend).not.toHaveBeenCalled();
  });

  it('should disable input when disabled prop is true', () => {
    render(<InputArea onSend={() => {}} disabled />);

    const textarea = screen.getByPlaceholderText(/Type a message/);
    const button = screen.getByRole('button', { name: /Send/ });

    expect(textarea).toBeDisabled();
    expect(button).toBeDisabled();
  });
});

describe('Permission mode toggle', () => {
  it('should display current permission mode', () => {
    render(<InputArea onSend={() => {}} permissionMode="ask" />);

    expect(screen.getByText('Ask before edits')).toBeInTheDocument();
  });

  it('should display "Edit automatically" for auto-edit mode', () => {
    render(<InputArea onSend={() => {}} permissionMode="auto-edit" />);

    expect(screen.getByText('Edit automatically')).toBeInTheDocument();
  });

  it('should display "Plan mode" for plan mode', () => {
    render(<InputArea onSend={() => {}} permissionMode="plan" />);

    expect(screen.getByText('Plan mode')).toBeInTheDocument();
  });

  it('should cycle through modes on click', () => {
    const onPermissionModeChange = vi.fn();
    render(
      <InputArea
        onSend={() => {}}
        permissionMode="ask"
        onPermissionModeChange={onPermissionModeChange}
      />
    );

    // Click on permission mode button
    fireEvent.click(screen.getByRole('button', { name: /Ask before edits/i }));

    // Should cycle to next mode (auto-edit)
    expect(onPermissionModeChange).toHaveBeenCalledWith('auto-edit');
  });

  it('should cycle from auto-edit to plan on click', () => {
    const onPermissionModeChange = vi.fn();
    render(
      <InputArea
        onSend={() => {}}
        permissionMode="auto-edit"
        onPermissionModeChange={onPermissionModeChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Edit automatically/i }));

    expect(onPermissionModeChange).toHaveBeenCalledWith('plan');
  });

  it('should cycle from plan back to ask on click', () => {
    const onPermissionModeChange = vi.fn();
    render(
      <InputArea
        onSend={() => {}}
        permissionMode="plan"
        onPermissionModeChange={onPermissionModeChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Plan mode/i }));

    expect(onPermissionModeChange).toHaveBeenCalledWith('ask');
  });

  it('should cycle through modes on Shift+Tab', () => {
    const onPermissionModeChange = vi.fn();
    render(
      <InputArea
        onSend={() => {}}
        permissionMode="ask"
        onPermissionModeChange={onPermissionModeChange}
      />
    );

    const textarea = screen.getByPlaceholderText(/Type a message/);
    fireEvent.keyDown(textarea, { key: 'Tab', shiftKey: true });

    expect(onPermissionModeChange).toHaveBeenCalledWith('auto-edit');
  });

  it('should not render permission button when onPermissionModeChange is not provided', () => {
    render(<InputArea onSend={() => {}} permissionMode="ask" />);

    // Permission mode text should be visible but not as a button
    expect(screen.getByText('Ask before edits')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ask before edits/i })).not.toBeInTheDocument();
  });
});

describe('Model selector', () => {
  it('should display current model name (shortened)', () => {
    render(<InputArea onSend={() => {}} model="claude-sonnet-4-20250514" />);

    expect(screen.getByText('sonnet')).toBeInTheDocument();
  });

  it('should display opus for opus model', () => {
    render(<InputArea onSend={() => {}} model="claude-opus-4-20250514" />);

    expect(screen.getByText('opus')).toBeInTheDocument();
  });

  it('should show model selection popover on click when onModelChange is provided', () => {
    const onModelChange = vi.fn();
    render(
      <InputArea
        onSend={() => {}}
        model="claude-sonnet-4-20250514"
        onModelChange={onModelChange}
      />
    );

    // Click on model button
    fireEvent.click(screen.getByRole('button', { name: /sonnet/i }));

    // Popover should open with model options
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByText('Opus')).toBeInTheDocument();
    expect(screen.getByText('Haiku')).toBeInTheDocument();
  });

  it('should call onModelChange when a model is selected from popover', () => {
    const onModelChange = vi.fn();
    render(
      <InputArea
        onSend={() => {}}
        model="claude-sonnet-4-20250514"
        onModelChange={onModelChange}
      />
    );

    // Open popover
    fireEvent.click(screen.getByRole('button', { name: /sonnet/i }));

    // Select Opus
    fireEvent.click(screen.getByRole('option', { name: /Opus/i }));

    expect(onModelChange).toHaveBeenCalledWith('claude-opus-4-20250514');
  });

  it('should not render model button when onModelChange is not provided', () => {
    render(<InputArea onSend={() => {}} model="claude-sonnet-4-20250514" />);

    // Model text should be visible but not as a button
    expect(screen.getByText('sonnet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sonnet/i })).not.toBeInTheDocument();
  });
});

describe('/model command', () => {
  it('should show model selector when /model is typed', () => {
    const onModelChange = vi.fn();
    render(
      <InputArea
        onSend={() => {}}
        model="claude-sonnet-4-20250514"
        onModelChange={onModelChange}
      />
    );

    const textarea = screen.getByPlaceholderText(/Type a message/);
    fireEvent.change(textarea, { target: { value: '/model' } });

    // Model selector popover should appear
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('should clear /model input when model is selected', () => {
    const onModelChange = vi.fn();
    render(
      <InputArea
        onSend={() => {}}
        model="claude-sonnet-4-20250514"
        onModelChange={onModelChange}
      />
    );

    const textarea = screen.getByPlaceholderText(/Type a message/) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '/model' } });

    // Select a model
    fireEvent.click(screen.getByRole('option', { name: /Opus/i }));

    // Input should be cleared
    expect(textarea.value).toBe('');
  });
});
