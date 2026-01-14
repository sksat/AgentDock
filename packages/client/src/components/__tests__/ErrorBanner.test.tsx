import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBanner } from '../ErrorBanner';

describe('ErrorBanner', () => {
  it('should render error message when error is provided', () => {
    render(<ErrorBanner error="Something went wrong" />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('should not render when error is null', () => {
    const { container } = render(<ErrorBanner error={null} />);

    expect(container.firstChild).toBeNull();
  });

  it('should not render when error is empty string', () => {
    const { container } = render(<ErrorBanner error="" />);

    // empty string is falsy, so should not render
    expect(container.firstChild).toBeNull();
  });

  it('should have right padding to avoid overlapping with ToDo panel', () => {
    render(<ErrorBanner error="Test error" />);

    const banner = screen.getByTestId('error-banner');
    // pr-28 = 112px padding-right to avoid overlapping with collapsed ToDo panel
    expect(banner).toHaveClass('pr-28');
  });

  it('should have danger styling', () => {
    render(<ErrorBanner error="Test error" />);

    const banner = screen.getByTestId('error-banner');
    expect(banner).toHaveClass('bg-accent-danger/10');
    expect(banner).toHaveClass('border-accent-danger');
    expect(banner).toHaveClass('text-accent-danger');
  });
});

describe('ErrorBanner robustness', () => {
  it('should handle very long error messages without breaking layout', () => {
    const longError = 'A'.repeat(1000);

    expect(() => render(<ErrorBanner error={longError} />)).not.toThrow();
    expect(screen.getByText(longError)).toBeInTheDocument();
  });

  it('should handle error messages with special characters', () => {
    const specialError = '<script>alert("xss")</script> & "quotes" \'single\'';

    expect(() => render(<ErrorBanner error={specialError} />)).not.toThrow();
    // React escapes special characters by default
    expect(screen.getByTestId('error-banner')).toHaveTextContent(specialError);
  });
});
