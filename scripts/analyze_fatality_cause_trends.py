#!/usr/bin/env python3
"""Analyze USPA fatality-cause distribution shifts.

Produces CSV, Markdown, and SVG artifacts from data/uspa-fatality-summary.csv.
Uses only the Python standard library so it can run on the project Pi without
installing scientific packages.
"""

from __future__ import annotations

import csv
import html
import math
import random
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "data" / "uspa-fatality-summary.csv"
OUT_DIR = ROOT / "data" / "fatality-cause-analysis"
PERMUTATIONS = 20000
RANDOM_SEED = 20260714

PRIMARY_CAUSE_COLS = [
    "landing",
    "medical",
    "equipment_problem",
    "malfunction",
    "no_pull_or_low_pull",
    "low_deployment",
    "canopy_collision",
    "freefall_collision",
    "reserve_problem",
    "cutaway_low_or_no_reserve",
    "other",
]

FULL_TEST_CAUSES = [
    "landing",
    "malfunction",
    "no_pull_or_low_pull",
    "reserve_problem",
    "canopy_collision",
    "freefall_collision",
    "medical",
    "other_rare_or_unknown",
]

DISPLAY_CAUSES = [
    "canopy_collision",
    "freefall_collision",
    "all_collision",
    "landing",
    "malfunction",
    "no_pull_or_low_pull",
    "reserve_problem",
    "medical",
    "other_rare_or_unknown",
]


def clean_int(value: str | None) -> int:
    value = (value or "").strip()
    if not value:
        return 0
    return int(value)


@dataclass
class YearRow:
    year: int
    total: int
    causes: dict[str, int]
    notes: str

    @property
    def known_primary_sum(self) -> int:
        return sum(self.causes[c] for c in PRIMARY_CAUSE_COLS)

    @property
    def unknown(self) -> int:
        return max(0, self.total - self.known_primary_sum)

    @property
    def all_collision(self) -> int:
        return self.causes["canopy_collision"] + self.causes["freefall_collision"]

    def full_test_counts(self) -> dict[str, int]:
        other_rare = (
            self.causes["equipment_problem"]
            + self.causes["low_deployment"]
            + self.causes["cutaway_low_or_no_reserve"]
            + self.causes["other"]
            + self.unknown
        )
        return {
            "landing": self.causes["landing"],
            "malfunction": self.causes["malfunction"],
            "no_pull_or_low_pull": self.causes["no_pull_or_low_pull"],
            "reserve_problem": self.causes["reserve_problem"],
            "canopy_collision": self.causes["canopy_collision"],
            "freefall_collision": self.causes["freefall_collision"],
            "medical": self.causes["medical"],
            "other_rare_or_unknown": other_rare,
        }


def load_rows() -> list[YearRow]:
    rows: list[YearRow] = []
    with INPUT.open(newline="") as f:
        for r in csv.DictReader(f):
            causes = {c: clean_int(r.get(c)) for c in PRIMARY_CAUSE_COLS}
            rows.append(YearRow(int(r["year"]), clean_int(r["total_fatalities"]), causes, r.get("notes", "")))
    return sorted(rows, key=lambda r: r.year)


# Regularized upper incomplete gamma Q(a, x), adapted from Numerical Recipes.
def gammaincc(a: float, x: float) -> float:
    if x < 0 or a <= 0:
        raise ValueError("bad args")
    if x == 0:
        return 1.0
    gln = math.lgamma(a)
    if x < a + 1.0:
        ap = a
        summ = 1.0 / a
        delta = summ
        for _ in range(200):
            ap += 1.0
            delta *= x / ap
            summ += delta
            if abs(delta) < abs(summ) * 3e-14:
                break
        lower_p = summ * math.exp(-x + a * math.log(x) - gln)
        return max(0.0, min(1.0, 1.0 - lower_p))
    b = x + 1.0 - a
    c = 1.0 / 1e-300
    d = 1.0 / b
    h = d
    for i in range(1, 200):
        an = -i * (i - a)
        b += 2.0
        d = an * d + b
        if abs(d) < 1e-300:
            d = 1e-300
        c = b + an / c
        if abs(c) < 1e-300:
            c = 1e-300
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < 3e-14:
            break
    return max(0.0, min(1.0, math.exp(-x + a * math.log(x) - gln) * h))


def chi_square_pvalue(stat: float, df: int) -> float:
    return gammaincc(df / 2.0, stat / 2.0)


