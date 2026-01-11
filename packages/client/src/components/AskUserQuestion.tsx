import { useState, useCallback } from 'react';
import type { QuestionItem } from '@claude-bridge/shared';

export interface AskUserQuestionProps {
  requestId: string;
  questions: QuestionItem[];
  onSubmit: (requestId: string, answers: Record<string, string>) => void;
}

interface QuestionState {
  selected: string[];
  customText: string;
  useCustom: boolean;
}

export function AskUserQuestion({
  requestId,
  questions,
  onSubmit,
}: AskUserQuestionProps) {
  // State for each question keyed by header
  const [questionStates, setQuestionStates] = useState<
    Record<string, QuestionState>
  >(() => {
    const initial: Record<string, QuestionState> = {};
    for (const q of questions) {
      initial[q.header] = { selected: [], customText: '', useCustom: false };
    }
    return initial;
  });

  const handleOptionChange = useCallback(
    (header: string, label: string, multiSelect: boolean) => {
      setQuestionStates((prev) => {
        const current = prev[header];
        let newSelected: string[];

        if (multiSelect) {
          // Toggle selection
          if (current.selected.includes(label)) {
            newSelected = current.selected.filter((l) => l !== label);
          } else {
            newSelected = [...current.selected, label];
          }
        } else {
          // Single select
          newSelected = [label];
        }

        return {
          ...prev,
          [header]: { ...current, selected: newSelected, useCustom: false },
        };
      });
    },
    []
  );

  const handleCustomSelect = useCallback((header: string) => {
    setQuestionStates((prev) => ({
      ...prev,
      [header]: { ...prev[header], selected: [], useCustom: true },
    }));
  }, []);

  const handleCustomTextChange = useCallback(
    (header: string, text: string) => {
      setQuestionStates((prev) => ({
        ...prev,
        [header]: { ...prev[header], customText: text },
      }));
    },
    []
  );

  const isComplete = questions.every((q) => {
    const state = questionStates[q.header];
    if (state.useCustom) {
      return state.customText.trim().length > 0;
    }
    return state.selected.length > 0;
  });

  const handleSubmit = useCallback(() => {
    const answers: Record<string, string> = {};
    for (const q of questions) {
      const state = questionStates[q.header];
      if (state.useCustom) {
        answers[q.header] = state.customText.trim();
      } else {
        answers[q.header] = state.selected.join(',');
      }
    }
    onSubmit(requestId, answers);
  }, [questions, questionStates, requestId, onSubmit]);

  return (
    <div className="bg-bg-secondary rounded-lg border border-border p-4">
      <div className="flex items-center gap-2 mb-4">
        <svg
          className="w-5 h-5 text-accent-primary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span className="font-medium text-text-primary">Claude からの質問</span>
      </div>

      <div className="space-y-6">
        {questions.map((question) => (
          <QuestionSection
            key={question.header}
            question={question}
            state={questionStates[question.header]}
            onOptionChange={(label) =>
              handleOptionChange(question.header, label, question.multiSelect)
            }
            onCustomSelect={() => handleCustomSelect(question.header)}
            onCustomTextChange={(text) =>
              handleCustomTextChange(question.header, text)
            }
          />
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={!isComplete}
          className="px-4 py-2 bg-accent-primary text-white rounded-lg font-medium
                     hover:bg-accent-primary/90 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors"
        >
          回答を送信
        </button>
      </div>
    </div>
  );
}

interface QuestionSectionProps {
  question: QuestionItem;
  state: QuestionState;
  onOptionChange: (label: string) => void;
  onCustomSelect: () => void;
  onCustomTextChange: (text: string) => void;
}

function QuestionSection({
  question,
  state,
  onOptionChange,
  onCustomSelect,
  onCustomTextChange,
}: QuestionSectionProps) {
  const inputType = question.multiSelect ? 'checkbox' : 'radio';
  const inputName = `question-${question.header}`;

  return (
    <div>
      <div className="mb-2">
        <span className="inline-block px-2 py-0.5 text-xs font-medium bg-accent-primary/20 text-accent-primary rounded">
          {question.header}
        </span>
      </div>
      <p className="text-text-primary mb-3">{question.question}</p>

      <div className="space-y-2">
        {question.options.map((option) => (
          <label
            key={option.label}
            className="flex items-start gap-3 p-3 rounded-lg border border-border
                       hover:border-accent-primary/50 hover:bg-bg-tertiary cursor-pointer
                       transition-colors"
          >
            <input
              type={inputType}
              name={inputName}
              aria-label={option.label}
              checked={state.selected.includes(option.label)}
              onChange={() => onOptionChange(option.label)}
              className="mt-1"
            />
            <div>
              <div className="font-medium text-text-primary">{option.label}</div>
              <div className="text-sm text-text-secondary">
                {option.description}
              </div>
            </div>
          </label>
        ))}

        {/* Other option */}
        <label
          className="flex items-start gap-3 p-3 rounded-lg border border-border
                     hover:border-accent-primary/50 hover:bg-bg-tertiary cursor-pointer
                     transition-colors"
        >
          <input
            type={inputType}
            name={inputName}
            aria-label="Other"
            checked={state.useCustom}
            onChange={onCustomSelect}
            className="mt-1"
          />
          <div className="flex-1">
            <div className="font-medium text-text-primary">Other</div>
            {state.useCustom && (
              <input
                type="text"
                value={state.customText}
                onChange={(e) => onCustomTextChange(e.target.value)}
                placeholder="カスタム回答を入力..."
                className="mt-2 w-full px-3 py-2 bg-bg-primary border border-border rounded-lg
                           text-text-primary placeholder-text-secondary
                           focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
              />
            )}
          </div>
        </label>
      </div>
    </div>
  );
}
