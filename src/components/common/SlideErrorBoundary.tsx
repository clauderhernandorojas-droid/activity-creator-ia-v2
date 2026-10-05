import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class SlideErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('SlideErrorBoundary captured an error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-6 text-center shadow-xs flex flex-col items-center justify-center min-h-[220px]">
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 mb-3">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-amber-900 mb-1">
            {this.props.fallbackTitle || 'Contingencia de Renderizado Protegida'}
          </h4>
          <p className="text-xs text-amber-700/90 max-w-md mb-4 leading-relaxed">
            Se ha aislado este bloque para no interrumpir la clase debido a un formato imprevisto o datos inconsistentes.
          </p>
          {this.state.error?.message && (
            <p className="text-[11px] font-mono text-amber-800 bg-amber-100/60 px-3 py-1 rounded-lg mb-4 max-w-sm truncate">
              {this.state.error.message}
            </p>
          )}
          <button
            onClick={this.handleReset}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold shadow-xs transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reintentar componente</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
