import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { Button } from './Primitives';

interface ErrorBannerProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  isRetrying?: boolean;
  onDismiss?: () => void;
  className?: string;
}

export function ErrorBanner({
  title = 'Workspace Data Unavailable',
  message,
  onRetry,
  retryLabel = 'Retry',
  isRetrying = false,
  onDismiss,
  className = '',
}: ErrorBannerProps) {
  return (
    <div
      role="alert"
      data-testid="workspace-error-banner"
      className={`rounded-lg border border-[var(--app-amber)]/45 bg-[var(--app-surface)] px-4 py-3.5 text-[var(--app-text)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${className}`}
    >
      <div className="flex items-start gap-3 min-w-0">
        <AlertTriangle className="w-4 h-4 text-[var(--app-amber)] shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0">
          <div className="text-sm font-medium text-[var(--app-text)]">{title}</div>
          <p className="text-xs text-[var(--app-text-secondary)] mt-0.5 leading-relaxed">
            {message}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
        {onRetry && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onRetry}
            disabled={isRetrying}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
            <span>{isRetrying ? 'Retrying…' : retryLabel}</span>
          </Button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss error message"
            className="p-2 rounded-md text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-elevated)]/60 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
