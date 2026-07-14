# USPA fatality cause trend analysis

Input: `data/uspa-fatality-summary.csv`
Years analyzed: 1999-2025 (27 annual rows).

## Scope and caveats

This analysis compares each cause as a share of all fatalities, not raw counts. The full-distribution chi-square test uses grouped primary categories: landing, malfunction, no pull/low pull, reserve problem, canopy collision, freefall collision, medical, and other/rare/unknown.
Some recent web-parsed rows have unresolved primary causes, so an `other_rare_or_unknown` bucket is included. Rows with unresolved counts: 2018, 2019, 2020, 2021, 2022, 2023.
Cutoff scans evaluate every eligible before/after split from 2001 through 2023. The report includes both Bonferroni and permutation adjustments for the canopy-collision cutoff search.

## 2010 pre/post test

Full cause-distribution chi-square for before 2010 vs 2010-and-later: chi-square=46.761, df=7, p=0.0000.

| Target | Before count / total | Before share | After count / total | After share | Δ pct pts | RR (95% CI) | OR (95% CI) | Fisher p |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| canopy_collision | 19/285 | 6.7% | 23/283 | 8.1% | 1.5 | 1.22 (0.68-2.19) | 1.24 (0.66-2.30) | 0.5255 |
| all_collision | 44/285 | 15.4% | 38/283 | 13.4% | -2.0 | 0.87 (0.58-1.30) | 0.85 (0.53-1.36) | 0.5510 |
| freefall_collision | 25/285 | 8.8% | 15/283 | 5.3% | -3.5 | 0.60 (0.33-1.12) | 0.58 (0.31-1.13) | 0.1392 |
| landing | 97/285 | 34.0% | 100/283 | 35.3% | 1.3 | 1.04 (0.83-1.30) | 1.06 (0.75-1.49) | 0.7915 |
| malfunction | 54/285 | 18.9% | 50/283 | 17.7% | -1.3 | 0.93 (0.66-1.32) | 0.92 (0.60-1.40) | 0.7451 |
| no_pull_or_low_pull | 34/285 | 11.9% | 21/283 | 7.4% | -4.5 | 0.62 (0.37-1.04) | 0.59 (0.34-1.05) | 0.0880 |

### Largest 2010 standardized residuals

| Period | Cause | Observed | Expected | Std residual |
|---|---|---:|---:|---:|
| after | other_rare_or_unknown | 43 | 26.9 | 3.10 |
| before | other_rare_or_unknown | 11 | 27.1 | -3.09 |
| after | reserve_problem | 9 | 22.4 | -2.83 |
| before | reserve_problem | 36 | 22.6 | 2.82 |
| after | medical | 22 | 15.4 | 1.67 |
| before | medical | 9 | 15.6 | -1.66 |
| after | no_pull_or_low_pull | 21 | 27.4 | -1.22 |
| before | no_pull_or_low_pull | 34 | 27.6 | 1.22 |
| after | freefall_collision | 15 | 19.9 | -1.10 |
| before | freefall_collision | 25 | 20.1 | 1.10 |
| after | canopy_collision | 23 | 20.9 | 0.45 |
| before | canopy_collision | 19 | 21.1 | -0.45 |

## Exploratory cutoff scan

Best canopy-collision cutoff by uncorrected Fisher p: 2007 (before 2.3%, after 10.7%, Fisher p=0.0001).
Best all-collision cutoff by uncorrected Fisher p: 2018 (before 16.4%, after 5.8%, Fisher p=0.0049).

### Canopy-collision cutoff details

| Cutoff | Before | Before share | After | After share | Δ pct pts | RR (95% CI) | Fisher p | Bonferroni p | Permutation scan p |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2004 | 5/152 | 3.3% | 37/416 | 8.9% | 5.6 | 2.70 (1.08-6.75) | 0.0283 | 0.6507 |  |
| 2007 | 5/221 | 2.3% | 37/347 | 10.7% | 8.4 | 4.71 (1.88-11.81) | 0.0001 | 0.0025 | 0.0118 |
| 2010 | 19/285 | 6.7% | 23/283 | 8.1% | 1.5 | 1.22 (0.68-2.19) | 0.5255 | 1.0000 |  |

For the scan-selected 2007 cutoff, canopy collisions represented 2.3% of fatalities before 2007 and 10.7% from 2007 onward, RR=4.71 (95% CI 1.88-11.81). The uncorrected Fisher p-value is 0.0001083; Bonferroni across 23 cutoffs gives p=0.002492; the permutation p-value for the largest positive relative-risk scan across cutoffs is 0.01185 using 20,000 simulations.
The 2004 candidate also points upward but is weaker after accounting for the cutoff search. This is compatible with a gradual operational change between roughly 2004 and 2010 rather than a single clean step change in 2007.

## Generated artifacts

- `data/fatality-cause-analysis/yearly-cause-shares.csv`
- `data/fatality-cause-analysis/prepost-2010-target-tests.csv`
- `data/fatality-cause-analysis/cutoff-scan.csv`
- `data/fatality-cause-analysis/standardized-residuals.csv`
- `data/fatality-cause-analysis/residuals-cutoff-2010.csv`
- `data/fatality-cause-analysis/canopy-cutoff-summary.csv`
- `data/fatality-cause-analysis/fatality-cause-shares.svg`
- `data/fatality-cause-analysis/canopy-collision-share-ci.svg`

