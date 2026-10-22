"use client";

import { usePreviewActivity } from "./use-preview-activity";

export function FactOpinionPreview() {
  const { ref, active } = usePreviewActivity();

  return <figure className="game-preview fact-opinion-preview" data-running={active} ref={ref}>
    <svg aria-hidden="true" focusable="false" viewBox="0 0 320 140">
      <rect className="game-preview-stage" x="1" y="1" width="318" height="138" rx="14" />
      <g className="fact-preview-box fact-preview-box-left">
        <rect x="15" y="83" width="138" height="45" rx="9" />
        <text x="27" y="98">Fact</text>
      </g>
      <g className="fact-preview-box fact-preview-box-right">
        <rect x="167" y="83" width="138" height="45" rx="9" />
        <text x="179" y="98">Opinion</text>
      </g>
      <g className="fact-preview-card fact-preview-card-one">
        <rect x="48" y="15" width="224" height="42" rx="9" />
        <text x="60" y="40">The library extended its weekend hours.</text>
      </g>
      <g className="fact-preview-card fact-preview-card-two">
        <rect x="48" y="15" width="224" height="42" rx="9" />
        <text x="60" y="40">The new schedule is too crowded.</text>
      </g>
    </svg>
    <figcaption>Sort each sentence into Fact or Opinion.</figcaption>
  </figure>;
}
