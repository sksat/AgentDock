import { useState, useEffect } from 'react';

// Official Claude Code vibing messages from the VSCode extension
const VIBING_WORDS = [
  'Accomplishing',
  'Actioning',
  'Actualizing',
  'Baking',
  'Booping',
  'Brewing',
  'Calculating',
  'Cerebrating',
  'Channelling',
  'Churning',
  'Clauding',
  'Coalescing',
  'Cogitating',
  'Computing',
  'Combobulating',
  'Concocting',
  'Considering',
  'Contemplating',
  'Cooking',
  'Crafting',
  'Creating',
  'Crunching',
  'Deciphering',
  'Deliberating',
  'Determining',
  'Discombobulating',
  'Doing',
  'Effecting',
  'Elucidating',
  'Enchanting',
  'Envisioning',
  'Finagling',
  'Flibbertigibbeting',
  'Forging',
  'Forming',
  'Frolicking',
  'Generating',
  'Germinating',
  'Hatching',
  'Herding',
  'Honking',
  'Ideating',
  'Imagining',
  'Incubating',
  'Inferring',
  'Manifesting',
  'Marinating',
  'Meandering',
  'Moseying',
  'Mulling',
  'Mustering',
  'Musing',
  'Noodling',
  'Percolating',
  'Perusing',
  'Philosophising',
  'Pontificating',
  'Pondering',
  'Processing',
  'Puttering',
  'Puzzling',
  'Reticulating',
  'Ruminating',
  'Scheming',
  'Schlepping',
  'Shimmying',
  'Simmering',
  'Smooshing',
  'Spelunking',
  'Spinning',
  'Stewing',
  'Sussing',
  'Synthesizing',
  'Thinking',
  'Tinkering',
  'Transmuting',
  'Unfurling',
  'Unravelling',
  'Vibing',
  'Wandering',
  'Whirring',
  'Wibbling',
  'Working',
  'Wrangling',
];

export interface LoadingIndicatorProps {
  onInterrupt?: () => void;
  /** Fixed message to display instead of random vibing messages */
  message?: string;
}

export function LoadingIndicator({ onInterrupt, message }: LoadingIndicatorProps) {
  const [messageIndex, setMessageIndex] = useState(() =>
    Math.floor(Math.random() * VIBING_WORDS.length)
  );

  useEffect(() => {
    // Don't cycle messages if a fixed message is provided
    if (message) return;

    const interval = setInterval(() => {
      setMessageIndex((prev) => {
        let next = Math.floor(Math.random() * VIBING_WORDS.length);
        // Avoid showing the same message twice in a row
        while (next === prev && VIBING_WORDS.length > 1) {
          next = Math.floor(Math.random() * VIBING_WORDS.length);
        }
        return next;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [message]);

  const displayMessage = message ?? `${VIBING_WORDS[messageIndex]}...`;

  return (
    <div data-testid="loading-indicator" className="px-4 py-2 border-t border-border flex items-center justify-between">
      <div className="flex items-center gap-2 text-text-secondary">
        <img src="/agentdock-animated.svg" alt="" className="h-5 w-auto" />
        <span className="transition-opacity duration-300">
          {displayMessage}
        </span>
      </div>
      {onInterrupt && (
        <button
          onClick={onInterrupt}
          className="px-3 py-1 text-sm bg-accent-danger/20 text-accent-danger rounded-lg
                     hover:bg-accent-danger/30 transition-colors"
        >
          中断
        </button>
      )}
    </div>
  );
}
