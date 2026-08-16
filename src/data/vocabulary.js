import vocabularyData from './vocabulary.json' with { type: 'json' }
import japaneseVocabularyData from './japanese-vocabulary.json' with { type: 'json' }

export const vocabulary = vocabularyData
export const japaneseVocabulary = japaneseVocabularyData

const ENGLISH_DIFFICULTY_FLOOR = 0.15

function seededRandom(seed) {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let result = value
    result = Math.imul(result ^ result >>> 15, result | 1)
    result ^= result + Math.imul(result ^ result >>> 7, result | 61)
    return ((result ^ result >>> 14) >>> 0) / 4294967296
  }
}

function shuffle(items, random) {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function createLevelQuiz(level, count = 10, language = 'english') {
  const sourceVocabulary = language === 'japanese' ? japaneseVocabulary : vocabulary
  const safeLevel = Math.min(999, Math.max(1, level))
  const languageSeed = language === 'japanese' ? 32452843 : 104729
  const random = seededRandom(safeLevel * 7919 + languageSeed)
  const difficultyProgress = (safeLevel - 1) / 998
  const adjustedProgress = language === 'english'
    ? ENGLISH_DIFFICULTY_FLOOR + difficultyProgress * (1 - ENGLISH_DIFFICULTY_FLOOR)
    : difficultyProgress
  const poolSize = 100
  const maxPoolStart = sourceVocabulary.length - poolSize
  const poolStart = Math.round(adjustedProgress * maxPoolStart)
  const difficultyPool = sourceVocabulary.slice(poolStart, poolStart + poolSize)
  const selected = shuffle(difficultyPool, random).slice(0, count)

  return selected.map((entry) => {
    const sameBand = sourceVocabulary.filter((item) => item.band === entry.band && item.id !== entry.id && item.meaning !== entry.meaning)
    const fallback = sourceVocabulary.filter((item) => item.id !== entry.id && item.meaning !== entry.meaning)
    const distractors = shuffle(sameBand, random).slice(0, 2)
    while (distractors.length < 2) {
      const candidate = fallback[Math.floor(random() * fallback.length)]
      if (!distractors.some((item) => item.meaning === candidate.meaning)) distractors.push(candidate)
    }

    const reading = entry.reading && entry.reading !== entry.word ? `（${entry.reading}）` : ''
    return {
      id: entry.id,
      word: entry.word,
      reading: entry.reading ?? '',
      rank: entry.rank,
      level: entry.level,
      prompt: `「${entry.word}${reading}」的中文意思是？`,
      choices: shuffle([entry.meaning, ...distractors.map((item) => item.meaning)], random),
      answer: entry.meaning,
      note: `${entry.word}${reading} 的意思是「${entry.meaning}」。`,
    }
  })
}
