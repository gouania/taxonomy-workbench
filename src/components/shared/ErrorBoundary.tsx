import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
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
    console.error('Uncaught error in component:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="bg-slate-900/60 border border-amber-900/50 rounded-2xl p-8 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-amber-900/20 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle size={32} className="text-amber-500" />
            </div>
            <h3 className="font-display text-xl font-semibold text-white mb-2">Display Error</h3>
            <p className="text-slate-400 mb-6 max-w-md">
              An unexpected error occurred while rendering this module: {this.state.error?.message || 'Unknown error'}
            </p>
            <button
              onClick={this.handleReset}
              className="flex items-center gap-2 px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium transition-colors border border-slate-700/50"
            >
              <RefreshCw size={18} />
              Reset Module
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
