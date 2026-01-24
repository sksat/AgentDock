import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InputArea } from '../InputArea';
import { MODEL_OPTIONS } from '../ModelSelector';

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

    expect(onSend).toHaveBeenCalledWith('Hello Claude', undefined);
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

    expect(onSend).toHaveBeenCalledWith('Hello Claude', undefined);
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
    render(<InputArea onSend={() => {}} model="claude-sonnet-4-5-20250929" />);

    expect(screen.getByText('sonnet')).toBeInTheDocument();
  });

  it('should display opus for opus model', () => {
    render(<InputArea onSend={() => {}} model="claude-opus-4-5-20250514" />);

    expect(screen.getByText('opus')).toBeInTheDocument();
  });

  it('should show model selection popover on click when onModelChange is provided', () => {
    const onModelChange = vi.fn();
    render(
      <InputArea
        onSend={() => {}}
        model="claude-sonnet-4-5-20250929"
        onModelChange={onModelChange}
      />
    );

    // Click on model button
    fireEvent.click(screen.getByRole('button', { name: /sonnet/i }));

    // Popover should open with model options
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByText('Default (recommended)')).toBeInTheDocument();
    expect(screen.getByText('Haiku')).toBeInTheDocument();
  });

  it('should call onModelChange when a model is selected from popover', () => {
    const onModelChange = vi.fn();
    render(
      <InputArea
        onSend={() => {}}
        model="claude-sonnet-4-5-20250929"
        onModelChange={onModelChange}
      />
    );

    // Open popover
    fireEvent.click(screen.getByRole('button', { name: /sonnet/i }));

    // Select Default (opus)
    fireEvent.click(screen.getByRole('option', { name: /Default \(recommended\)/i }));

    expect(onModelChange).toHaveBeenCalledWith(MODEL_OPTIONS[0].id);
  });

  it('should not render model button when onModelChange is not provided', () => {
    render(<InputArea onSend={() => {}} model="claude-sonnet-4-5-20250929" />);

    // Model text should be visible but not as a button
    expect(screen.getByText('sonnet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sonnet/i })).not.toBeInTheDocument();
  });
});

describe('/model command', () => {
  it('should show slash command suggestions when /model is typed', () => {
    const onModelChange = vi.fn();
    render(
      <InputArea
        onSend={() => {}}
        model="claude-sonnet-4-5-20250929"
        onModelChange={onModelChange}
      />
    );

    const textarea = screen.getByPlaceholderText(/Type a message/);
    fireEvent.change(textarea, { target: { value: '/model' } });

    // Slash command suggestions should appear with "Switch model" text
    expect(screen.getByText(/Switch model/)).toBeInTheDocument();
  });

  it('should show model selector immediately when /model is selected from suggestions', async () => {
    const onModelChange = vi.fn();
    render(
      <InputArea
        onSend={() => {}}
        model="claude-sonnet-4-5-20250929"
        onModelChange={onModelChange}
      />
    );

    const textarea = screen.getByPlaceholderText(/Type a message/) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '/model' } });
    // Press Enter to select and immediately execute the /model command
    fireEvent.keyDown(textarea, { key: 'Enter' });

    // Wait for setTimeout to complete
    await new Promise(resolve => setTimeout(resolve, 10));

    // Model selector should appear immediately (no second Enter needed)
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    // Input should be cleared
    expect(textarea.value).toBe('');
  });

  it('should not immediately execute /compact - should insert into input instead', () => {
    const onCompact = vi.fn();
    render(
      <InputArea
        onSend={() => {}}
        onCompact={onCompact}
      />
    );

    const textarea = screen.getByPlaceholderText(/Type a message/) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '/compact' } });
    // Press Enter to select the command from suggestions
    fireEvent.keyDown(textarea, { key: 'Enter' });

    // /compact should be inserted into input (not executed immediately)
    expect(textarea.value).toBe('/compact ');
    // onCompact should NOT have been called yet
    expect(onCompact).not.toHaveBeenCalled();
  });

  it('should execute /compact when Enter is pressed after insertion', () => {
    const onCompact = vi.fn();
    render(
      <InputArea
        onSend={() => {}}
        onCompact={onCompact}
      />
    );

    const textarea = screen.getByPlaceholderText(/Type a message/) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '/compact' } });
    // Press Enter to select the command from suggestions
    fireEvent.keyDown(textarea, { key: 'Enter' });
    // Press Enter again to execute the command
    fireEvent.keyDown(textarea, { key: 'Enter' });

    // onCompact should now have been called
    expect(onCompact).toHaveBeenCalled();
    // Input should be cleared
    expect(textarea.value).toBe('');
  });
});

