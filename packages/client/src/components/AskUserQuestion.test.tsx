import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AskUserQuestion, type AskUserQuestionProps } from './AskUserQuestion';
import type { QuestionItem } from '@claude-bridge/shared';

const singleQuestion: QuestionItem[] = [
  {
    question: 'Which library should we use for date formatting?',
    header: 'Library',
    options: [
      { label: 'date-fns', description: 'Lightweight and modular' },
      { label: 'dayjs', description: 'Tiny and fast alternative to Moment.js' },
      { label: 'luxon', description: 'Modern API with timezone support' },
    ],
    multiSelect: false,
  },
];

const multiSelectQuestion: QuestionItem[] = [
  {
    question: 'Which features do you want to enable?',
    header: 'Features',
    options: [
      { label: 'Dark mode', description: 'Enable dark theme support' },
      { label: 'Notifications', description: 'Push notification support' },
      { label: 'Offline mode', description: 'Work without internet' },
    ],
    multiSelect: true,
  },
];

const multipleQuestions: QuestionItem[] = [
  {
    question: 'Which framework?',
    header: 'Framework',
    options: [
      { label: 'React', description: 'Component-based UI library' },
      { label: 'Vue', description: 'Progressive framework' },
    ],
    multiSelect: false,
  },
  {
    question: 'Which styling approach?',
    header: 'Styling',
    options: [
      { label: 'Tailwind', description: 'Utility-first CSS' },
      { label: 'CSS Modules', description: 'Scoped CSS' },
    ],
    multiSelect: false,
  },
];

describe('AskUserQuestion', () => {
  const defaultProps: AskUserQuestionProps = {
    requestId: 'req-1',
    questions: singleQuestion,
    onSubmit: vi.fn(),
  };

  it('renders question header and text', () => {
    render(<AskUserQuestion {...defaultProps} />);

    expect(screen.getByText('Library')).toBeInTheDocument();
    expect(
      screen.getByText('Which library should we use for date formatting?')
    ).toBeInTheDocument();
  });

  it('renders all options with labels and descriptions', () => {
    render(<AskUserQuestion {...defaultProps} />);

    expect(screen.getByText('date-fns')).toBeInTheDocument();
    expect(screen.getByText('Lightweight and modular')).toBeInTheDocument();
    expect(screen.getByText('dayjs')).toBeInTheDocument();
    expect(screen.getByText('luxon')).toBeInTheDocument();
  });

  it('allows selecting single option for non-multiSelect', () => {
    render(<AskUserQuestion {...defaultProps} />);

    const dateFnsOption = screen.getByLabelText('date-fns');
    const dayjsOption = screen.getByLabelText('dayjs');

    // Select first option
    fireEvent.click(dateFnsOption);
    expect(dateFnsOption).toBeChecked();
    expect(dayjsOption).not.toBeChecked();

    // Select second option (should unselect first)
    fireEvent.click(dayjsOption);
    expect(dateFnsOption).not.toBeChecked();
    expect(dayjsOption).toBeChecked();
  });

  it('allows selecting multiple options for multiSelect', () => {
    render(
      <AskUserQuestion
        requestId="req-1"
        questions={multiSelectQuestion}
        onSubmit={vi.fn()}
      />
    );

    const darkMode = screen.getByLabelText('Dark mode');
    const notifications = screen.getByLabelText('Notifications');

    // Select both
    fireEvent.click(darkMode);
    fireEvent.click(notifications);

    expect(darkMode).toBeChecked();
    expect(notifications).toBeChecked();
  });

  it('calls onSubmit with selected answers', () => {
    const onSubmit = vi.fn();
    render(
      <AskUserQuestion
        requestId="req-1"
        questions={singleQuestion}
        onSubmit={onSubmit}
      />
    );

    // Select an option
    fireEvent.click(screen.getByLabelText('dayjs'));

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /回答を送信/i }));

    expect(onSubmit).toHaveBeenCalledWith('req-1', {
      Library: 'dayjs',
    });
  });

  it('calls onSubmit with multiple selections for multiSelect', () => {
    const onSubmit = vi.fn();
    render(
      <AskUserQuestion
        requestId="req-1"
        questions={multiSelectQuestion}
        onSubmit={onSubmit}
      />
    );

    // Select multiple options
    fireEvent.click(screen.getByLabelText('Dark mode'));
    fireEvent.click(screen.getByLabelText('Offline mode'));

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /回答を送信/i }));

    expect(onSubmit).toHaveBeenCalledWith('req-1', {
      Features: 'Dark mode,Offline mode',
    });
  });

  it('renders multiple questions', () => {
    render(
      <AskUserQuestion
        requestId="req-1"
        questions={multipleQuestions}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText('Framework')).toBeInTheDocument();
    expect(screen.getByText('Which framework?')).toBeInTheDocument();
    expect(screen.getByText('Styling')).toBeInTheDocument();
    expect(screen.getByText('Which styling approach?')).toBeInTheDocument();
  });

  it('disables submit button when no options selected', () => {
    render(<AskUserQuestion {...defaultProps} />);

    const submitButton = screen.getByRole('button', { name: /回答を送信/i });
    expect(submitButton).toBeDisabled();
  });

  it('enables submit button when all questions have selections', () => {
    render(
      <AskUserQuestion
        requestId="req-1"
        questions={multipleQuestions}
        onSubmit={vi.fn()}
      />
    );

    const submitButton = screen.getByRole('button', { name: /回答を送信/i });
    expect(submitButton).toBeDisabled();

    // Select for first question
    fireEvent.click(screen.getByLabelText('React'));
    expect(submitButton).toBeDisabled();

    // Select for second question
    fireEvent.click(screen.getByLabelText('Tailwind'));
    expect(submitButton).not.toBeDisabled();
  });

  it('renders "Other" option for custom input', () => {
    render(<AskUserQuestion {...defaultProps} />);

    expect(screen.getByLabelText('Other')).toBeInTheDocument();
  });

  it('shows text input when Other is selected', () => {
    render(<AskUserQuestion {...defaultProps} />);

    // Select Other
    fireEvent.click(screen.getByLabelText('Other'));

    // Text input should appear
    const textInput = screen.getByPlaceholderText('カスタム回答を入力...');
    expect(textInput).toBeInTheDocument();
  });

  it('submits custom text when Other is selected', () => {
    const onSubmit = vi.fn();
    render(
      <AskUserQuestion
        requestId="req-1"
        questions={singleQuestion}
        onSubmit={onSubmit}
      />
    );

    // Select Other
    fireEvent.click(screen.getByLabelText('Other'));

    // Enter custom text
    const textInput = screen.getByPlaceholderText('カスタム回答を入力...');
    fireEvent.change(textInput, { target: { value: 'moment.js' } });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /回答を送信/i }));

    expect(onSubmit).toHaveBeenCalledWith('req-1', {
      Library: 'moment.js',
    });
  });
});
