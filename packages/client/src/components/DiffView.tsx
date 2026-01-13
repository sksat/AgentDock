import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';

export interface DiffViewProps {
  toolName: 'Write' | 'Edit' | string;
  filePath: string;
  oldContent?: string;
  newContent: string;
}

export function DiffView({
  toolName,
  filePath,
  oldContent,
  newContent,
}: DiffViewProps) {
  const isNewFile = !oldContent;

  // Get file extension for display
  const extension = filePath.split('.').pop() || '';

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-bg-tertiary border-b border-border">
        <div className="flex items-center gap-3">
          <span className="px-2 py-0.5 text-xs font-medium bg-accent-primary/20 text-accent-primary rounded">
            {toolName}
          </span>
          <span className="font-mono text-sm text-text-primary">{filePath}</span>
        </div>
        {isNewFile && (
          <span className="px-2 py-0.5 text-xs font-medium bg-accent-success/20 text-accent-success rounded">
            New file
          </span>
        )}
      </div>

      {/* Diff content */}
      <div data-testid="diff-container" className="overflow-x-auto">
        {isNewFile ? (
          <NewFileView content={newContent} extension={extension} />
        ) : (
          <DiffPanel
            oldContent={oldContent}
            newContent={newContent}
          />
        )}
      </div>
    </div>
  );
}

interface NewFileViewProps {
  content: string;
  extension: string;
}

function NewFileView({ content }: NewFileViewProps) {
  const lines = content.split('\n');

  return (
    <div className="bg-bg-secondary">
      <table className="w-full text-sm font-mono">
        <tbody>
          {lines.map((line, index) => (
            <tr
              key={index}
              className="hover:bg-bg-tertiary"
            >
              <td className="select-none text-right px-3 py-0.5 text-text-secondary w-12 border-r border-border">
                {index + 1}
              </td>
              <td className="px-3 py-0.5 text-accent-success whitespace-pre">
                {line || ' '}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface DiffPanelProps {
  oldContent: string;
  newContent: string;
}

function DiffPanel({ oldContent, newContent }: DiffPanelProps) {
  // Custom styles for the diff viewer to match our theme
  const customStyles = {
    variables: {
      dark: {
        diffViewerBackground: 'var(--color-bg-secondary)',
        diffViewerColor: 'var(--color-text-primary)',
        addedBackground: 'rgba(34, 197, 94, 0.1)',
        addedColor: 'var(--color-accent-success)',
        removedBackground: 'rgba(239, 68, 68, 0.1)',
        removedColor: 'var(--color-accent-danger)',
        wordAddedBackground: 'rgba(34, 197, 94, 0.3)',
        wordRemovedBackground: 'rgba(239, 68, 68, 0.3)',
        addedGutterBackground: 'rgba(34, 197, 94, 0.2)',
        removedGutterBackground: 'rgba(239, 68, 68, 0.2)',
        gutterBackground: 'var(--color-bg-tertiary)',
        gutterBackgroundDark: 'var(--color-bg-tertiary)',
        highlightBackground: 'var(--color-bg-tertiary)',
        highlightGutterBackground: 'var(--color-bg-tertiary)',
        codeFoldGutterBackground: 'var(--color-bg-tertiary)',
        codeFoldBackground: 'var(--color-bg-tertiary)',
        emptyLineBackground: 'var(--color-bg-secondary)',
        gutterColor: 'var(--color-text-secondary)',
        addedGutterColor: 'var(--color-accent-success)',
        removedGutterColor: 'var(--color-accent-danger)',
        codeFoldContentColor: 'var(--color-text-secondary)',
        diffViewerTitleBackground: 'var(--color-bg-tertiary)',
        diffViewerTitleColor: 'var(--color-text-primary)',
        diffViewerTitleBorderColor: 'var(--color-border)',
      },
    },
    line: {
      padding: '2px 10px',
    },
    gutter: {
      padding: '0 10px',
      minWidth: '40px',
    },
    contentText: {
      fontFamily: 'ui-monospace, monospace',
      fontSize: '13px',
    },
  };

  return (
    <ReactDiffViewer
      oldValue={oldContent}
      newValue={newContent}
      splitView={false}
      useDarkTheme={true}
      compareMethod={DiffMethod.WORDS}
      styles={customStyles}
      hideLineNumbers={false}
    />
  );
}
