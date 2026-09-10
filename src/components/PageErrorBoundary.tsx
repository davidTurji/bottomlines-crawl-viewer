/**
 * One page's failure must not take the report with it.
 *
 * The Discovery crash blanked the ENTIRE app -- overview, changes,
 * everything -- because a React tree with no boundary unmounts whole when
 * any node throws. The customer saw a white screen and no way back, on a
 * link they were sent.
 *
 * The data bug behind it is fixed at the freeze and at the probe. This is
 * the layer that makes the next unknown one survivable: the failing page
 * becomes a card, the shell and the nav stay, and the reader can walk to
 * the pages that work. It says what happened without pretending the page
 * is fine, and offers the one action that ever helps.
 */

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Reset when this changes, so navigating away clears the failure. */
  resetKey?: string;
}

export default class PageErrorBoundary extends Component<
  Props,
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  componentDidCatch(error: Error) {
    // Kept in the console for the operator reading a customer's report
    // over their shoulder; nothing is sent anywhere.
    console.error("Pathfinder page failed to render:", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold tracking-tight text-slate-900">
            This page could not be shown
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Something in this section did not render. The rest of your
            report is unaffected: use the menu to open another page. If it
            keeps happening, tell your account contact and they can rebuild
            the report.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ failed: false })}
            className="mt-4 inline-flex h-9 items-center rounded-md border border-border bg-white px-3.5 text-[13px] font-medium text-slate-700 transition-colors hover:bg-muted"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
