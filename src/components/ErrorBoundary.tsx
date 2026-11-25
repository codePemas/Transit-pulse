'use client';

import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const msg =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
        ? error
        : 'Unexpected rendering error';
    return { hasError: true, errorMessage: msg };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 m-3 rounded-2xl bg-rose-950/70 border border-rose-500/40 text-rose-200 text-xs space-y-2">
          <p className="font-bold text-sm text-rose-100">
            View encountered a runtime error
          </p>
          <p className="font-mono break-words text-rose-300">
            {this.state.errorMessage}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, errorMessage: '' })}
            className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}