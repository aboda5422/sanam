import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

type Props = { children: ReactNode };
type State = { error: Error | null };

class AdminErrorBoundaryInner extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[admin]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3 p-6 text-center" dir="rtl">
          <p className="font-heading font-bold text-lg">تعذر عرض هذه الصفحة</p>
          <p className="text-sm text-muted-foreground max-w-md break-words">
            {this.state.error.message}
          </p>
          <button
            type="button"
            className="text-sm text-primary underline"
            onClick={() => this.setState({ error: null })}
          >
            إعادة المحاولة
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Prevents a single admin page crash from blanking the whole screen. */
export function AdminErrorBoundary({ children }: Props) {
  const { pathname } = useLocation();
  const [hmrGen, setHmrGen] = useState(0);

  useEffect(() => {
    const hot = import.meta.hot;
    if (!hot) return;
    const bump = () => setHmrGen((g) => g + 1);
    hot.on("vite:afterUpdate", bump);
    return () => {
      hot.off("vite:afterUpdate", bump);
    };
  }, []);

  return (
    <AdminErrorBoundaryInner key={`${pathname}:${hmrGen}`}>{children}</AdminErrorBoundaryInner>
  );
}
