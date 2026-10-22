"use client";

import { usePreviewActivity } from "./use-preview-activity";

export function SpotLeanPreview() {
  const { ref, active } = usePreviewActivity();

  return <figure className="game-preview spot-lean-preview" data-running={active} ref={ref}>
    <svg aria-hidden="true" focusable="false" viewBox="0 0 320 132">
      <rect className="game-preview-stage" x="1" y="1" width="318" height="130" rx="14" />
      <g className="spot-preview-card">
        <rect x="54" y="47" width="212" height="58" rx="10" />
        <path d="M74 67h124M74 78h168M74 89h102" />
      </g>
      <g className="spot-preview-chip spot-preview-chip-left">
        <rect x="45" y="94" width="64" height="25" rx="12.5" />
        <text x="77" y="111" textAnchor="middle">Left</text>
      </g>
      <g className="spot-preview-chip spot-preview-chip-right">
        <rect x="211" y="94" width="64" height="25" rx="12.5" />
        <text x="243" y="111" textAnchor="middle">Right</text>
      </g>
      <g className="spot-preview-chip spot-preview-chip-center">
        <rect x="126" y="94" width="68" height="25" rx="12.5" />
        <text x="160" y="111" textAnchor="middle">Center</text>
      </g>
    </svg>
    <figcaption>Swipe left, right or up, then reveal the lean.</figcaption>
  </figure>;
}
