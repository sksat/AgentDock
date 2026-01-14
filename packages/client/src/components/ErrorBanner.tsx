interface ErrorBannerProps {
  error: string | null;
}

export function ErrorBanner({ error }: ErrorBannerProps) {
  if (!error) {
    return null;
  }

  return (
    <div
      data-testid="error-banner"
      className="px-4 py-2 pr-28 bg-accent-danger/10 border-b border-accent-danger text-accent-danger"
    >
      {error}
    </div>
  );
}