def normal_cdf(z: float) -> float:
    return 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))


def fisher_exact_2x2(a: int, b: int, c: int, d: int) -> float:
    # table [[a,b],[c,d]], fixed margins, two-sided probability <= observed prob
    r1 = a + b
    r2 = c + d
    col1 = a + c
    n = r1 + r2

    def hypergeom(x: int) -> float:
        return math.comb(col1, x) * math.comb(n - col1, r1 - x) / math.comb(n, r1)

    lo = max(0, r1 - (n - col1))
    hi = min(r1, col1)
    observed = hypergeom(a)
    return min(1.0, sum(hypergeom(x) for x in range(lo, hi + 1) if hypergeom(x) <= observed + 1e-15))


def two_by_two_stats(before_hit: int, before_total: int, after_hit: int, after_total: int) -> dict[str, float]:
    before_other = before_total - before_hit
    after_other = after_total - after_hit
    p_before = before_hit / before_total if before_total else 0.0
    p_after = after_hit / after_total if after_total else 0.0
    # Haldane-Anscombe correction for OR CI when cells are zero.
    ah, bo, ch, do = before_hit + 0.5, before_other + 0.5, after_hit + 0.5, after_other + 0.5
    odds_ratio = (after_hit / after_other) / (before_hit / before_other) if before_hit and before_other and after_other else math.inf
    log_or = math.log((ch / do) / (ah / bo))
    se_log_or = math.sqrt(1 / ah + 1 / bo + 1 / ch + 1 / do)
    or_low = math.exp(log_or - 1.96 * se_log_or)
    or_high = math.exp(log_or + 1.96 * se_log_or)

    rr = p_after / p_before if p_before else math.inf
    rr_low = rr_high = math.nan
    if before_hit and after_hit:
        se_log_rr = math.sqrt((1 / after_hit) - (1 / after_total) + (1 / before_hit) - (1 / before_total))
        rr_low = math.exp(math.log(rr) - 1.96 * se_log_rr)
        rr_high = math.exp(math.log(rr) + 1.96 * se_log_rr)

    pooled = (before_hit + after_hit) / (before_total + after_total)
    se = math.sqrt(pooled * (1 - pooled) * (1 / before_total + 1 / after_total)) if pooled not in (0, 1) else math.inf
    z = (p_after - p_before) / se if se and math.isfinite(se) else 0.0
    two_prop_p = 2 * (1 - normal_cdf(abs(z)))
    fisher_p = fisher_exact_2x2(before_hit, before_other, after_hit, after_other)
    return {
        "before_hit": before_hit,
        "before_total": before_total,
        "after_hit": after_hit,
        "after_total": after_total,
        "before_prop": p_before,
        "after_prop": p_after,
        "diff_pct_points": (p_after - p_before) * 100,
        "relative_risk": rr,
        "rr_low": rr_low,
        "rr_high": rr_high,
        "odds_ratio": odds_ratio,
        "or_low": or_low,
        "or_high": or_high,
        "two_prop_p": two_prop_p,
        "fisher_p": fisher_p,
    }


def wilson_interval(successes: int, total: int, z: float = 1.96) -> tuple[float, float]:
    if total == 0:
        return 0.0, 0.0
    p = successes / total
    denom = 1 + z * z / total
    center = (p + z * z / (2 * total)) / denom
    half = z * math.sqrt((p * (1 - p) / total) + (z * z / (4 * total * total))) / denom
    return max(0.0, center - half), min(1.0, center + half)


def target_hits(row: YearRow, target: str) -> int:
    if target == "all_collision":
        return row.all_collision
    return row.full_test_counts().get(target, row.causes.get(target, 0))


def log_relative_risk(before_hit: int, before_total: int, after_hit: int, after_total: int) -> float:
    before_prop = (before_hit + 0.5) / (before_total + 1.0)
    after_prop = (after_hit + 0.5) / (after_total + 1.0)
    return math.log(after_prop / before_prop)


