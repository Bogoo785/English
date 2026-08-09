import { mkdir, writeFile } from 'node:fs/promises'

const SOURCE_URL = 'https://huggingface.co/datasets/kknono668/toeic-vocab-tw/resolve/main/data/toeic_vocabulary.json'
const TARGET_SIZE = 2000
const scoreDifficulty = { '0-400': 0, '400-600': 1, '600-780': 2, '780-900': 3 }
const blockedWords = new Set([
  'abortion', 'adult', 'ass', 'bitch', 'cock', 'dick', 'fetish', 'fuck', 'naked', 'nude',
  'porn', 'porno', 'pornography', 'sex', 'sexual', 'sexy', 'shit', 'slut', 'xxx',
])
const blockedDefinitionPatterns = /(人名|姓氏|地名|城市名|州名|國名|公司名稱|品牌名稱)/

function isPluralForm(word, allWords) {
  if (word.endsWith('ies') && allWords.has(`${word.slice(0, -3)}y`)) return true
  if (word.endsWith('ves') && (allWords.has(`${word.slice(0, -3)}f`) || allWords.has(`${word.slice(0, -3)}fe`))) return true
  if (word.endsWith('es') && (allWords.has(word.slice(0, -2)) || allWords.has(word.slice(0, -1)))) return true
  return word.endsWith('s') && !word.endsWith('ss') && allWords.has(word.slice(0, -1))
}

function primaryMeaning(definition) {
  return definition
    .split(/[；。，。]/)[0]
    .replace(/[（(].*$/, '')
    .replace(/\s+/g, '')
    .trim()
}

const response = await fetch(SOURCE_URL)
if (!response.ok) throw new Error(`Vocabulary download failed: ${response.status}`)
const source = await response.json()
const allWords = new Set(source.map((entry) => entry.english_word.toLowerCase()))

const candidates = source
  .filter((entry) => {
    const word = entry.english_word
    const definition = entry.chinese_definition
    const wordInParentheses = new RegExp(`\\(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'i')
    return /^[a-z]+(?:-[a-z]+)?$/.test(word)
      && entry.parts_of_speech.length === 1
      && entry.parts_of_speech[0] === 'noun'
      && entry.star_rating >= 2
      && Object.hasOwn(scoreDifficulty, entry.toeic_score_range)
      && /[\u3400-\u9fff]/.test(definition)
      && !blockedWords.has(word)
      && !isPluralForm(word, allWords)
      && !blockedDefinitionPatterns.test(definition)
      && !wordInParentheses.test(definition)
  })
  .map((entry) => ({
    word: entry.english_word,
    meaning: primaryMeaning(entry.chinese_definition),
    category: entry.category,
    scoreRange: entry.toeic_score_range,
    rating: entry.star_rating,
  }))
  .filter((entry) => entry.meaning.length >= 1 && entry.meaning.length <= 16)
  .sort((a, b) => scoreDifficulty[a.scoreRange] - scoreDifficulty[b.scoreRange]
    || b.rating - a.rating
    || a.word.length - b.word.length
    || a.word.localeCompare(b.word))

const vocabulary = []
const seenWords = new Set()
const seenMeanings = new Set()

for (const candidate of candidates) {
  if (vocabulary.length >= TARGET_SIZE) break
  if (seenWords.has(candidate.word) || seenMeanings.has(candidate.meaning)) continue
  seenWords.add(candidate.word)
  seenMeanings.add(candidate.meaning)
  const index = vocabulary.length
  vocabulary.push({
    id: index + 1,
    word: candidate.word,
    meaning: candidate.meaning,
    rank: index + 1,
    level: index < 500 ? 'A1' : index < 1200 ? 'A2' : 'B1',
    band: Math.floor(index / 100) + 1,
    category: candidate.category,
    scoreRange: candidate.scoreRange,
  })
}

if (vocabulary.length < TARGET_SIZE) {
  throw new Error(`Only ${vocabulary.length} valid, unique noun entries were generated`)
}

const report = {
  generatedAt: new Date().toISOString(),
  source: SOURCE_URL,
  sourceRows: source.length,
  strictCandidates: candidates.length,
  outputRows: vocabulary.length,
  uniqueWords: new Set(vocabulary.map((entry) => entry.word)).size,
  uniqueMeanings: new Set(vocabulary.map((entry) => entry.meaning)).size,
  levels: Object.fromEntries(['A1', 'A2', 'B1'].map((level) => [level, vocabulary.filter((entry) => entry.level === level).length])),
  scoreRanges: Object.fromEntries(Object.keys(scoreDifficulty).map((range) => [range, vocabulary.filter((entry) => entry.scoreRange === range).length])),
  checks: {
    allSingleWordNouns: true,
    pluralFormsRemoved: true,
    properNamePatternsRemoved: true,
    duplicateAnswersRemoved: true,
    sensitiveBlocklistApplied: true,
  },
}

await mkdir(new URL('../src/data/', import.meta.url), { recursive: true })
await mkdir(new URL('../reports/', import.meta.url), { recursive: true })
await writeFile(new URL('../src/data/vocabulary.json', import.meta.url), `${JSON.stringify(vocabulary, null, 2)}\n`, 'utf8')
await writeFile(new URL('../reports/vocabulary-quality.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`, 'utf8')

console.log(`Generated ${vocabulary.length} unique Traditional Chinese noun entries from ${source.length} source rows.`)
