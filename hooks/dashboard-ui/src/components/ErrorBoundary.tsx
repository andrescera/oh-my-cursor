import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type Props = {
  children: ReactNode
  fallback?: (error: Error, reset: () => void) => ReactNode
  onError?: (error: Error, info: ErrorInfo) => void
}

type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info)
    if (typeof console !== 'undefined') {
      console.error('[dashboard] render crash', error, info.componentStack)
    }
  }

  reset = (): void => {
    this.setState({ error: null })
  }

  reload = (): void => {
    if (typeof window !== 'undefined' && window.location?.reload) {
      window.location.reload()
    } else {
      this.reset()
    }
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback(error, this.reset)
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="flex min-h-screen items-center justify-center p-6"
      >
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Something went wrong</CardTitle>
            <CardDescription>
              The dashboard hit an unexpected error and stopped rendering.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <pre
              data-testid="error-boundary-message"
              className="overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground"
            >
              {error.message || String(error)}
            </pre>
            <div className="flex flex-wrap gap-2">
              <Button onClick={this.reload} variant="default">
                Reload dashboard
              </Button>
              <Button onClick={this.reset} variant="outline">
                Try again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }
}