def permutation_cutoff_scan_p(rows: list[YearRow], target: str, observed_max_log_rr: float, cutoffs: list[int]) -> float:
    """Monte Carlo p-value for searching across many cutoff years.

    Annual fatality totals stay fixed. The observed number of target-cause
    fatalities is randomly placed among all fatality slots. Each simulation
    records the largest positive log relative-risk found across the same cutoff
    set. This is a one-sided scan for post-cutoff overrepresentation.
    """
    rng = random.Random(RANDOM_SEED)
    totals = [r.total for r in rows]
    cumulative = []
    running = 0
    for total in totals:
        running += total
        cumulative.append(running)
    grand_total = running
    total_hits = sum(target_hits(r, target) for r in rows)
    cutoff_splits = [sum(1 for r in rows if r.year < cutoff) for cutoff in cutoffs]
    prefix_totals = [0]
    for total in totals:
        prefix_totals.append(prefix_totals[-1] + total)
    exceed = 0
    for _ in range(PERMUTATIONS):
        slots = sorted(rng.sample(range(grand_total), total_hits))
        counts_by_year = []
        idx = 0
        prev = 0
        for stop in cumulative:
            count = 0
            while idx < len(slots) and slots[idx] < stop:
                if slots[idx] >= prev:
                    count += 1
                idx += 1
            counts_by_year.append(count)
            prev = stop
        prefix_hits = [0]
        for count in counts_by_year:
            prefix_hits.append(prefix_hits[-1] + count)
        max_log_rr = -math.inf
        for split in cutoff_splits:
            before_hit = prefix_hits[split]
            after_hit = total_hits - before_hit
            before_total = prefix_totals[split]
            after_total = grand_total - before_total
            max_log_rr = max(max_log_rr, log_relative_risk(before_hit, before_total, after_hit, after_total))
        if max_log_rr >= observed_max_log_rr - 1e-15:
            exceed += 1
    return (exceed + 1) / (PERMUTATIONS + 1)


def aggregate(rows: list[YearRow], start: int, end: int) -> dict[str, int]:
    subset = [r for r in rows if start <= r.year <= end]
    totals = {c: 0 for c in DISPLAY_CAUSES + ["unknown", "total"]}
    for r in subset:
        f = r.full_test_counts()
        for c in FULL_TEST_CAUSES:
            totals[c] = totals.get(c, 0) + f[c]
        totals["all_collision"] += r.all_collision
        totals["unknown"] += r.unknown
        totals["total"] += r.total
    return totals


def chi_square_full(rows: list[YearRow], cutoff: int) -> tuple[float, int, float, list[dict[str, float]]]:
    before = [r for r in rows if r.year < cutoff]
    after = [r for r in rows if r.year >= cutoff]
    before_counts = {c: sum(r.full_test_counts()[c] for r in before) for c in FULL_TEST_CAUSES}
    after_counts = {c: sum(r.full_test_counts()[c] for r in after) for c in FULL_TEST_CAUSES}
    row_totals = [sum(before_counts.values()), sum(after_counts.values())]
    col_totals = {c: before_counts[c] + after_counts[c] for c in FULL_TEST_CAUSES}
    grand = sum(row_totals)
    stat = 0.0
    residuals = []
    for period, counts, row_total in [("before", before_counts, row_totals[0]), ("after", after_counts, row_totals[1])]:
        for c in FULL_TEST_CAUSES:
            expected = row_total * col_totals[c] / grand if grand else 0.0
            observed = counts[c]
            resid = (observed - expected) / math.sqrt(expected) if expected > 0 else 0.0
            stat += ((observed - expected) ** 2 / expected) if expected > 0 else 0.0
            residuals.append({"period": period, "cause": c, "observed": observed, "expected": expected, "std_residual": resid})
    df = (2 - 1) * (len(FULL_TEST_CAUSES) - 1)
    return stat, df, chi_square_pvalue(stat, df), residuals


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)


def fmt_pct(x: float) -> str:
    return f"{100*x:.1f}%"


def fmt_float(x: float, digits: int = 3) -> str:
    if isinstance(x, float) and (math.isnan(x) or math.isinf(x)):
        return "NA" if math.isnan(x) else "inf"
    return f"{x:.{digits}f}"


