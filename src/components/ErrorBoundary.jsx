import React from "react";

// One part of Sol failing must not blank all of it. Before this, a crash in the Agents tab (a
// bad fleet response) unmounted the whole app, chat included, because nothing caught it.
// Wrap anything that renders data from the network; `label` names it in the fallback.
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.retry = () => this.setState({ error: null });
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(`[Sol] ${this.props.label || "A screen"} failed:`, error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.quiet) return null;
    return React.createElement(
      "div",
      { className: "empty-state compact", role: "alert" },
      React.createElement("h2", null, `${this.props.label || "This part of Sol"} hit a problem`),
      React.createElement("p", null, "The rest of Sol still works. You can try this again."),
      React.createElement("button", { type: "button", className: "button", onClick: this.retry }, "Try again"),
    );
  }
}
