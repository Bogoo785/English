import { mkdir, writeFile } from 'node:fs/promises'
import OpenCC from 'opencc-js'

const JLPT_BASE_URL = 'https://raw.githubusercontent.com/evanclan/OpenJLPT/main/data/json/vocab'
const CHINESE_SOURCE_URL = 'https://raw.githubusercontent.com/lxl66566/Japanese-Chinese-thesaurus/main/final.json'
const TARGET_SIZE = 2000
const jlptLevels = ['N5', 'N4', 'N3', 'N2', 'N1']
const toTraditionalChinese = OpenCC.Converter({ from: 'cn', to: 'tw' })
const blockedPatterns = /(性行為|色情|性交|陰莖|陰道|乳房|妓女|賣淫|毒品)/

async function fetchJson(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Vocabulary download failed (${response.status}): ${url}`)
  return response.json()
}

function stripReadingAndTags(definition) {
  return definition
    .replace(/^[（(][^）)]*[）)]\s*/, '')
    .replace(/^[①②③④⑤⑥⑦⑧⑨⑩⓪0-9\s]+/, '')
    .replace(/^【[^】]+】\s*/, '')
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/^(?:名詞|名|副詞|副|自動[123]?|他動[123]?|動詞|動[123]?|ナ形|イ形|形容詞|形容動詞|連體詞|接續詞|代詞|感嘆詞|助詞|助動詞)\s*/, '')
    .split(/[；;。]/)[0]
    .split(/[，,、]/)[0]
    .replace(/[“”"「」『』]/g, '')
    .replace(/\s+/g, '')
    .replace(/冰激凌/g, '冰淇淋')
    .replace(/軟件/g, '軟體')
    .replace(/視頻/g, '影片')
    .replace(/服務器/g, '伺服器')
    .trim()
}

function normalizedReading(entry) {
  if (entry.reading) return entry.reading.trim()
  return /^[ぁ-ゖァ-ヺー]+$/.test(entry.word) ? entry.word : ''
}

const [chineseDictionary, ...jlptGroups] = await Promise.all([
  fetchJson(CHINESE_SOURCE_URL),
  ...jlptLevels.map((level) => fetchJson(`${JLPT_BASE_URL}/${level.toLowerCase()}.json`)),
])

const candidates = jlptGroups.flatMap((entries, levelIndex) => entries.map((entry) => {
  const rawDefinition = chineseDictionary[entry.word?.trim()]
  const meaning = rawDefinition ? stripReadingAndTags(toTraditionalChinese(rawDefinition)) : ''
  return {
    word: entry.word?.trim(),
    reading: normalizedReading(entry),
    meaning,
    level: jlptLevels[levelIndex],
  }
})).filter((entry) => entry.word
  && entry.meaning.length >= 1
  && entry.meaning.length <= 14
  && /[\u3400-\u9fff]/.test(entry.meaning)
  && !blockedPatterns.test(entry.meaning))

const vocabulary = []
const seenWords = new Set()
const seenMeanings = new Set()

for (const level of jlptLevels) {
  const quota = TARGET_SIZE / jlptLevels.length
  let addedForLevel = 0
  for (const candidate of candidates.filter((entry) => entry.level === level)) {
    if (addedForLevel >= quota) break
    if (seenWords.has(candidate.word) || seenMeanings.has(candidate.meaning)) continue
    seenWords.add(candidate.word)
    seenMeanings.add(candidate.meaning)
    const index = vocabulary.length
    vocabulary.push({
      id: index + 1,
      word: candidate.word,
      reading: candidate.reading,
      meaning: candidate.meaning,
      rank: index + 1,
      level: candidate.level,
      band: Math.floor(index / 100) + 1,
    })
    addedForLevel += 1
  }
}

if (vocabulary.length < TARGET_SIZE) {
  throw new Error(`Only ${vocabulary.length} valid, unique Japanese entries were generated`)
}

const report = {
  generatedAt: new Date().toISOString(),
  sources: [JLPT_BASE_URL, CHINESE_SOURCE_URL],
  candidates: candidates.length,
  outputRows: vocabulary.length,
  uniqueWords: new Set(vocabulary.map((entry) => entry.word)).size,
  uniqueMeanings: new Set(vocabulary.map((entry) => entry.meaning)).size,
  entriesWithReading: vocabulary.filter((entry) => entry.reading).length,
  levels: Object.fromEntries(jlptLevels.map((level) => [level, vocabulary.filter((entry) => entry.level === level).length])),
  checks: {
    simplifiedChineseConvertedToTraditional: true,
    duplicateWordsRemoved: true,
    duplicateAnswersRemoved: true,
    sensitiveDefinitionsRemoved: true,
  },
}

await mkdir(new URL('../src/data/', import.meta.url), { recursive: true })
await mkdir(new URL('../reports/', import.meta.url), { recursive: true })
await writeFile(new URL('../src/data/japanese-vocabulary.json', import.meta.url), `${JSON.stringify(vocabulary, null, 2)}\n`, 'utf8')
await writeFile(new URL('../reports/japanese-vocabulary-quality.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`, 'utf8')

console.log(`Generated ${vocabulary.length} unique Traditional Chinese Japanese-vocabulary entries.`)
