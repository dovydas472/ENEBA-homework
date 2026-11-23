import { Component, type ReactNode } from "react";

interface BlockBoundaryProps {
  /** For the console message: which block crashed. */
  blockKey: string;
  children: ReactNode;
}

/**
 * A React error boundary around ONE home page block. If the block's renderer throws while drawing (e.g. the
 * server sent data in a shape this build does not expect), only that block disappears; without it the error
 * would reach the route's error page and take the whole home page down.
 * (Error boundaries can only be class components - React has no hook for this.)
 */
export class BlockBoundary extends Component<BlockBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // A constant first argument: the block key is data and must not be read as a console format string.
    console.error("Home page block failed to render and is hidden:", this.props.blockKey, error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
