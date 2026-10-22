import type { ReactNode } from "react";


export type GameHowStep = {
  label: string;
  cues?: ReactNode;
};

export function GameEntryShell({
  title,
  hook,
  stats,
  action,
  steps,
  preview,
  previewAfterAction = false
}: {
  title: string;
  hook: string;
  stats?: ReactNode;
  action: ReactNode;
  steps: GameHowStep[];
  preview?: ReactNode;
  previewAfterAction?: boolean;
}) {
  const titleId = `game-entry-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return <section className="lean-game-entry" aria-labelledby={titleId}>
    <div className="lean-entry-intro">
      <h1 id={titleId}>{title}</h1>
      <p>{hook}</p>
    </div>
    {stats}
    {preview && !previewAfterAction ? <div className="game-entry-preview">{preview}</div> : null}
    {action}
    {preview && previewAfterAction ? <div className="game-entry-preview game-entry-preview-after-action">{preview}</div> : null}
    <section className="lean-how-it-works" aria-labelledby={`${titleId}-how`}>
      <h2 id={`${titleId}-how`}>How it works</h2>
      <ol>
        {steps.map((step, index) => <li key={step.label}>
          <span className="lean-step-number" aria-hidden="true">{index + 1}</span>
          <span>{step.label}</span>
          {step.cues}
        </li>)}
      </ol>
    </section>
  </section>;
}
