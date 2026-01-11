import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InputArea } from '../InputArea';

describe('InputArea', () => {
  it('should render textarea and send button', () => {
    render(<InputArea onSend={() => {}} />);

    expect(screen.getByPlaceholderText(/メッセージを入力/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /送信/ })).toBeInTheDocument();
  });

  it('should call onSend when button is clicked', () => {
    const onSend = vi.fn();
    render(<InputArea onSend={onSend} />);

    const textarea = screen.getByPlaceholderText(/メッセージを入力/);
    fireEvent.change(textarea, { target: { value: 'Hello Claude' } });
    fireEvent.click(screen.getByRole('button', { name: /送信/ }));

    expect(onSend).toHaveBeenCalledWith('Hello Claude');
  });

  it('should clear input after sending', () => {
    render(<InputArea onSend={() => {}} />);

    const textarea = screen.getByPlaceholderText(/メッセージを入力/) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hello Claude' } });
    fireEvent.click(screen.getByRole('button', { name: /送信/ }));

    expect(textarea.value).toBe('');
  });

  it('should call onSend when Enter key is pressed (without Shift)', () => {
    const onSend = vi.fn();
    render(<InputArea onSend={onSend} />);

    const textarea = screen.getByPlaceholderText(/メッセージを入力/);
    fireEvent.change(textarea, { target: { value: 'Hello Claude' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(onSend).toHaveBeenCalledWith('Hello Claude');
  });

  it('should not call onSend when Shift+Enter is pressed', () => {
    const onSend = vi.fn();
    render(<InputArea onSend={onSend} />);

    const textarea = screen.getByPlaceholderText(/メッセージを入力/);
    fireEvent.change(textarea, { target: { value: 'Hello Claude' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('should not send empty messages', () => {
    const onSend = vi.fn();
    render(<InputArea onSend={onSend} />);

    fireEvent.click(screen.getByRole('button', { name: /送信/ }));

    expect(onSend).not.toHaveBeenCalled();
  });

  it('should disable input when disabled prop is true', () => {
    render(<InputArea onSend={() => {}} disabled />);

    const textarea = screen.getByPlaceholderText(/メッセージを入力/);
    const button = screen.getByRole('button', { name: /送信/ });

    expect(textarea).toBeDisabled();
    expect(button).toBeDisabled();
  });
});