describe('Stream input during loading', () => {
  it('should call onStreamInput when Enter is pressed during loading', () => {
    const onSend = vi.fn();
    const onStreamInput = vi.fn();
    render(
      <InputArea
        onSend={onSend}
        onStreamInput={onStreamInput}
        isLoading={true}
      />
    );

    const textarea = screen.getByPlaceholderText(/Type a message/);
    fireEvent.change(textarea, { target: { value: 'Additional input' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    // onStreamInput should be called, not onSend
    expect(onStreamInput).toHaveBeenCalledWith('Additional input');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('should clear input after stream input is sent', () => {
    const onStreamInput = vi.fn();
    render(
      <InputArea
        onSend={() => {}}
        onStreamInput={onStreamInput}
        isLoading={true}
      />
    );

    const textarea = screen.getByPlaceholderText(/Type a message/) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Additional input' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(textarea.value).toBe('');
  });

  it('should not call onStreamInput if onStreamInput is not provided', () => {
    const onSend = vi.fn();
    render(
      <InputArea
        onSend={onSend}
        isLoading={true}
      />
    );

    const textarea = screen.getByPlaceholderText(/Type a message/);
    fireEvent.change(textarea, { target: { value: 'Test' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    // Neither should be called since isLoading is true and onStreamInput is not provided
    expect(onSend).not.toHaveBeenCalled();
  });

  it('should not call onStreamInput when input is empty during loading', () => {
    const onStreamInput = vi.fn();
    render(
      <InputArea
        onSend={() => {}}
        onStreamInput={onStreamInput}
        isLoading={true}
      />
    );

    const textarea = screen.getByPlaceholderText(/Type a message/);
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(onStreamInput).not.toHaveBeenCalled();
  });

  it('should call onSend normally when not loading', () => {
    const onSend = vi.fn();
    const onStreamInput = vi.fn();
    render(
      <InputArea
        onSend={onSend}
        onStreamInput={onStreamInput}
        isLoading={false}
      />
    );

    const textarea = screen.getByPlaceholderText(/Type a message/);
    fireEvent.change(textarea, { target: { value: 'Normal message' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    // onSend should be called when not loading
    expect(onSend).toHaveBeenCalledWith('Normal message', undefined);
    expect(onStreamInput).not.toHaveBeenCalled();
  });
});

/**
 * META-SPECIFICATION: Session Start UI Parity
 * ==========================================
 * Session start mode UI MUST have full feature parity with active session UI.
 * Any feature added to InputArea for active sessions should be available in
 * session start mode, and vice versa.
 */
describe('InputArea session-start mode', () => {
  describe('project selector', () => {
    it('should render project selector in session-start mode', () => {
      render(<InputArea mode="session-start" onSend={() => {}} />);
      // Project selector shows "Select project..." placeholder
      expect(screen.getByText(/Select project/)).toBeInTheDocument();
    });

    it('should not render project selector in default mode', () => {
      render(<InputArea onSend={() => {}} />);
      expect(screen.queryByText(/Select project/)).not.toBeInTheDocument();
    });

    it('should call onProjectChange when project is selected', () => {
      const onProjectChange = vi.fn();
      const repositories = [
        { id: 'repo-1', name: 'Test Repo', path: '/home/user/test', type: 'local-git-worktree' as const, createdAt: '', updatedAt: '' }
      ];
      render(
        <InputArea
          mode="session-start"
          onSend={() => {}}
          repositories={repositories}
          onProjectChange={onProjectChange}
        />
      );

      // Open dropdown and select repository
      fireEvent.click(screen.getByText(/Select project/));
      fireEvent.click(screen.getByText('Test Repo'));

      expect(onProjectChange).toHaveBeenCalledWith({ type: 'repository', repositoryId: 'repo-1' });
    });

    it('should show repositories in dropdown', () => {
      const repositories = [
        { id: 'repo-1', name: 'Project 1', path: '/home/user/proj1', type: 'local' as const, createdAt: '', updatedAt: '' },
        { id: 'repo-2', name: 'Project 2', path: '/home/user/proj2', type: 'local-git-worktree' as const, createdAt: '', updatedAt: '' },
      ];
      render(
        <InputArea
          mode="session-start"
          onSend={() => {}}
          repositories={repositories}
        />
      );

      // Open dropdown
      fireEvent.click(screen.getByText(/Select project/));

      expect(screen.getByText('Project 1')).toBeInTheDocument();
      expect(screen.getByText('Project 2')).toBeInTheDocument();
    });
  });

  describe('runner backend toggle', () => {
    it('should render runner backend toggle when podmanAvailable is true', () => {
      render(
        <InputArea
          mode="session-start"
          onSend={() => {}}
          podmanAvailable={true}
          runnerBackend="native"
        />
      );
      expect(screen.getByText('native')).toBeInTheDocument();
    });

    it('should not render runner backend toggle when podmanAvailable is false', () => {
      render(
        <InputArea
          mode="session-start"
          onSend={() => {}}
          podmanAvailable={false}
        />
      );
      expect(screen.queryByText('native')).not.toBeInTheDocument();
      expect(screen.queryByText('podman')).not.toBeInTheDocument();
    });

    it('should toggle runner backend on click', () => {
      const onRunnerBackendChange = vi.fn();
      render(
        <InputArea
          mode="session-start"
          onSend={() => {}}
          podmanAvailable={true}
          runnerBackend="native"
          onRunnerBackendChange={onRunnerBackendChange}
        />
      );

      fireEvent.click(screen.getByText('native'));
      expect(onRunnerBackendChange).toHaveBeenCalledWith('podman');
    });
  });

  describe('feature parity', () => {
    it('should have model selection in session-start mode', () => {
      render(
        <InputArea
          mode="session-start"
          onSend={() => {}}
          model="claude-sonnet-4-5-20250929"
          onModelChange={() => {}}
        />
      );
      expect(screen.getByText('sonnet')).toBeInTheDocument();
    });

    it('should have permission mode in session-start mode', () => {
      render(
        <InputArea
          mode="session-start"
          onSend={() => {}}
          permissionMode="ask"
          onPermissionModeChange={() => {}}
        />
      );
      expect(screen.getByText('Ask before edits')).toBeInTheDocument();
    });

    it('should support image attachment in session-start mode', () => {
      render(<InputArea mode="session-start" onSend={() => {}} />);
      expect(screen.getByTitle('Attach image')).toBeInTheDocument();
    });

    it('should support slash commands in session-start mode', () => {
      render(<InputArea mode="session-start" onSend={() => {}} />);
      expect(screen.getByTitle('Slash commands')).toBeInTheDocument();
    });
  });

  describe('default mode unchanged', () => {
    it('should not render session-start specific UI in default mode', () => {
      render(<InputArea onSend={() => {}} />);
      expect(screen.queryByText('Working directory')).not.toBeInTheDocument();
    });

    it('should work normally without mode prop', () => {
      const onSend = vi.fn();
      render(<InputArea onSend={onSend} />);

      const textarea = screen.getByPlaceholderText(/Type a message/);
      fireEvent.change(textarea, { target: { value: 'Test' } });
      fireEvent.keyDown(textarea, { key: 'Enter' });

      expect(onSend).toHaveBeenCalledWith('Test', undefined);
    });
  });
});

describe('Context window occupancy', () => {
  it('should display simple token count when occupancy is low (< 40%)', () => {
    render(
      <InputArea
        onSend={() => {}}
        model="claude-sonnet-4-5-20250929"
        tokenUsage={{ inputTokens: 50000, outputTokens: 1000 }}
      />
    );

    // 50,000 / 200,000 = 25% - low occupancy shows simple token display
    expect(screen.getByText('50,000 in')).toBeInTheDocument();
    expect(screen.queryByText(/% used/)).not.toBeInTheDocument();
  });

  it('should display pie chart when occupancy is 40% or more', () => {
    render(
      <InputArea
        onSend={() => {}}
        model="claude-sonnet-4-5-20250929"
        tokenUsage={{ inputTokens: 80000, outputTokens: 1000 }}
      />
    );

    // 80,000 / 200,000 = 40% - shows pie chart
    expect(screen.getByText('40% used')).toBeInTheDocument();
  });

  it('should display occupancy rate with custom contextWindow prop', () => {
    render(
      <InputArea
        onSend={() => {}}
        model="claude-sonnet-4-5-20250929"
        tokenUsage={{ inputTokens: 50000, outputTokens: 1000 }}
        contextWindow={100000}
      />
    );

    // 50,000 / 100,000 = 50%
    expect(screen.getByText('50% used')).toBeInTheDocument();
  });

  it('should fallback to token display when model is unknown', () => {
    render(
      <InputArea
        onSend={() => {}}
        model="unknown-model"
        tokenUsage={{ inputTokens: 50000, outputTokens: 1000 }}
      />
    );

    // Fallback: shows input tokens only
    expect(screen.getByText('50,000 in')).toBeInTheDocument();
    expect(screen.queryByText(/% used/)).not.toBeInTheDocument();
  });

  it('should not crash when tokenUsage is undefined', () => {
    expect(() =>
      render(
        <InputArea
          onSend={() => {}}
          model="claude-sonnet-4-5-20250929"
        />
      )
    ).not.toThrow();
  });

  it('should not crash when model is undefined but tokenUsage exists', () => {
    expect(() =>
      render(
        <InputArea
          onSend={() => {}}
          tokenUsage={{ inputTokens: 50000, outputTokens: 1000 }}
        />
      )
    ).not.toThrow();
  });

  it('should show warning color when occupancy is between 60% and 80%', () => {
    const { container } = render(
      <InputArea
        onSend={() => {}}
        model="claude-sonnet-4-5-20250929"
        tokenUsage={{ inputTokens: 140000, outputTokens: 1000 }}
      />
    );

    // 140,000 / 200,000 = 70%
    expect(screen.getByText('70% used')).toBeInTheDocument();
    // Check for warning color class
    const usageElement = container.querySelector('.text-accent-warning');
    expect(usageElement).toBeInTheDocument();
  });

  it('should show danger color when occupancy is 80% or more', () => {
    const { container } = render(
      <InputArea
        onSend={() => {}}
        model="claude-sonnet-4-5-20250929"
        tokenUsage={{ inputTokens: 180000, outputTokens: 1000 }}
      />
    );

    // 180,000 / 200,000 = 90%
    expect(screen.getByText('90% used')).toBeInTheDocument();
    // Check for danger color class
    const usageElement = container.querySelector('.text-accent-danger');
    expect(usageElement).toBeInTheDocument();
  });

  it('should cap occupancy at 100%', () => {
    render(
      <InputArea
        onSend={() => {}}
        model="claude-sonnet-4-5-20250929"
        tokenUsage={{ inputTokens: 250000, outputTokens: 1000 }}
      />
    );

    // Should cap at 100%, not show 125%
    expect(screen.getByText('100% used')).toBeInTheDocument();
  });
});
