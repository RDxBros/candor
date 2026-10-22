"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="en"><body><main className="screen empty-state" role="alert">
    <h1>Candor is unavailable</h1>
    <p>We could not load the app right now. Please try again in a moment.</p>
    <button className="primary-button inline-button" type="button" onClick={reset}>Try again</button>
  </main></body></html>;
}
