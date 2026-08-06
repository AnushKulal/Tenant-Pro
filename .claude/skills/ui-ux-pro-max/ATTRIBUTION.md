# Vendored skill: ui-ux-pro-max

Source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill (v2.13.0, MIT)
Author: NextLevelBuilder

Only the `ui-ux-pro-max` skill was vendored — a self-contained, offline BM25 search
over local CSV design-rule data (styles, palettes, typography, UX guidelines, motion
presets, and a react-native stack). It performs local file reads only: no network,
no subprocess, no secrets access. Verified before install.

The upstream repo also ships six other skills (design, ui-styling, brand,
design-system, slides, banner-design). They were deliberately NOT installed: they
target web/shadcn/Tailwind and logo/slide generation (irrelevant to this React Native
app) and carry a wider surface — subprocess execution, .env reading, and third-party
AI network calls.

Runtime: the search scripts need python3 (standard library only).
