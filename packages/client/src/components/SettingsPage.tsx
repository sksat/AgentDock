import { useState, useCallback, useEffect } from 'react';
import clsx from 'clsx';
import type { GlobalSettings } from '@agent-dock/shared';

// Local settings (theme only, stored in localStorage)
const LOCAL_STORAGE_KEY = 'agent-dock:local-settings';

interface LocalSettings {
  theme: 'dark' | 'light';
}

const DEFAULT_LOCAL_SETTINGS: LocalSettings = {
  theme: 'dark',
};

function loadLocalSettings(): LocalSettings {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_LOCAL_SETTINGS, ...JSON.parse(stored) };
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_LOCAL_SETTINGS;
}

function saveLocalSettings(settings: LocalSettings): void {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
}

// Model options
const MODEL_OPTIONS = [
  { id: 'claude-opus-4-5-20250514', name: 'Opus 4.5', description: 'Most capable for complex work' },
  { id: 'claude-sonnet-4-5-20250929', name: 'Sonnet 4.5', description: 'Best for everyday tasks' },
  { id: 'claude-haiku-4-5-20251001', name: 'Haiku 4.5', description: 'Fastest for quick answers' },
];

// Permission mode options
const PERMISSION_OPTIONS = [
  { id: 'ask', name: 'Ask before edits', description: 'Confirm before making changes' },
  { id: 'auto-edit', name: 'Edit automatically', description: 'Apply changes without confirmation' },
  { id: 'plan', name: 'Plan mode', description: 'Plan changes before executing' },
];

interface SettingCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

function SettingCard({ title, description, children }: SettingCardProps) {
  return (
    <div className="bg-bg-secondary border border-border rounded-lg p-4">
      <h3 className="text-base font-medium text-text-primary mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-text-secondary mb-4">{description}</p>
      )}
      {children}
    </div>
  );
}

interface SelectOptionProps {
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}

