import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component tree:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-full w-full bg-val-bg flex items-center justify-center p-6 select-none">
          <div className="max-w-md w-full bg-val-card border border-val-border rounded-xl p-6 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-val-red/20 border border-val-red/40 mx-auto flex items-center justify-center text-val-red">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                {this.props.fallbackTitle || 'UI Rendering Error Caught'}
              </h2>
              <p className="text-xs text-val-muted mt-1 leading-relaxed">
                An unexpected UI state occurred. Your local accounts, levels, and vault are safe and intact.
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 bg-val-bg border border-val-border/60 rounded-lg text-[11px] font-mono text-val-red text-left break-words max-h-28 overflow-y-auto">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex-1 py-2 rounded-lg bg-val-bg hover:bg-val-cardHover border border-val-border text-xs font-semibold text-val-light transition-colors"
              >
                Dismiss & Continue
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-val-red hover:bg-val-redHover text-xs font-bold text-white transition-colors shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload Tracker</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
