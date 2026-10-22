"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main id="main-content" className="screen empty-state" role="alert">
    <h1>Something went wrong</h1>
    <p>Candor could not load this page right now. Please try again.</p>
    <button className="primary-button inline-button" type="button" onClick={reset}>Try again</button>
  </main>;
}
