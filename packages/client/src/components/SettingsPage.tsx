import { useState, useCallback } from 'react';
import clsx from 'clsx';

// Settings stored in localStorage
const STORAGE_KEY = 'agent-dock:settings';

interface Settings {
  defaultModel: string;
  defaultPermissionMode: string;
  theme: 'dark' | 'light';
}

const DEFAULT_SETTINGS: Settings = {
  defaultModel: 'claude-opus-4-5-20250514',
  defaultPermissionMode: 'ask',
  theme: 'dark',
};

function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
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

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  const updateSetting = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      return next;
    });
  }, []);

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
                  selected={settings.defaultModel === option.id}
                  onClick={() => updateSetting('defaultModel', option.id)}
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
                  selected={settings.defaultPermissionMode === option.id}
                  onClick={() => updateSetting('defaultPermissionMode', option.id)}
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
                selected={settings.theme === 'dark'}
                onClick={() => updateSetting('theme', 'dark')}
              />
              <SelectOption
                label="Light"
                description="Light background with dark text (coming soon)"
                selected={settings.theme === 'light'}
                onClick={() => updateSetting('theme', 'light')}
              />
            </div>
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
