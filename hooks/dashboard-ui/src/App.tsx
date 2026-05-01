import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import Shell from '@/components/Shell'

export default function App() {
  return (
    <ErrorBoundary>
      <TooltipProvider>
        <Shell />
        <Toaster richColors closeButton position="bottom-right" />
      </TooltipProvider>
    </ErrorBoundary>
  )
}
