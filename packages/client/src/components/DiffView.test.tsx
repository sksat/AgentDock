import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiffView, type DiffViewProps } from './DiffView';

describe('DiffView', () => {
  const writeToolProps: DiffViewProps = {
    toolName: 'Write',
    filePath: '/path/to/file.ts',
    newContent: 'export const hello = "world";\n',
    oldContent: undefined,
  };

  const editToolProps: DiffViewProps = {
    toolName: 'Edit',
    filePath: '/path/to/file.ts',
    oldContent: 'const x = 1;\nconst y = 2;\n',
    newContent: 'const x = 1;\nconst y = 3;\n',
  };

  it('renders file path', () => {
    render(<DiffView {...writeToolProps} />);
    expect(screen.getByText('/path/to/file.ts')).toBeInTheDocument();
  });

  it('renders tool name badge for Write', () => {
    render(<DiffView {...writeToolProps} />);
    expect(screen.getByText('Write')).toBeInTheDocument();
  });

  it('renders tool name badge for Edit', () => {
    render(<DiffView {...editToolProps} />);
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('shows new file indicator for Write without oldContent', () => {
    render(<DiffView {...writeToolProps} />);
    expect(screen.getByText(/New file/)).toBeInTheDocument();
  });

  it('renders diff view for Edit with changes', () => {
    render(<DiffView {...editToolProps} />);

    // The diff viewer should be rendered
    const diffContainer = screen.getByTestId('diff-container');
    expect(diffContainer).toBeInTheDocument();
  });

  it('displays line numbers', () => {
    render(<DiffView {...editToolProps} />);

    // Should show line numbers (multiple elements expected in split/unified view)
    const lineNumbers = screen.getAllByText('1');
    expect(lineNumbers.length).toBeGreaterThan(0);
  });

  it('shows syntax highlighting cue (file extension)', () => {
    render(<DiffView {...writeToolProps} />);

    // The .ts extension should be visible in the path
    expect(screen.getByText('.ts', { exact: false })).toBeInTheDocument();
  });
});
