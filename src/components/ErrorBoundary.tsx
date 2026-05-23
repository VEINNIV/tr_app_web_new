/**
 * ErrorBoundary — catches unhandled render errors so the whole app
 * doesn't go blank. Shows a user-friendly recovery screen instead.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Optional custom fallback UI */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console in development; swap for Sentry/LogRocket in production
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/dashboard';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '2rem',
          background: 'var(--color-bg, #fff)',
          fontFamily: 'var(--font-family, sans-serif)',
          textAlign: 'center',
        }}>
          <span style={{ fontSize: '3rem' }}>⚠️</span>
          <h1 style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            color: 'var(--color-text-primary, #111)',
            margin: 0,
          }}>
            Beklenmedik bir hata oluştu
          </h1>
          <p style={{
            fontSize: '0.875rem',
            color: 'var(--color-text-secondary, #666)',
            maxWidth: 400,
            lineHeight: 1.6,
            margin: 0,
          }}>
            Üzgünüz, bir şeyler ters gitti. Sayfayı yenileyin ya da ana sayfaya dönün.
          </p>
          {import.meta.env.DEV && this.state.error && (
            <pre style={{
              fontSize: '0.75rem',
              color: '#e11d48',
              background: '#fff1f2',
              border: '1px solid #fecdd3',
              borderRadius: 8,
              padding: '0.75rem 1rem',
              maxWidth: 600,
              overflowX: 'auto',
              textAlign: 'left',
            }}>
              {this.state.error.toString()}
            </pre>
          )}
          <button
            onClick={this.handleReset}
            style={{
              marginTop: '0.5rem',
              padding: '10px 24px',
              borderRadius: 999,
              border: 'none',
              background: 'var(--color-accent, #0057FF)',
              color: '#fff',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Ana Sayfaya Dön
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
