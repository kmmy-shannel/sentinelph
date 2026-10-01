"""Print all must_not_flip violations from the latest eval report."""
import json
import sys
from pathlib import Path

report_path = Path("data/eval/reports/report_latest.json")
if not report_path.exists():
    print(f"[error] {report_path} not found. Run evaluate.py first.")
    sys.exit(1)

report = json.load(open(report_path))
failures = [f for f in report["regression_suite"]["failures"] if f["must_not_flip"]]

print(f"must_not_flip violations: {len(failures)}")
print("=" * 100)

for f in failures:
    print(f"{f['id']:10s} expected={f['expected_level1']:12s} "
          f"got={f['predicted_level1']:12s} (conf={f['confidence']})")
    print(f"           {f.get('text_preview', '')[:90]}")
    print(f"           {f['note'][:120]}")
    print()