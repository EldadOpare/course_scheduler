"""Layer 1+2: validate (hard rules) then score (soft rules)."""
from __future__ import annotations

from .models import Dataset, Placement, Penalty, Violation
from .rules import hard, soft


def validate(ds: Dataset, placements: list[Placement]) -> list[Violation]:
    return hard.check_catalog(ds) + hard.check_all(ds, placements)


def score(ds: Dataset, placements: list[Placement],
          weights: dict[str, int] | None = None) -> tuple[int, list[Penalty]]:
    penalties = soft.score_all(ds, placements, weights)
    return sum(p.weight for p in penalties), penalties


def report(ds: Dataset, placements: list[Placement]) -> str:
    violations = validate(ds, placements)
    total, penalties = score(ds, placements)
    lines = [f"Placements: {len(placements)}"]
    if violations:
        lines.append(f"\nCONFLICTS: {len(violations)} scheduling issue(s) found:")
        lines += [f"  {v.message}" for v in violations]
    else:
        lines.append("\nOK: no scheduling conflicts.")
    lines.append(f"\nQuality score: {total} (lower is better)")
    if penalties:
        lines += [f"  [{p.code} +{p.weight}] {p.message}" for p in penalties]
    return "\n".join(lines)
