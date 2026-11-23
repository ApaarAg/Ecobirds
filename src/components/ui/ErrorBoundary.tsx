import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button, SurfacePanel } from './Primitives';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error) {
    // Log high-level message without exposing stack traces in the UI
    console.error('EcoSonic workspace route error:', error.message);
  }

  private handleReset = () => {
    this.setState({ hasError: false });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[var(--app-bg)] text-[var(--app-text)] flex items-center justify-center p-6">
          <SurfacePanel className="max-w-lg w-full p-8 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[var(--app-surface-elevated)] flex items-center justify-center text-[var(--app-amber)] shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-serif text-2xl font-semibold text-[var(--app-text)]">
                  Workspace View Unavailable
                </h1>
                <p className="text-xs text-[var(--app-text-muted)] mt-0.5">
                  EcoSonic encountered an unexpected rendering error
                </p>
              </div>
            </div>

            <p className="text-sm text-[var(--app-text-secondary)] leading-relaxed">
              This route could not finish rendering. Your saved preferences remain intact. You can
              retry loading the workspace view or return to the main landing page.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button type="button" variant="primary" size="sm" onClick={this.handleReset}>
                <RotateCw className="w-3.5 h-3.5" />
                <span>Retry View</span>
              </Button>
              <a
                href="/"
                className="inline-flex items-center justify-center px-3.5 py-2 text-xs min-h-[36px] font-medium rounded-md border border-[var(--app-border-strong)] bg-[var(--app-surface-elevated)] text-[var(--app-text)] hover:border-[var(--app-text-muted)] transition-colors"
              >
                Return to Home
              </a>
            </div>
          </SurfacePanel>
        </div>
      );
    }

    return this.props.children;
  }
}
