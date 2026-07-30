// Next.js runs register() once when the server boots. The nested NEXT_RUNTIME
// check is load-bearing: it lets the edge compilation (pulled in by
// middleware.ts) dead-code-eliminate the node-only import below, which would
// otherwise drag the postgres driver into an edge bundle and fail the build.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node');
  }
}
