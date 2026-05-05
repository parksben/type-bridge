import { Component, type ErrorInfo, type ReactNode } from "react";
import { t } from "../i18n";

interface Props {
  children: ReactNode;
  label?: string;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

/**
 * 简易错误边界：React render 抛错时展示堆栈，而不是让 webview 白屏。
 * 开发调试用；生产也可保留。
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error) {
    return { error, info: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ error, info });
    console.error("[ErrorBoundary]", this.props.label ?? "", error, info);
  }

  reset = () => this.setState({ error: null, info: null });

  render() {
    if (!this.state.error) return this.props.children;

    const { error, info } = this.state;
    return (
      <div className="h-full overflow-auto p-6 font-mono text-[12px] leading-relaxed">
        <div className="text-error font-medium mb-2">
          {this.props.label
            ? t("errorBoundary.titleWith", { label: this.props.label })
            : t("errorBoundary.title")}
        </div>
        <div className="text-text mb-3 break-all">{String(error.message || error)}</div>
        {error.stack && (
          <details open>
            <summary className="cursor-pointer text-muted mb-2">{t("errorBoundary.stack")}</summary>
            <pre className="whitespace-pre-wrap text-[11px] text-muted">{error.stack}</pre>
          </details>
        )}
        {info?.componentStack && (
          <details open className="mt-3">
            <summary className="cursor-pointer text-muted mb-2">{t("errorBoundary.componentStack")}</summary>
            <pre className="whitespace-pre-wrap text-[11px] text-muted">{info.componentStack}</pre>
          </details>
        )}
        <button
          onClick={this.reset}
          className="mt-4 tb-btn-ghost"
          style={{ border: "1px solid var(--border)" }}
        >
          {t("errorBoundary.reset")}
        </button>
      </div>
    );
  }
}
