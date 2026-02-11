# Lineup Label Scan Eval Fixtures

Create a local manifest at `eval/fixtures/lineup-label-scan.json` based on the sample file.

## Expected layout

- Place fixture images under `eval/fixtures/images/`
- Keep the manifest file in `eval/fixtures/`

## Run

```bash
npm run eval:lineup
```

Optional flags:

- `--manifest <path>`: alternate manifest file
- `--out <path>`: output report path
- `--limit <n>`: evaluate first `n` cases
- `--model <name>`: override model from manifest

The report is written to `eval/reports/lineup-label-scan-report.json` by default.

## Scoring

The harness reports:

- `count_accuracy`: expected vs predicted bottle count
- `field_recall`: match rate across expected text fields (`wine_name`, `producer`, `vintage`, `country`, `region`, `appellation`, `classification`)
- `avg_label_bbox_iou`: mean IoU when expected `label_bbox` is provided

Notes:

- Use normalized (0-1) boxes for expected `label_bbox`.
- Field matching is case-insensitive and punctuation-insensitive with loose substring matching.