def svg_line_chart(rows: list[YearRow], cutoff_for_marker: int, path: Path) -> None:
    width, height = 1200, 720
    ml, mr, mt, mb = 80, 30, 55, 105
    plot_w, plot_h = width - ml - mr, height - mt - mb
    years = [r.year for r in rows]
    min_year, max_year = min(years), max(years)
    max_y = 0.55

    def x(year: int) -> float:
        return ml + (year - min_year) / (max_year - min_year) * plot_w

    def y(prop: float) -> float:
        return mt + (max_y - prop) / max_y * plot_h

    series = [
        ("canopy collisions", "#d44d5c", [r.causes["canopy_collision"] / r.total for r in rows]),
        ("all collisions", "#5b8def", [r.all_collision / r.total for r in rows]),
        ("landings", "#f0a202", [r.causes["landing"] / r.total for r in rows]),
        ("malfunctions", "#2a9d8f", [r.causes["malfunction"] / r.total for r in rows]),
    ]

    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">']
    parts.append('<rect width="100%" height="100%" fill="#111827"/>')
    parts.append('<text x="80" y="32" fill="#f9fafb" font-family="Arial" font-size="24" font-weight="700">USPA fatality-cause shares by year</text>')
    parts.append('<text x="80" y="55" fill="#cbd5e1" font-family="Arial" font-size="13">Collision shares are proportions of all fatalities, not raw counts. Dashed line marks the 2010 cutoff.</text>')

    # Grid and y-axis labels.
    for pct in [0, 0.1, 0.2, 0.3, 0.4, 0.5]:
        yy = y(pct)
        parts.append(f'<line x1="{ml}" x2="{width-mr}" y1="{yy:.1f}" y2="{yy:.1f}" stroke="#334155" stroke-width="1"/>')
        parts.append(f'<text x="{ml-12}" y="{yy+4:.1f}" text-anchor="end" fill="#cbd5e1" font-family="Arial" font-size="12">{int(pct*100)}%</text>')
    # x-axis labels.
    for yr in years:
        if yr % 2 == 1 or yr in (min_year, max_year):
            xx = x(yr)
            parts.append(f'<text transform="translate({xx:.1f},{height-65}) rotate(45)" fill="#cbd5e1" font-family="Arial" font-size="11">{yr}</text>')
    parts.append(f'<line x1="{ml}" x2="{width-mr}" y1="{height-mb}" y2="{height-mb}" stroke="#94a3b8"/>')
    parts.append(f'<line x1="{ml}" x2="{ml}" y1="{mt}" y2="{height-mb}" stroke="#94a3b8"/>')
    cx = x(cutoff_for_marker)
    parts.append(f'<line x1="{cx:.1f}" x2="{cx:.1f}" y1="{mt}" y2="{height-mb}" stroke="#f8fafc" stroke-dasharray="6,6" opacity="0.75"/>')
    parts.append(f'<text x="{cx+8:.1f}" y="{mt+18}" fill="#f8fafc" font-family="Arial" font-size="12">{cutoff_for_marker} cutoff</text>')

    for name, color, values in series:
        pts = " ".join(f"{x(yr):.1f},{y(val):.1f}" for yr, val in zip(years, values))
        parts.append(f'<polyline fill="none" stroke="{color}" stroke-width="3" points="{pts}"/>')
        for yr, val in zip(years, values):
            parts.append(f'<circle cx="{x(yr):.1f}" cy="{y(val):.1f}" r="3.2" fill="{color}"/>')
    # Legend.
    lx, ly = 85, height - 35
    for i, (name, color, _) in enumerate(series):
        x0 = lx + i * 245
        parts.append(f'<line x1="{x0}" x2="{x0+30}" y1="{ly}" y2="{ly}" stroke="{color}" stroke-width="4"/>')
        parts.append(f'<text x="{x0+38}" y="{ly+4}" fill="#e5e7eb" font-family="Arial" font-size="14">{html.escape(name)}</text>')
    parts.append('</svg>')
    path.write_text("\n".join(parts))