function SelectOption({ label, description, selected, onClick }: SelectOptionProps) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full px-3 py-2.5 text-left rounded-lg transition-colors flex items-center justify-between',
        selected
          ? 'bg-accent-primary/10 border border-accent-primary/30'
          : 'bg-bg-tertiary hover:bg-bg-tertiary/80 border border-transparent'
      )}
    >
      <div className="flex flex-col">
        <span className={clsx(
          'font-medium',
          selected ? 'text-accent-primary' : 'text-text-primary'
        )}>
          {label}
        </span>
        <span className="text-xs text-text-secondary">{description}</span>
      </div>
      {selected && (
        <svg
          className="w-5 h-5 text-accent-primary flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  );
}

interface ToggleSwitchProps {
  enabled: boolean;
  onToggle: () => void;
  label: string;
  description: string;
}

function ToggleSwitch({ enabled, onToggle, label, description }: ToggleSwitchProps) {
  return (
    <button
      onClick={onToggle}
      className="w-full px-3 py-2.5 text-left rounded-lg transition-colors flex items-center justify-between bg-bg-tertiary hover:bg-bg-tertiary/80"
    >
      <div className="flex flex-col">
        <span className="font-medium text-text-primary">{label}</span>
        <span className="text-xs text-text-secondary">{description}</span>
      </div>
      <div
        className={clsx(
          'w-11 h-6 rounded-full p-0.5 transition-colors',
          enabled ? 'bg-accent-primary' : 'bg-gray-600'
        )}
      >
        <div
          className={clsx(
            'w-5 h-5 rounded-full bg-white shadow-sm transition-transform',
            enabled ? 'translate-x-5' : 'translate-x-0'
          )}
        />
      </div>
    </button>
  );
}

export interface SettingsPageProps {
  globalSettings: GlobalSettings | null;
  updateSettings: (settings: Partial<GlobalSettings>) => void;
}

export function SettingsPage({ globalSettings, updateSettings }: SettingsPageProps) {
  const [localSettings, setLocalSettings] = useState<LocalSettings>(loadLocalSettings);

  // Sync local settings with globalSettings when it changes
  const [displaySettings, setDisplaySettings] = useState<GlobalSettings>({
    defaultModel: 'claude-opus-4-5-20250514',
    defaultPermissionMode: 'ask',
    defaultThinkingEnabled: false,
    defaultRunnerBackend: 'native',
    defaultBrowserInContainer: true,
    autoAllowWebTools: false,
  });

  useEffect(() => {
    if (globalSettings) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplaySettings(globalSettings);
    }
  }, [globalSettings]);

  const updateLocalSetting = useCallback(<K extends keyof LocalSettings>(key: K, value: LocalSettings[K]) => {
    setLocalSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveLocalSettings(next);
      return next;
    });
  }, []);

  const updateGlobalSetting = useCallback(<K extends keyof GlobalSettings>(key: K, value: GlobalSettings[K]) => {
    // Optimistically update UI
    setDisplaySettings((prev) => ({ ...prev, [key]: value }));
    // Send to server
    updateSettings({ [key]: value });
  }, [updateSettings]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-semibold text-text-primary mb-2">Settings</h1>
        <p className="text-text-secondary mb-8">
          Configure your AgentDock preferences
        </p>

        <div className="space-y-6">
          {/* Default Model */}
          <SettingCard
            title="Default Model"
            description="The model to use for new sessions"
          >
            <div className="space-y-2">
              {MODEL_OPTIONS.map((option) => (
                <SelectOption
                  key={option.id}
                  label={option.name}
                  description={option.description}
                  selected={displaySettings.defaultModel === option.id}
                  onClick={() => updateGlobalSetting('defaultModel', option.id)}
                />
              ))}
            </div>
          </SettingCard>

          {/* Permission Mode */}
          <SettingCard
            title="Default Permission Mode"
            description="How the agent handles file changes"
          >
            <div className="space-y-2">
              {PERMISSION_OPTIONS.map((option) => (
                <SelectOption
                  key={option.id}
                  label={option.name}
                  description={option.description}
                  selected={displaySettings.defaultPermissionMode === option.id}
                  onClick={() => updateGlobalSetting('defaultPermissionMode', option.id)}
                />
              ))}
            </div>
          </SettingCard>

          {/* Theme */}
          <SettingCard
            title="Theme"
            description="Application color theme"
          >
            <div className="space-y-2">
              <SelectOption
                label="Dark"
                description="Dark background with light text"
                selected={localSettings.theme === 'dark'}
                onClick={() => updateLocalSetting('theme', 'dark')}
              />
              <SelectOption
                label="Light"
                description="Light background with dark text (coming soon)"
                selected={localSettings.theme === 'light'}
                onClick={() => updateLocalSetting('theme', 'light')}
              />
            </div>
          </SettingCard>

          {/* Extended Thinking */}
          <SettingCard
            title="Extended Thinking"
            description="Default thinking mode for new sessions"
          >
            <ToggleSwitch
              enabled={displaySettings.defaultThinkingEnabled}
              onToggle={() => updateGlobalSetting('defaultThinkingEnabled', !displaySettings.defaultThinkingEnabled)}
              label="Enable by default"
              description="Claude will show its reasoning process (uses more tokens)"
            />
          </SettingCard>

          {/* Runner Backend */}
          <SettingCard
            title="Runner Backend"
            description="How Claude Code is executed"
          >
            <ToggleSwitch
              enabled={displaySettings.defaultRunnerBackend === 'podman'}
              onToggle={() => updateGlobalSetting('defaultRunnerBackend', displaySettings.defaultRunnerBackend === 'podman' ? 'native' : 'podman')}
              label="Use Podman by default"
              description="Run sessions in Podman containers for isolation (requires server setup)"
            />
          </SettingCard>

          {/* About */}
          <SettingCard title="About">
            <div className="text-sm text-text-secondary space-y-1">
              <p>AgentDock - AI Agent Web UI</p>
              <p>
                <a
                  href="https://github.com/sksat/claude-bridge"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-primary hover:underline"
                >
                  View on GitHub
                </a>
              </p>
            </div>
          </SettingCard>
        </div>
      </div>
    </div>
  );
}
