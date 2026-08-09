# Third-party data notices

The noun-only vocabulary bank in `src/data/vocabulary.json` is generated from:

- **toeic-vocab-tw** by kknono668
- Source: https://huggingface.co/datasets/kknono668/toeic-vocab-tw
- License: Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0)

Changes made for Wordshire:

- Kept only entries explicitly tagged as nouns.
- Kept only single English words and hyphenated compounds.
- Removed detected plural forms, proper-name patterns, low-confidence entries, and sensitive terms.
- Normalized definitions for multiple-choice questions.
- Removed duplicate English words and duplicate Chinese answers.
- Sorted entries using the source TOEIC score bands and importance ratings.
- Reduced the resulting dataset to 2,000 Traditional Chinese entries.

The generated vocabulary data remains available under CC BY-SA 4.0. Application source code is not relicensed by this notice.