def svg_canopy_ci_chart(rows: list[YearRow], path: Path) -> None:
    width, height = 1200, 720
    ml, mr, mt, mb = 80, 35, 60, 105
    plot_w, plot_h = width - ml - mr, height - mt - mb
    years = [r.year for r in rows]
    min_year, max_year = min(years), max(years)
    max_y = 0.36

    def x(year: int) -> float:
        return ml + (year - min_year) / (max_year - min_year) * plot_w

    def y(prop: float) -> float:
        return mt + (max_y - prop) / max_y * plot_h

    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">']
    parts.append('<rect width="100%" height="100%" fill="#111827"/>')
    parts.append('<text x="80" y="32" fill="#f9fafb" font-family="Arial" font-size="24" font-weight="700">Annual canopy-collision fatality share with 95% Wilson intervals</text>')
    parts.append('<text x="80" y="55" fill="#cbd5e1" font-family="Arial" font-size="13">Intervals are wide because yearly fatality counts are small; interpret individual-year spikes cautiously.</text>')
    for pct in [0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35]:
        yy = y(pct)
        parts.append(f'<line x1="{ml}" x2="{width-mr}" y1="{yy:.1f}" y2="{yy:.1f}" stroke="#334155" stroke-width="1"/>')
        parts.append(f'<text x="{ml-12}" y="{yy+4:.1f}" text-anchor="end" fill="#cbd5e1" font-family="Arial" font-size="12">{int(pct*100)}%</text>')
    for yr in years:
        xx = x(yr)
        if yr % 2 == 1 or yr in (min_year, max_year):
            parts.append(f'<text transform="translate({xx:.1f},{height-65}) rotate(45)" fill="#cbd5e1" font-family="Arial" font-size="11">{yr}</text>')
    for cutoff, label, color in [(2004, "2004 fast/slow-order change candidate", "#93c5fd"), (2007, "2007 scan-selected cutoff", "#f8fafc"), (2010, "2010 definitely-adopted candidate", "#fca5a5")]:
        xx = x(cutoff)
        parts.append(f'<line x1="{xx:.1f}" x2="{xx:.1f}" y1="{mt}" y2="{height-mb}" stroke="{color}" stroke-dasharray="6,6" opacity="0.75"/>')
        parts.append(f'<text transform="translate({xx+7:.1f},{mt+16}) rotate(90)" fill="{color}" font-family="Arial" font-size="11">{html.escape(label)}</text>')
    parts.append(f'<line x1="{ml}" x2="{width-mr}" y1="{height-mb}" y2="{height-mb}" stroke="#94a3b8"/>')
    parts.append(f'<line x1="{ml}" x2="{ml}" y1="{mt}" y2="{height-mb}" stroke="#94a3b8"/>')

    points = []
    for r in rows:
        k = r.causes["canopy_collision"]
        prop = k / r.total
        low, high = wilson_interval(k, r.total)
        xx = x(r.year)
        points.append(f"{xx:.1f},{y(prop):.1f}")
        parts.append(f'<line x1="{xx:.1f}" x2="{xx:.1f}" y1="{y(low):.1f}" y2="{y(high):.1f}" stroke="#fb7185" stroke-width="2" opacity="0.7"/>')
        parts.append(f'<line x1="{xx-5:.1f}" x2="{xx+5:.1f}" y1="{y(low):.1f}" y2="{y(low):.1f}" stroke="#fb7185" stroke-width="2" opacity="0.7"/>')
        parts.append(f'<line x1="{xx-5:.1f}" x2="{xx+5:.1f}" y1="{y(high):.1f}" y2="{y(high):.1f}" stroke="#fb7185" stroke-width="2" opacity="0.7"/>')
        parts.append(f'<circle cx="{xx:.1f}" cy="{y(prop):.1f}" r="4" fill="#e11d48"/>')
        parts.append(f'<title>{r.year}: {k}/{r.total} = {prop:.1%} (95% CI {low:.1%}-{high:.1%})</title>')
    parts.append(f'<polyline fill="none" stroke="#e11d48" stroke-width="3" points="{" ".join(points)}"/>')
    parts.append('</svg>')
    path.write_text("\n".join(parts))


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows = load_rows()
    min_year, max_year = rows[0].year, rows[-1].year

    yearly_rows = []
    for r in rows:
        f = r.full_test_counts()
        record = {"year": r.year, "total_fatalities": r.total, "unknown_primary_count": r.unknown}
        for c in DISPLAY_CAUSES:
            val = r.all_collision if c == "all_collision" else f.get(c, r.causes.get(c, 0))
            record[f"{c}_count"] = val
            record[f"{c}_pct"] = val / r.total if r.total else 0
            if c == "canopy_collision":
                low, high = wilson_interval(int(val), r.total)
                record["canopy_collision_ci95_low"] = low
                record["canopy_collision_ci95_high"] = high
        yearly_rows.append(record)
    yearly_fields = ["year", "total_fatalities", "unknown_primary_count"]
    for c in DISPLAY_CAUSES:
        yearly_fields += [f"{c}_count", f"{c}_pct"]
        if c == "canopy_collision":
            yearly_fields += ["canopy_collision_ci95_low", "canopy_collision_ci95_high"]
    write_csv(OUT_DIR / "yearly-cause-shares.csv", yearly_fields, yearly_rows)

    cutoff_rows = []
    all_residuals = []
    cutoffs = list(range(min_year + 2, max_year - 1))
    for cutoff in cutoffs:
        stat, df, pval, residuals = chi_square_full(rows, cutoff)
        for target in ["canopy_collision", "all_collision", "freefall_collision", "landing"]:
            before = [r for r in rows if r.year < cutoff]
            after = [r for r in rows if r.year >= cutoff]
            b_hit = sum(target_hits(r, target) for r in before)
            a_hit = sum(target_hits(r, target) for r in after)
            b_total = sum(r.total for r in before)
            a_total = sum(r.total for r in after)
            stats = two_by_two_stats(b_hit, b_total, a_hit, a_total)
            cutoff_rows.append({
                "cutoff_year_after_ge": cutoff,
                "target": target,
                "before_years": f"{min_year}-{cutoff-1}",
                "after_years": f"{cutoff}-{max_year}",
                "before_hit": b_hit,
                "before_total": b_total,
                "before_prop": stats["before_prop"],
                "after_hit": a_hit,
                "after_total": a_total,
                "after_prop": stats["after_prop"],
                "diff_pct_points": stats["diff_pct_points"],
                "relative_risk": stats["relative_risk"],
                "rr_low": stats["rr_low"],
                "rr_high": stats["rr_high"],
                "odds_ratio": stats["odds_ratio"],
                "or_low": stats["or_low"],
                "or_high": stats["or_high"],
                "fisher_p": stats["fisher_p"],
                "two_prop_p": stats["two_prop_p"],
                "full_distribution_chi2": stat,
                "full_distribution_df": df,
                "full_distribution_p": pval,
            })
        for res in residuals:
            all_residuals.append({"cutoff_year_after_ge": cutoff, **res})

    cutoff_fields = list(cutoff_rows[0].keys())
    write_csv(OUT_DIR / "cutoff-scan.csv", cutoff_fields, cutoff_rows)
    write_csv(OUT_DIR / "standardized-residuals.csv", list(all_residuals[0].keys()), all_residuals)

    cutoff = 2010
    stat, df, pval, residuals_2010 = chi_square_full(rows, cutoff)
    residuals_2010 = sorted(residuals_2010, key=lambda r: (r["period"], -abs(r["std_residual"])))
    write_csv(OUT_DIR / "residuals-cutoff-2010.csv", list(residuals_2010[0].keys()), residuals_2010)

    prepost_rows = []
    for target in ["canopy_collision", "all_collision", "freefall_collision", "landing", "malfunction", "no_pull_or_low_pull"]:
        before = [r for r in rows if r.year < cutoff]
        after = [r for r in rows if r.year >= cutoff]
        b_hit = sum(target_hits(r, target) for r in before)
        a_hit = sum(target_hits(r, target) for r in after)
        stats = two_by_two_stats(b_hit, sum(r.total for r in before), a_hit, sum(r.total for r in after))
        prepost_rows.append({"target": target, **stats})
    write_csv(OUT_DIR / "prepost-2010-target-tests.csv", list(prepost_rows[0].keys()), prepost_rows)

    # Exploratory best cutoffs for canopy/all collisions using Fisher p-value.
    best_canopy = min((r for r in cutoff_rows if r["target"] == "canopy_collision"), key=lambda r: r["fisher_p"])
    best_all = min((r for r in cutoff_rows if r["target"] == "all_collision"), key=lambda r: r["fisher_p"])
    canopy_2004 = next(r for r in cutoff_rows if r["target"] == "canopy_collision" and r["cutoff_year_after_ge"] == 2004)
    canopy_2007 = next(r for r in cutoff_rows if r["target"] == "canopy_collision" and r["cutoff_year_after_ge"] == 2007)
    canopy_2010 = next(r for r in cutoff_rows if r["target"] == "canopy_collision" and r["cutoff_year_after_ge"] == 2010)
    n_cutoffs = len(cutoffs)
    observed_canopy_scan_log_rr = max(log_relative_risk(int(r["before_hit"]), int(r["before_total"]), int(r["after_hit"]), int(r["after_total"])) for r in cutoff_rows if r["target"] == "canopy_collision")
    canopy_perm_p = permutation_cutoff_scan_p(rows, "canopy_collision", observed_canopy_scan_log_rr, cutoffs)
    canopy_scan_summary = []
    for label, row in [("candidate_2004", canopy_2004), ("scan_best_2007", canopy_2007), ("candidate_2010", canopy_2010)]:
        canopy_scan_summary.append({
            "label": label,
            "cutoff_year_after_ge": row["cutoff_year_after_ge"],
            "before_years": row["before_years"],
            "after_years": row["after_years"],
            "before_hit": row["before_hit"],
            "before_total": row["before_total"],
            "before_prop": row["before_prop"],
            "after_hit": row["after_hit"],
            "after_total": row["after_total"],
            "after_prop": row["after_prop"],
            "diff_pct_points": row["diff_pct_points"],
            "relative_risk": row["relative_risk"],
            "rr_low": row["rr_low"],
            "rr_high": row["rr_high"],
            "odds_ratio": row["odds_ratio"],
            "or_low": row["or_low"],
            "or_high": row["or_high"],
            "fisher_p": row["fisher_p"],
            "bonferroni_p_across_cutoffs": min(1.0, float(row["fisher_p"]) * n_cutoffs),
            "permutation_scan_p": canopy_perm_p if row is best_canopy or label == "scan_best_2007" else "",
            "permutations": PERMUTATIONS if row is best_canopy or label == "scan_best_2007" else "",
        })
    write_csv(OUT_DIR / "canopy-cutoff-summary.csv", list(canopy_scan_summary[0].keys()), canopy_scan_summary)

    svg_line_chart(rows, 2010, OUT_DIR / "fatality-cause-shares.svg")
    svg_canopy_ci_chart(rows, OUT_DIR / "canopy-collision-share-ci.svg")

    # Markdown report.
    unknown_years = [r.year for r in rows if r.unknown]
    lines = []
    lines.append("# USPA fatality cause trend analysis")
    lines.append("")
    lines.append(f"Input: `{INPUT.relative_to(ROOT)}`")
    lines.append(f"Years analyzed: {min_year}-{max_year} ({len(rows)} annual rows).")
    lines.append("")
    lines.append("## Scope and caveats")
    lines.append("")
    lines.append("This analysis compares each cause as a share of all fatalities, not raw counts. The full-distribution chi-square test uses grouped primary categories: landing, malfunction, no pull/low pull, reserve problem, canopy collision, freefall collision, medical, and other/rare/unknown.")
    if unknown_years:
        lines.append(f"Some recent web-parsed rows have unresolved primary causes, so an `other_rare_or_unknown` bucket is included. Rows with unresolved counts: {', '.join(map(str, unknown_years))}.")
    lines.append("Cutoff scans evaluate every eligible before/after split from 2001 through 2023. The report includes both Bonferroni and permutation adjustments for the canopy-collision cutoff search.")
    lines.append("")
    lines.append("## 2010 pre/post test")
    lines.append("")
    lines.append(f"Full cause-distribution chi-square for before 2010 vs 2010-and-later: chi-square={stat:.3f}, df={df}, p={pval:.4f}.")
    lines.append("")
    lines.append("| Target | Before count / total | Before share | After count / total | After share | Δ pct pts | RR (95% CI) | OR (95% CI) | Fisher p |")
    lines.append("|---|---:|---:|---:|---:|---:|---:|---:|---:|")
    for r in prepost_rows:
        lines.append(
            f"| {r['target']} | {r['before_hit']}/{r['before_total']} | {fmt_pct(r['before_prop'])} | "
            f"{r['after_hit']}/{r['after_total']} | {fmt_pct(r['after_prop'])} | {r['diff_pct_points']:.1f} | "
            f"{fmt_float(r['relative_risk'],2)} ({fmt_float(r['rr_low'],2)}-{fmt_float(r['rr_high'],2)}) | "
            f"{fmt_float(r['odds_ratio'],2)} ({fmt_float(r['or_low'],2)}-{fmt_float(r['or_high'],2)}) | {fmt_float(r['fisher_p'],4)} |"
        )
    lines.append("")
    lines.append("### Largest 2010 standardized residuals")
    lines.append("")
    lines.append("| Period | Cause | Observed | Expected | Std residual |")
    lines.append("|---|---|---:|---:|---:|")
    for r in sorted(residuals_2010, key=lambda x: -abs(x["std_residual"]))[:12]:
        lines.append(f"| {r['period']} | {r['cause']} | {r['observed']} | {r['expected']:.1f} | {r['std_residual']:.2f} |")
    lines.append("")
    lines.append("## Exploratory cutoff scan")
    lines.append("")
    lines.append(f"Best canopy-collision cutoff by uncorrected Fisher p: {best_canopy['cutoff_year_after_ge']} (before {fmt_pct(best_canopy['before_prop'])}, after {fmt_pct(best_canopy['after_prop'])}, Fisher p={best_canopy['fisher_p']:.4f}).")
    lines.append(f"Best all-collision cutoff by uncorrected Fisher p: {best_all['cutoff_year_after_ge']} (before {fmt_pct(best_all['before_prop'])}, after {fmt_pct(best_all['after_prop'])}, Fisher p={best_all['fisher_p']:.4f}).")
    lines.append("")
    lines.append("### Canopy-collision cutoff details")
    lines.append("")
    lines.append("| Cutoff | Before | Before share | After | After share | Δ pct pts | RR (95% CI) | Fisher p | Bonferroni p | Permutation scan p |")
    lines.append("|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
    for r in canopy_scan_summary:
        perm = r["permutation_scan_p"]
        perm_text = "" if perm == "" else fmt_float(float(perm), 4)
        lines.append(
            f"| {r['cutoff_year_after_ge']} | {r['before_hit']}/{r['before_total']} | {fmt_pct(float(r['before_prop']))} | "
            f"{r['after_hit']}/{r['after_total']} | {fmt_pct(float(r['after_prop']))} | {float(r['diff_pct_points']):.1f} | "
            f"{fmt_float(float(r['relative_risk']),2)} ({fmt_float(float(r['rr_low']),2)}-{fmt_float(float(r['rr_high']),2)}) | "
            f"{fmt_float(float(r['fisher_p']),4)} | {fmt_float(float(r['bonferroni_p_across_cutoffs']),4)} | {perm_text} |"
        )
    lines.append("")
    lines.append(f"For the scan-selected 2007 cutoff, canopy collisions represented {fmt_pct(float(canopy_2007['before_prop']))} of fatalities before 2007 and {fmt_pct(float(canopy_2007['after_prop']))} from 2007 onward, RR={float(canopy_2007['relative_risk']):.2f} (95% CI {float(canopy_2007['rr_low']):.2f}-{float(canopy_2007['rr_high']):.2f}). The uncorrected Fisher p-value is {float(canopy_2007['fisher_p']):.4g}; Bonferroni across {n_cutoffs} cutoffs gives p={min(1.0, float(canopy_2007['fisher_p']) * n_cutoffs):.4g}; the permutation p-value for the largest positive relative-risk scan across cutoffs is {canopy_perm_p:.4g} using {PERMUTATIONS:,} simulations.")
    lines.append("The 2004 candidate also points upward but is weaker after accounting for the cutoff search. This is compatible with a gradual operational change between roughly 2004 and 2010 rather than a single clean step change in 2007.")
    lines.append("")
    lines.append("## Generated artifacts")
    lines.append("")
    for name in [
        "yearly-cause-shares.csv",
        "prepost-2010-target-tests.csv",
        "cutoff-scan.csv",
        "standardized-residuals.csv",
        "residuals-cutoff-2010.csv",
        "canopy-cutoff-summary.csv",
        "fatality-cause-shares.svg",
        "canopy-collision-share-ci.svg",
    ]:
        lines.append(f"- `{(OUT_DIR / name).relative_to(ROOT)}`")
    lines.append("")
    (OUT_DIR / "README.md").write_text("\n".join(lines) + "\n")

    print(f"Wrote analysis artifacts under {OUT_DIR.relative_to(ROOT)}")
    print(f"2010 full chi-square p={pval:.4f}")
    for r in prepost_rows[:2]:
        print(f"{r['target']}: before {r['before_hit']}/{r['before_total']} ({fmt_pct(r['before_prop'])}), after {r['after_hit']}/{r['after_total']} ({fmt_pct(r['after_prop'])}), Fisher p={r['fisher_p']:.4f}, RR={r['relative_risk']:.2f}")
    print(f"Best canopy cutoff: {best_canopy['cutoff_year_after_ge']} p={best_canopy['fisher_p']:.4f}")
    print(f"Best canopy cutoff adjusted: Bonferroni p={min(1.0, float(best_canopy['fisher_p']) * n_cutoffs):.4f}, permutation p={canopy_perm_p:.4f} ({PERMUTATIONS} sims)")
    print(f"Best all-collision cutoff: {best_all['cutoff_year_after_ge']} p={best_all['fisher_p']:.4f}")


if __name__ == "__main__":
    main()
