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

## Japanese vocabulary data

The Japanese vocabulary bank in `src/data/japanese-vocabulary.json` is generated from:

- **OpenJLPT** by Evan Clancy and contributors
  - Source: https://github.com/evanclan/OpenJLPT
  - License: Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0)
- **Japanese-Chinese-thesaurus** by lxl66566
  - Source: https://github.com/lxl66566/Japanese-Chinese-thesaurus
  - License: The Unlicense
- **opencc-js** by nk2028 and contributors, used during generation to convert Simplified Chinese definitions to Traditional Chinese
  - Source: https://github.com/nk2028/opencc-js
  - License: MIT

Changes made for Wordshire:

- Matched Japanese words to Traditional Chinese definitions.
- Sorted and evenly sampled the vocabulary from JLPT N5 through N1.
- Included kana readings where the spelling does not already provide them.
- Removed duplicate words, duplicate answers, unusable definitions, and sensitive terms.
- Reduced the resulting dataset to 2,000 entries.

The generated Japanese vocabulary data is available under CC BY-SA 4.0. Application source code is not relicensed by this notice.
