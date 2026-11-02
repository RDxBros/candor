# Daily Spot the Lean stories

Daily game stories use the same two-file format as the existing story pipeline:

- `NNN.json` contains the stable story id, original publication date, neutral Candor headline, category, eligibility fields, and three source records with stable `source_id`, outlet, lean, excerpt, and optional verbatim `game_snippet`.
- `NNN_output.json` contains the reviewed generated object, including `what_happened` and one keyword record per source. Each keyword record supplies the existing terms, optional game excerpt, and optional explanation used as the reveal tell.

Add the input file's repository-relative path to `game-content/daily-lean/schedule.json`. Schedule entries stay `reviewed_by_human: false` until the story and all three cards have been reviewed. Runtime generation is never used.
