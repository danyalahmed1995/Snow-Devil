import React from 'react';
import { useTabsStore } from '../../stores/tabs-store';
import './AppErrorBoundary.css';

interface AppErrorBoundaryState {
  error?: Error;
}

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Snow Devil] Shell render failed', error, info.componentStack);
  }

  private recover = () => {
    const state = useTabsStore.getState();
    state.setActiveTab('native:home');
    this.setState({ error: undefined });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app-crash">
        <section className="app-crash__panel">
          <span>Snow Devil recovered a render failure</span>
          <h1>Workspace tab could not be restored</h1>
          <p>
            A saved tab opened with state this version could not safely render. Your local data was not cleared.
            Return to Home, then reopen the repository or flow tab.
          </p>
          <code>{this.state.error.message}</code>
          <button onClick={this.recover}>Return to Home</button>
        </section>
      </div>
    );
  }
}
