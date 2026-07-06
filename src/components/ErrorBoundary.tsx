import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorPage } from './ErrorPage';
import { reportError } from '@/lib/errorReporter';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Boundary global de erros de renderização. Mostra uma página amigável para
 * o usuário e envia o erro (com stack) para o backend, que notifica todos os
 * administradores da plataforma.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void reportError({
      message: error.message || 'ReactErrorBoundary',
      stack: error.stack ?? null,
      component_stack: info.componentStack ?? null,
      source: 'react',
      severity: 'fatal',
    });
    // Sempre logamos no console para desenvolvimento.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info);
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return <ErrorPage message={this.state.error.message} onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}
