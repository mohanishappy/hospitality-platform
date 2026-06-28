import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app error-boundary">
          <h1>Something went wrong</h1>
          <p className="error">{this.state.error.message}</p>
          <p className="muted">
            Check the browser console for details. Try clearing site data for
            this origin or logging in again.
          </p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

type PanelProps = {
  title: string;
  children: ReactNode;
};

type PanelState = {
  error: Error | null;
};

export class PanelErrorBoundary extends Component<PanelProps, PanelState> {
  state: PanelState = { error: null };

  static getDerivedStateFromError(error: Error): PanelState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Panel "${this.props.title}" error:`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <section className="panel panel-wide panel-error">
          <h2>{this.props.title}</h2>
          <p className="error">{this.state.error.message}</p>
          <button
            type="button"
            className="secondary"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </section>
      );
    }

    return this.props.children;
  }
}
