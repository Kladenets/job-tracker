import React, { Component, ReactNode, ErrorInfo } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  jobId?: string;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class CardErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[CardErrorBoundary] Caught error in card ${this.props.jobId}:`, error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-[var(--status-danger-fg)]/30 bg-[var(--status-danger-bg)]/30 p-3.5 flex items-center justify-between gap-3 text-xs text-[var(--status-danger-fg)]">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <div className="truncate">
              <span className="font-semibold block truncate">
                Unable to render posting {this.props.fallbackTitle ? `"${this.props.fallbackTitle}"` : ""}
              </span>
              <span className="text-[11px] opacity-80 block truncate">
                {this.state.error?.message || "Render exception occurred"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={this.handleRetry}
            className="px-2.5 py-1 rounded bg-[var(--surface-base)] border border-[var(--status-danger-fg)]/40 hover:bg-[var(--surface-sunken)] transition-colors text-xs font-semibold cursor-pointer shrink-0 flex items-center gap-1"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Retry</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
