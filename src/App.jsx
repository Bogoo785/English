import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { createLevelQuiz } from './data/vocabulary'
import AuthModal from './components/AuthModal'
import { isSupabaseConfigured, supabase } from './lib/supabase'

const buildingTypes = [
  { type: 'bakery', name: '晨光麵包店', english: 'Bakery', emoji: '🥐', partEmoji: '🥖', partsRequired: 3, income: 15, color: '#efb45d' },
  { type: 'cafe', name: '橡樹咖啡館', english: 'Café', emoji: '☕', partEmoji: '🫘', partsRequired: 4, income: 25, color: '#9a6d4a' },
  { type: 'flower', name: '花語小舖', english: 'Flower Shop', emoji: '🌷', partEmoji: '🌱', partsRequired: 3, income: 20, color: '#dd83a2' },
  { type: 'gas', name: '綠野加油站', english: 'Gas Station', emoji: '⛽', partEmoji: '🛢️', partsRequired: 5, income: 35, color: '#e56d5f' },
  { type: 'bookstore', name: '故事書店', english: 'Bookstore', emoji: '📚', partEmoji: '📖', partsRequired: 4, income: 50, color: '#7184b7' },
  { type: 'market', name: '鄉村市場', english: 'Market', emoji: '🧺', partEmoji: '🪵', partsRequired: 5, income: 70, color: '#77a463' },
]

const stocks = [
  { symbol: 'BAKE', name: '晨光食品', icon: '🥐', basePrice: 38, phase: 1.1, color: '#d8902f' },
  { symbol: 'GREEN', name: '綠野能源', icon: '🌿', basePrice: 64, phase: 2.7, color: '#4d9562' },
  { symbol: 'BOOK', name: '故事出版', icon: '📚', basePrice: 92, phase: 4.2, color: '#6478ad' },
  { symbol: 'TOWN', name: '小鎮百貨', icon: '🏬', basePrice: 125, phase: 5.8, color: '#b66f73' },
]

const rewardCycle = buildingTypes.flatMap((building) => Array(building.partsRequired).fill(building.type))
const SKIP_CHALLENGE_LEVELS = 10
const SKIP_CHALLENGE_QUESTIONS = 20

function getPartReward(level) {
  const type = rewardCycle[(level - 1) % rewardCycle.length]
  return buildingTypes.find((building) => building.type === type)
}

function getMarketMove(symbol, tick) {
  let seed = tick * 2654435761
  for (const character of symbol) seed = Math.imul(seed ^ character.charCodeAt(0), 2246822519)
  seed ^= seed >>> 13
  const normalized = (seed >>> 0) / 4294967295
  return (normalized - 0.5) * 0.12
}

function todayKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`)) / 86400000)
}

const defaultGame = {
  dataVersion: 3,
  coins: 500,
  correct: 0,
  questionIndex: 0,
  lessonCompleted: false,
  activeLevel: 1,
  unlockedLevel: 1,
  streakDays: 1,
  lastStudyDate: todayKey(),
  parts: {},
  portfolio: {},
  marketPrices: Object.fromEntries(stocks.map((stock) => [stock.symbol, stock.basePrice])),
  previousMarketPrices: Object.fromEntries(stocks.map((stock) => [stock.symbol, stock.basePrice])),
  marketLastTick: Math.floor(Date.now() / 10000),
  buildings: [],
  lastCollected: Date.now(),
}

function loadGame() {
  try {
    const saved = JSON.parse(localStorage.getItem('wordshire-game'))
    if (saved && saved.dataVersion !== defaultGame.dataVersion) {
      return {
        ...defaultGame,
        ...saved,
        dataVersion: defaultGame.dataVersion,
        correct: 0,
        questionIndex: 0,
        lessonCompleted: false,
        parts: saved.parts ?? {},
        portfolio: saved.portfolio ?? {},
      }
    }
    return saved ? { ...defaultGame, ...saved } : defaultGame
  } catch {
    return defaultGame
  }
}

function normalizeGame(saved) {
  if (!saved || typeof saved !== 'object') return defaultGame
  return {
    ...defaultGame,
    ...saved,
    dataVersion: defaultGame.dataVersion,
    parts: saved.parts ?? {},
    portfolio: saved.portfolio ?? {},
    buildings: saved.buildings ?? [],
  }
}

function cloudGameState(game) {
  const progress = { ...game }
  delete progress.marketPrices
  delete progress.previousMarketPrices
  delete progress.marketLastTick
  return progress
}

function money(value) {
  return Math.floor(value).toLocaleString('zh-TW')
}

function App() {
  const [page, setPage] = useState('learn')
  const [game, setGame] = useState(loadGame)
  const [selected, setSelected] = useState(null)
  const [skipChallenge, setSkipChallenge] = useState({ status: 'idle', questionIndex: 0, correct: 0, targetLevel: null })
  const [quizQuestions, setQuizQuestions] = useState(() => {
    const saved = loadGame()
    return createLevelQuiz(saved.activeLevel, 10)
  })
  const [now, setNow] = useState(Date.now())
  const [toast, setToast] = useState('')
  const [authOpen, setAuthOpen] = useState(false)
  const [authUser, setAuthUser] = useState(null)
  const [cloudReady, setCloudReady] = useState(false)
  const [syncStatus, setSyncStatus] = useState('local')
  const [lastSynced, setLastSynced] = useState(null)
  const gameRef = useRef(game)
  const cloudFingerprint = useMemo(() => JSON.stringify(cloudGameState(game)), [game])

  useEffect(() => {
    gameRef.current = game
  }, [game])

  useEffect(() => {
    localStorage.setItem('wordshire-game', JSON.stringify(game))
  }, [game])

  useEffect(() => {
    if (!supabase) return undefined

    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) setAuthUser(data.session?.user ?? null)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setAuthUser(session?.user ?? null)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!supabase || !authUser?.id) {
      setCloudReady(false)
      setSyncStatus('local')
      return undefined
    }

    let active = true
    setCloudReady(false)
    setSyncStatus('saving')

    async function loadCloudProgress() {
      const { data, error } = await supabase
        .from('player_progress')
        .select('game_state, updated_at')
        .eq('user_id', authUser.id)
        .maybeSingle()

      if (!active) return
      if (error) {
        setSyncStatus('error')
        return
      }

      if (data?.game_state) {
        const restored = normalizeGame(data.game_state)
        setGame(restored)
        setQuizQuestions(createLevelQuiz(restored.activeLevel, 10))
        setSkipChallenge({ status: 'idle', questionIndex: 0, correct: 0, targetLevel: null })
        setSelected(null)
        setLastSynced(data.updated_at ? new Date(data.updated_at) : new Date())
      } else {
        const { error: uploadError } = await supabase.from('player_progress').upsert({
          user_id: authUser.id,
          game_state: cloudGameState(gameRef.current),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        if (!active) return
        if (uploadError) {
          setSyncStatus('error')
          return
        }
        setLastSynced(new Date())
      }

      setCloudReady(true)
      setSyncStatus('synced')
    }

    loadCloudProgress()
    return () => { active = false }
  }, [authUser?.id])

  useEffect(() => {
    if (!supabase || !authUser?.id || !cloudReady) return undefined
    setSyncStatus('saving')
    const timer = setTimeout(async () => {
      const { error } = await supabase.from('player_progress').upsert({
        user_id: authUser.id,
        game_state: JSON.parse(cloudFingerprint),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      if (error) {
        setSyncStatus('error')
      } else {
        setSyncStatus('synced')
        setLastSynced(new Date())
      }
    }, 1200)
    return () => clearTimeout(timer)
  }, [cloudFingerprint, authUser?.id, cloudReady])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const currentTick = Math.floor(now / 10000)
    if (currentTick <= game.marketLastTick) return
    setGame((value) => {
      if (currentTick <= value.marketLastTick) return value
      const nextPrices = { ...value.marketPrices }
      const previousPrices = { ...value.marketPrices }
      const firstTick = Math.max(value.marketLastTick + 1, currentTick - 499)
      for (let tick = firstTick; tick <= currentTick; tick += 1) {
        for (const stock of stocks) {
          const oldPrice = nextPrices[stock.symbol] || stock.basePrice
          const move = getMarketMove(stock.symbol, tick)
          let newPrice = Math.round(oldPrice * (1 + move))
          if (move > 0 && newPrice <= oldPrice) newPrice = oldPrice + 1
          if (move < 0 && newPrice >= oldPrice) newPrice = oldPrice - 1
          nextPrices[stock.symbol] = Math.min(9999, Math.max(5, newPrice))
        }
      }
      return { ...value, marketPrices: nextPrices, previousMarketPrices: previousPrices, marketLastTick: currentTick }
    })
  }, [now, game.marketLastTick])

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(''), 2600)
    return () => clearTimeout(timer)
  }, [toast])

  const incomePerHour = useMemo(
    () => game.buildings.reduce((total, item) => total + item.income, 0),
    [game.buildings],
  )

  const pendingExact = useMemo(
    () => game.buildings.reduce((total, item) => {
      const earningStart = Math.max(game.lastCollected, item.builtAt)
      return total + Math.max(0, now - earningStart) / 3600000 * item.income
    }, 0),
    [game.buildings, game.lastCollected, now],
  )
  const pendingCoins = Math.floor(pendingExact)

  function notify(message) {
    setToast(message)
  }

  function answer(choice) {
    if (selected || game.lessonCompleted) return
    setSelected(choice)
  }

  function nextQuestion() {
    const challengeActive = skipChallenge.status === 'active'
    const questionIndex = challengeActive ? skipChallenge.questionIndex : game.questionIndex
    const current = quizQuestions[questionIndex]

    if (challengeActive) {
      if (selected !== current.answer) {
        setSkipChallenge((value) => ({ ...value, status: 'failed' }))
        setSelected(null)
        return
      }

      if (questionIndex === SKIP_CHALLENGE_QUESTIONS - 1) {
        const targetLevel = skipChallenge.targetLevel
        setGame((value) => ({
          ...value,
          activeLevel: targetLevel,
          unlockedLevel: Math.max(value.unlockedLevel, targetLevel),
          correct: 0,
          questionIndex: 0,
          lessonCompleted: false,
        }))
        setSkipChallenge({ status: 'passed', questionIndex, correct: SKIP_CHALLENGE_QUESTIONS, targetLevel })
        setSelected(null)
        notify(`完美答對 ${SKIP_CHALLENGE_QUESTIONS} 題，直接 +${SKIP_CHALLENGE_LEVELS} 級到 Level ${targetLevel}！`)
        return
      }

      setSkipChallenge((value) => ({
        ...value,
        correct: value.correct + 1,
        questionIndex: value.questionIndex + 1,
      }))
      setSelected(null)
      return
    }

    if (selected !== current.answer) {
      setSelected(null)
      return
    }

    if (game.questionIndex === quizQuestions.length - 1) {
      const rewardPart = getPartReward(game.activeLevel)
      setGame((value) => {
        const today = todayKey()
        const dayGap = daysBetween(value.lastStudyDate, today)
        const streakDays = dayGap === 0 ? value.streakDays : dayGap === 1 ? value.streakDays + 1 : 1
        return {
          ...value,
          correct: 10,
          lessonCompleted: true,
          streakDays,
          lastStudyDate: today,
          parts: { ...value.parts, [rewardPart.type]: (value.parts[rewardPart.type] || 0) + 1 },
          unlockedLevel: Math.min(999, Math.max(value.unlockedLevel, value.activeLevel + 1)),
        }
      })
      setSelected(null)
      notify(`Level ${game.activeLevel} 完成！獲得 1 個${rewardPart.name}配件。`)
      return
    }

    setGame((value) => ({ ...value, correct: value.correct + 1, questionIndex: value.questionIndex + 1 }))
    setSelected(null)
  }

  function restartLesson() {
    setSkipChallenge({ status: 'idle', questionIndex: 0, correct: 0, targetLevel: null })
    setGame((value) => ({ ...value, correct: 0, questionIndex: 0, lessonCompleted: false }))
    setQuizQuestions(createLevelQuiz(game.activeLevel, 10))
    setSelected(null)
  }

  function selectLevel(level) {
    const safeLevel = Math.min(999, Math.max(1, level))
    if (safeLevel > game.unlockedLevel) {
      notify(`先完成 Level ${game.unlockedLevel} 才能繼續前進。`)
      return
    }
    setSkipChallenge({ status: 'idle', questionIndex: 0, correct: 0, targetLevel: null })
    setGame((value) => ({ ...value, activeLevel: safeLevel, correct: 0, questionIndex: 0, lessonCompleted: false }))
    setQuizQuestions(createLevelQuiz(safeLevel, 10))
    setSelected(null)
  }

  function goNextLevel() {
    if (game.activeLevel >= 999) {
      notify('恭喜完成全部 999 個關卡！')
      return
    }
    selectLevel(game.activeLevel + 1)
  }

  function startSkipChallenge() {
    if (game.unlockedLevel >= 999) {
      notify('你已經解鎖全部 999 個關卡！')
      return
    }
    const targetLevel = Math.min(999, game.unlockedLevel + SKIP_CHALLENGE_LEVELS)
    setGame((value) => ({ ...value, correct: 0, questionIndex: 0, lessonCompleted: false }))
    setSkipChallenge({ status: 'active', questionIndex: 0, correct: 0, targetLevel })
    setQuizQuestions(createLevelQuiz(targetLevel, SKIP_CHALLENGE_QUESTIONS))
    setSelected(null)
  }

  function enterSkippedLevel() {
    const targetLevel = skipChallenge.targetLevel ?? game.activeLevel
    setSkipChallenge({ status: 'idle', questionIndex: 0, correct: 0, targetLevel: null })
    setQuizQuestions(createLevelQuiz(targetLevel, 10))
    setSelected(null)
  }

  function build(type) {
    const ownedParts = game.parts[type.type] || 0
    if (ownedParts < type.partsRequired) {
      notify(`還差 ${type.partsRequired - ownedParts} 個${type.name}配件。`)
      return
    }
    const item = { ...type, id: `${type.type}-${Date.now()}`, builtAt: Date.now() }
    setGame((value) => ({
      ...value,
      parts: { ...value.parts, [type.type]: (value.parts[type.type] || 0) - type.partsRequired },
      buildings: [...value.buildings, item],
    }))
    notify(`${type.name}開張了！每小時生產 ${type.income} 金幣。`)
  }

  function collectIncome() {
    if (pendingCoins < 1) {
      notify(incomePerHour ? '金幣還在生產中，再等一下吧！' : '先蓋一棟建築，城市才會開始賺錢。')
      return
    }
    setGame((value) => ({ ...value, coins: value.coins + pendingCoins, lastCollected: now }))
    notify(`收取了 ${pendingCoins} 枚金幣！`)
  }

  function tradeStock(stock, quantity, action) {
    const shares = Math.max(1, Math.floor(Number(quantity) || 1))
    const price = game.marketPrices[stock.symbol] || stock.basePrice
    const position = game.portfolio[stock.symbol] || { shares: 0, averageCost: 0 }

    if (action === 'buy') {
      const cost = price * shares
      if (game.coins < cost) {
        notify(`金幣不足，購買需要 ${money(cost)} 枚。`)
        return
      }
      const totalShares = position.shares + shares
      const averageCost = (position.shares * position.averageCost + cost) / totalShares
      setGame((value) => ({
        ...value,
        coins: value.coins - cost,
        portfolio: { ...value.portfolio, [stock.symbol]: { shares: totalShares, averageCost } },
      }))
      notify(`買進 ${stock.symbol} ×${shares}，花費 ${money(cost)} 金幣。`)
      return
    }

    if (position.shares < shares) {
      notify(`持股不足，目前只有 ${position.shares} 股。`)
      return
    }
    const remainingShares = position.shares - shares
    const revenue = price * shares
    setGame((value) => ({
      ...value,
      coins: value.coins + revenue,
      portfolio: {
        ...value.portfolio,
        [stock.symbol]: { shares: remainingShares, averageCost: remainingShares ? position.averageCost : 0 },
      },
    }))
    notify(`賣出 ${stock.symbol} ×${shares}，獲得 ${money(revenue)} 金幣。`)
  }

  async function signIn(email, password) {
    if (!supabase) return { ok: false, message: '尚未設定 Supabase。' }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { ok: false, message: error.message }
    return { ok: true, signedIn: Boolean(data.session), message: '登入成功，正在載入雲端進度。' }
  }

  async function signUp(email, password) {
    if (!supabase) return { ok: false, message: '尚未設定 Supabase。' }
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) return { ok: false, message: error.message }
    if (!data.session) {
      return { ok: true, signedIn: false, message: '註冊成功！請到信箱點擊確認連結，再回來登入。' }
    }
    return { ok: true, signedIn: true, message: '註冊成功，正在建立雲端存檔。' }
  }

  async function signOut() {
    if (!supabase) return { ok: false, message: '尚未設定 Supabase。' }
    const { error } = await supabase.auth.signOut()
    if (error) return { ok: false, message: error.message }
    return { ok: true, message: '已登出，接下來的進度只會保存在這台裝置。' }
  }

  async function syncNow() {
    if (!supabase || !authUser?.id) return
    setSyncStatus('saving')
    const { error } = await supabase.from('player_progress').upsert({
      user_id: authUser.id,
      game_state: cloudGameState(gameRef.current),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    if (error) {
      setSyncStatus('error')
      notify('雲端同步失敗，本機進度仍有保留。')
    } else {
      setSyncStatus('synced')
      setLastSynced(new Date())
      notify('雲端進度已同步。')
    }
  }

  const currentQuestion = quizQuestions[skipChallenge.status === 'active' ? skipChallenge.questionIndex : game.questionIndex]
  const isCorrect = selected === currentQuestion.answer
  const progress = skipChallenge.status === 'active'
    ? skipChallenge.correct / SKIP_CHALLENGE_QUESTIONS * 100
    : game.lessonCompleted ? 100 : game.correct * 10

  return (
    <div className="min-h-screen bg-[#f7f5ee] text-slate-800">
      <header className="sticky top-0 z-30 border-b border-[#e4dfd2] bg-[#fffdf8]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2 sm:min-h-18 sm:flex-nowrap sm:gap-4 sm:px-8 sm:py-0">
          <button onClick={() => setPage('learn')} className="flex items-center gap-3 text-left">
            <span className="grid size-10 place-items-center rounded-xl bg-emerald-700 text-xl font-black text-white shadow-sm">A</span>
            <span className="hidden sm:block"><b className="block font-serif text-xl leading-none text-emerald-950">Wordshire</b><small className="mt-1 block text-[9px] font-black uppercase tracking-[.2em] text-emerald-700">Learn · Build · Grow</small></span>
          </button>

          <nav className="order-3 flex w-full rounded-xl bg-slate-100 p-1 sm:order-none sm:w-auto" aria-label="主要頁面">
            <button onClick={() => setPage('learn')} className={`nav-tab ${page === 'learn' ? 'nav-active' : ''}`}><span>📖</span><span className="hidden sm:inline">英文冒險</span></button>
            <button onClick={() => setPage('city')} className={`nav-tab ${page === 'city' ? 'nav-active' : ''}`}><span>🏘️</span><span className="hidden sm:inline">我的城市</span></button>
            <button onClick={() => setPage('stocks')} className={`nav-tab ${page === 'stocks' ? 'nav-active' : ''}`}><span>📈</span><span className="hidden sm:inline">模擬股市</span></button>
          </nav>

          <div className="flex min-w-0 items-center gap-2">
            <button onClick={() => setAuthOpen(true)} className={`account-button ${authUser ? 'account-online' : ''}`} title={authUser?.email ?? '登入以同步進度'}>
              <span>{authUser ? '☁️' : '👤'}</span>
              <span className="hidden lg:inline">{authUser ? '已同步' : '登入'}</span>
              {authUser && <i className={`sync-dot sync-dot-${syncStatus}`} />}
            </button>
            <div className="flex items-center gap-2 rounded-full bg-amber-50 px-3 py-2 text-sm font-extrabold text-amber-700 ring-1 ring-amber-100">
              <span>🪙</span><span>{money(game.coins)}</span>
            </div>
          </div>
        </div>
      </header>

      {page === 'learn' ? (
        <LearnPage
          game={game}
          question={currentQuestion}
          selected={selected}
          isCorrect={isCorrect}
          progress={progress}
          onSelectLevel={selectLevel}
          onNextLevel={goNextLevel}
          onAnswer={answer}
          onNext={nextQuestion}
          onRestart={restartLesson}
          skipChallenge={skipChallenge}
          onStartSkipChallenge={startSkipChallenge}
          onEnterSkippedLevel={enterSkippedLevel}
          onGoCity={() => setPage('city')}
        />
      ) : page === 'city' ? (
        <CityPage
          game={game}
          incomePerHour={incomePerHour}
          pendingExact={pendingExact}
          pendingCoins={pendingCoins}
          onBuild={build}
          onCollect={collectIncome}
          onGoLearn={() => setPage('learn')}
        />
      ) : (
        <StockPage game={game} onTrade={tradeStock} onGoCity={() => setPage('city')} />
      )}

      {toast && <div className="fixed bottom-6 left-1/2 z-50 w-max max-w-[90vw] -translate-x-1/2 animate-pop rounded-full bg-slate-900 px-5 py-3 text-center text-sm font-bold text-white shadow-xl">{toast}</div>}
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        user={authUser}
        configured={isSupabaseConfigured}
        syncStatus={syncStatus}
        lastSynced={lastSynced}
        onSignIn={signIn}
        onSignUp={signUp}
        onSignOut={signOut}
        onSync={syncNow}
      />
    </div>
  )
}

function LearnPage({ game, question, selected, isCorrect, progress, onAnswer, onNext, onRestart, onGoCity, onSelectLevel, onNextLevel, skipChallenge, onStartSkipChallenge, onEnterSkippedLevel }) {
  const firstVisibleLevel = Math.max(1, Math.min(991, game.activeLevel - 4))
  const visibleLevels = Array.from({ length: 9 }, (_, index) => firstVisibleLevel + index)
  const reward = getPartReward(game.activeLevel)
  const challengeActive = skipChallenge.status === 'active'
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8 lg:py-12">
      <div className="mb-8">
        <div className="mb-2 text-xs font-black uppercase tracking-[.2em] text-emerald-700">English Adventure · Level {game.activeLevel} / 999</div>
        <h1 className="font-serif text-4xl font-bold text-slate-900 sm:text-5xl">單字冒險之路</h1>
        <p className="mt-3 text-slate-500">2,000 個名詞、999 個漸進關卡。每關固定 10 題，越後面的單字越進階。</p>
      </div>

      <section className="level-path mb-7">
        <div className="mb-4 flex items-center justify-between gap-4"><div><b className="font-serif text-xl">關卡地圖</b><p className="text-xs text-slate-500">題組固定不變 · 已解鎖至 Level {game.unlockedLevel}</p></div><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">{game.unlockedLevel} / 999</span></div>
        <div className="level-track">
          {visibleLevels.map((level) => {
            const locked = level > game.unlockedLevel
            const active = level === game.activeLevel
            const completed = level < game.unlockedLevel
            return <button key={level} onClick={() => onSelectLevel(level)} className={`level-step ${active ? 'level-step-active' : ''} ${locked ? 'level-step-locked' : ''}`}><span>{locked ? '🔒' : completed ? '✓' : '★'}</span><b>Lv.{level}</b></button>
          })}
        </div>
      </section>

      <div className="grid gap-7 lg:grid-cols-[1fr_310px]">
        <section className="rounded-[28px] border border-[#e3ded1] bg-[#fffdf8] p-6 shadow-[0_16px_50px_rgba(45,62,47,.08)] sm:p-10">
          {skipChallenge.status === 'passed' ? (
            <div className="grid min-h-[440px] place-items-center text-center">
              <div>
                <div className="mx-auto grid size-28 place-items-center rounded-full bg-violet-100 text-6xl shadow-inner">🚀</div>
                <div className="mt-6 text-xs font-black uppercase tracking-[.2em] text-violet-700">20 / 20 Perfect</div>
                <h2 className="mt-2 font-serif text-4xl font-bold text-slate-900">跳級成功！</h2>
                <p className="mx-auto mt-3 max-w-md text-slate-500">你一次答對全部 20 題，已提升 {SKIP_CHALLENGE_LEVELS} 級並解鎖 Level {skipChallenge.targetLevel}。</p>
                <button onClick={onEnterSkippedLevel} className="mt-7 rounded-xl bg-violet-700 px-6 py-3 font-extrabold text-white hover:bg-violet-800">前往 Level {skipChallenge.targetLevel}</button>
              </div>
            </div>
          ) : skipChallenge.status === 'failed' ? (
            <div className="grid min-h-[440px] place-items-center text-center">
              <div>
                <div className="mx-auto grid size-28 place-items-center rounded-full bg-rose-100 text-6xl shadow-inner">🎯</div>
                <div className="mt-6 text-xs font-black uppercase tracking-[.2em] text-rose-700">Skip Challenge</div>
                <h2 className="mt-2 font-serif text-4xl font-bold text-slate-900">差一點就成功了</h2>
                <p className="mx-auto mt-3 max-w-md text-slate-500">跳級需要 20 題全部一次答對。準備好後可以立刻重新挑戰。</p>
                <button onClick={onStartSkipChallenge} className="mt-7 rounded-xl bg-violet-700 px-6 py-3 font-extrabold text-white hover:bg-violet-800">重新挑戰 20 題</button>
              </div>
            </div>
          ) : game.lessonCompleted ? (
            <div className="grid min-h-[440px] place-items-center text-center">
              <div>
                <div className="mx-auto grid size-28 place-items-center rounded-full bg-amber-100 text-6xl shadow-inner">🏆</div>
                <div className="mt-6 text-xs font-black uppercase tracking-[.2em] text-emerald-700">Level {game.activeLevel} Complete</div>
                <h2 className="mt-2 font-serif text-4xl font-bold text-slate-900">關卡完成！</h2>
                <p className="mx-auto mt-3 max-w-md text-slate-500">你已經答對 10 題，獲得 1 個{reward.name}配件，下一個關卡也解鎖了。</p>
                <div className="mt-7 flex flex-wrap justify-center gap-3">
                  {game.activeLevel < 999 && <button onClick={onNextLevel} className="rounded-xl bg-emerald-700 px-6 py-3 font-extrabold text-white hover:bg-emerald-800">挑戰 Level {game.activeLevel + 1}</button>}
                  <button onClick={onGoCity} className="rounded-xl bg-amber-500 px-6 py-3 font-extrabold text-white hover:bg-amber-600">前往我的城市</button>
                  <button onClick={onRestart} className="rounded-xl border border-slate-200 bg-white px-6 py-3 font-bold text-slate-600 hover:bg-slate-50">再練習一次</button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-8 flex items-center gap-4">
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600 transition-all duration-500" style={{ width: `${progress}%` }} /></div>
                <b className="text-sm text-emerald-700">{challengeActive ? skipChallenge.correct : game.correct}/{challengeActive ? SKIP_CHALLENGE_QUESTIONS : 10}</b>
              </div>
              <div className="mb-2 flex items-center justify-between text-xs font-extrabold uppercase tracking-[.16em] text-slate-400"><span>{challengeActive ? `跳級挑戰 · ${skipChallenge.questionIndex + 1}/${SKIP_CHALLENGE_QUESTIONS}` : `Level ${game.activeLevel} · ${game.questionIndex + 1}/10`}</span><span>難度 #{question.rank} · {question.level}</span></div>
              <h2 className="mb-8 min-h-20 font-serif text-3xl font-bold leading-snug text-slate-900 sm:text-4xl">{question.prompt}</h2>
              <div className="grid gap-3">
                {question.choices.map((choice, index) => {
                  const answerChoice = selected && choice === question.answer
                  const wrongChoice = selected === choice && choice !== question.answer
                  return (
                    <button key={choice} onClick={() => onAnswer(choice)} className={`answer-choice ${answerChoice ? 'answer-correct' : ''} ${wrongChoice ? 'answer-wrong' : ''}`}>
                      <span className="choice-key">{String.fromCharCode(65 + index)}</span><span>{choice}</span>{answerChoice && <span className="ml-auto">✓</span>}{wrongChoice && <span className="ml-auto">✕</span>}
                    </button>
                  )
                })}
              </div>
              {selected && <div className={`mt-5 rounded-2xl p-4 text-sm ${isCorrect ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}><b>{isCorrect ? '答對了！' : challengeActive ? '這次挑戰未達成。' : '再想一下！'}</b> {question.note}</div>}
              <button disabled={!selected} onClick={onNext} className="mt-6 w-full rounded-xl bg-emerald-700 py-3.5 font-extrabold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">
                {!selected ? '選擇一個答案' : isCorrect ? (challengeActive ? (skipChallenge.questionIndex === SKIP_CHALLENGE_QUESTIONS - 1 ? `完成挑戰並升至 Level ${skipChallenge.targetLevel}` : '下一題') : game.questionIndex === 9 ? `完成 Level ${game.activeLevel} 並領取建築配件` : '下一題') : challengeActive ? '查看挑戰結果' : '再試一次'}
              </button>
            </>
          )}
        </section>

        <aside className="space-y-5">
          {game.unlockedLevel < 999 && (
            <div className="rounded-3xl border border-violet-200 bg-violet-50 p-6">
              <span className="text-4xl">🚀</span><div className="mt-4 text-xs font-black uppercase tracking-wider text-violet-700">Level Skip Challenge</div><div className="mt-1 text-xl font-black text-violet-950">20 題完美 +{SKIP_CHALLENGE_LEVELS} 級</div><p className="mt-2 text-sm text-violet-800/70">20 題全部一次答對，從已解鎖的 Level {game.unlockedLevel} 直接升到 Level {Math.min(999, game.unlockedLevel + SKIP_CHALLENGE_LEVELS)}。答錯任何一題就需重新挑戰。</p>
              {!challengeActive && <button onClick={onStartSkipChallenge} className="mt-4 w-full rounded-xl bg-violet-700 px-4 py-3 text-sm font-extrabold text-white hover:bg-violet-800">開始跳級挑戰</button>}
            </div>
          )}
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
            <span className="text-4xl">{reward.partEmoji}</span><div className="mt-4 text-xs font-black uppercase tracking-wider text-amber-700">Level {game.activeLevel} 完成獎勵</div><div className="mt-1 text-xl font-black text-amber-900">{reward.name}配件 ×1</div><p className="mt-2 text-sm text-amber-800/70">集滿 {reward.partsRequired} 個配件，即可在城市工坊組裝一棟{reward.name}。</p>
          </div>
          <div className="rounded-3xl border border-[#dfe6d9] bg-white p-6">
            <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-2xl">🔥</span><div><b className="block">{game.streakDays} 天連續學習</b><small className="text-slate-400">{game.streakDays === 1 ? '今天是冒險的第一天' : '明天再完成一關就能延續'}</small></div></div>
            <div className="mt-5 grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400">{['1','2','3','4','5','6','7'].map((day, i) => <div key={day}><span className={`mx-auto mb-1 grid size-7 place-items-center rounded-full ${i < Math.min(game.streakDays, 7) ? 'bg-emerald-600 text-white' : 'bg-slate-100'}`}>{i < Math.min(game.streakDays, 7) ? '✓' : ''}</span>第{day}天</div>)}</div>
          </div>
        </aside>
      </div>
    </main>
  )
}

function CityPage({ game, incomePerHour, pendingExact, pendingCoins, onBuild, onCollect, onGoLearn }) {
  const ownedBuildings = buildingTypes.map((type) => {
    const instances = game.buildings.filter((building) => building.type === type.type)
    return { ...type, count: instances.length, totalIncome: instances.length * type.income }
  }).filter((type) => type.count > 0)

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8 lg:py-10">
      <section className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div><div className="mb-2 text-xs font-black uppercase tracking-[.2em] text-emerald-700">My Town · Workshop</div><h1 className="font-serif text-4xl font-bold text-slate-900 sm:text-5xl">我的綠野小鎮</h1><p className="mt-3 text-slate-500">用闖關獲得的配件組裝建築，再把城市收益帶到模擬股市投資。</p></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="stat-card"><small>城市產值</small><b>🪙 {incomePerHour}/小時</b></div>
          <div className="stat-card"><small>建築總數</small><b>🏠 {game.buildings.length}</b></div>
        </div>
      </section>

      <div className="grid gap-7 xl:grid-cols-[1fr_380px]">
        <section className="overflow-hidden rounded-[30px] border border-[#d6ddcd] bg-white shadow-[0_16px_50px_rgba(45,62,47,.09)]">
          <div className="city-toolbar">
            <div><b className="font-serif text-xl">已擁有建築</b><p className="text-xs text-slate-500">同類建築會合併計算數量與每小時收益</p></div>
            <div className="rounded-xl bg-amber-50 px-4 py-2 text-right"><small className="block text-[10px] font-black uppercase text-amber-600">待領收益</small><b className="text-lg text-amber-800">🪙 {money(pendingCoins)}</b></div>
          </div>
          <div className="owned-list">
            {ownedBuildings.length ? ownedBuildings.map((building) => (
              <div key={building.type} className="owned-row">
                <span className="owned-icon" style={{ background: `${building.color}22` }}>{building.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2"><b className="text-base text-slate-800">{building.name}</b><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">× {building.count}</span></div>
                  <small className="mt-1 block text-slate-400">{building.english} · 單棟 +{building.income} 金幣/小時</small>
                </div>
                <div className="text-right"><small className="block text-[10px] font-black uppercase text-emerald-600">總收益</small><b className="text-base text-emerald-800">🪙 +{building.totalIncome}/小時</b></div>
              </div>
            )) : (
              <div className="grid min-h-72 place-items-center px-6 text-center"><div><span className="text-6xl">🏗️</span><h3 className="mt-4 font-serif text-2xl font-bold">城市還沒有建築</h3><p className="mt-2 text-sm text-slate-500">完成英文關卡，集滿配件後組裝第一間麵包店吧！</p></div></div>
            )}
          </div>
          <div className="flex flex-col items-center justify-between gap-4 border-t border-slate-100 bg-[#fffdf8] px-6 py-5 sm:flex-row">
            <div><b className="block text-sm">金幣正在持續累積</b><small className="text-slate-400">目前精確收益：{pendingExact.toFixed(2)}，滿 1 枚即可領取</small></div>
            <button onClick={onCollect} className={`rounded-xl px-6 py-3 text-sm font-extrabold text-white shadow-sm ${pendingCoins > 0 ? 'bg-amber-500 hover:bg-amber-600' : 'bg-slate-300'}`}>收取 {money(pendingCoins)} 金幣</button>
          </div>
        </section>

        <aside className="rounded-[30px] border border-[#e3ded1] bg-[#fffdf8] p-5 shadow-sm sm:p-6">
          <div className="mb-5"><h2 className="font-serif text-2xl font-bold">建築工坊</h2><p className="mt-1 text-xs text-slate-500">集滿 3～5 個指定配件即可完成建築</p></div>
          <div className="space-y-3">
            {buildingTypes.map((type) => (
              <div key={type.type} className="shop-item">
                <span className="grid size-13 place-items-center rounded-xl text-3xl" style={{ background: `${type.color}22` }}>{type.partEmoji}</span>
                <div className="min-w-0 flex-1"><b className="block truncate text-sm">{type.name}</b><small className="block text-slate-400">配件 {game.parts[type.type] || 0}/{type.partsRequired} · 完成後 +{type.income}/小時</small><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.min(100, ((game.parts[type.type] || 0) / type.partsRequired) * 100)}%` }} /></div></div>
                <div className="text-right"><small className="mb-1 block text-[9px] font-bold text-slate-400">建築 ×{game.buildings.filter((item) => item.type === type.type).length}</small><button onClick={() => onBuild(type)} disabled={(game.parts[type.type] || 0) < type.partsRequired} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-extrabold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300">組裝</button></div>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800"><b>💡 建設循環</b><p className="mt-1 text-xs leading-relaxed text-emerald-700/75">答對 10 題拿配件 → 集滿後組裝建築 → 建築每小時產生金幣 → 到模擬股市投資。</p></div>
          <button onClick={onGoLearn} className="mt-4 w-full rounded-xl border border-emerald-200 bg-white py-3 text-sm font-bold text-emerald-700 hover:bg-emerald-50">回英文冒險收集配件</button>
        </aside>
      </div>
    </main>
  )
}

function StockPage({ game, onTrade, onGoCity }) {
  const [quantities, setQuantities] = useState(() => Object.fromEntries(stocks.map((stock) => [stock.symbol, 1])))
  const market = stocks.map((stock) => ({
    ...stock,
    price: game.marketPrices[stock.symbol] || stock.basePrice,
    previousPrice: game.previousMarketPrices[stock.symbol] || stock.basePrice,
  }))
  const portfolioValue = market.reduce((total, stock) => total + (game.portfolio[stock.symbol]?.shares || 0) * stock.price, 0)
  const portfolioCost = market.reduce((total, stock) => {
    const position = game.portfolio[stock.symbol]
    return total + (position?.shares || 0) * (position?.averageCost || 0)
  }, 0)
  const profit = portfolioValue - portfolioCost

  function updateQuantity(symbol, value) {
    setQuantities((current) => ({ ...current, [symbol]: Math.max(1, Math.floor(Number(value) || 1)) }))
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8 lg:py-10">
      <section className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div><div className="mb-2 text-xs font-black uppercase tracking-[.2em] text-violet-700">Paper Market · 10 秒更新</div><h1 className="font-serif text-4xl font-bold text-slate-900 sm:text-5xl">Wordshire 模擬股市</h1><p className="mt-3 text-slate-500">用城市賺到的遊戲金幣練習買進、賣出與觀察損益。</p></div>
        <div className="grid grid-cols-2 gap-3"><div className="stat-card"><small>可用金幣</small><b>🪙 {money(game.coins)}</b></div><div className="stat-card"><small>持股市值</small><b>📊 {money(portfolioValue)}</b></div></div>
      </section>

      <div className="mb-7 grid gap-4 sm:grid-cols-3">
        <div className="market-summary"><small>投資成本</small><b>{money(portfolioCost)}</b></div>
        <div className="market-summary"><small>目前市值</small><b>{money(portfolioValue)}</b></div>
        <div className={`market-summary ${profit >= 0 ? 'profit-up' : 'profit-down'}`}><small>未實現損益</small><b>{profit >= 0 ? '+' : ''}{money(profit)}</b></div>
      </div>

      <section className="rounded-[30px] border border-[#ded9e7] bg-white p-5 shadow-[0_16px_50px_rgba(45,40,70,.08)] sm:p-7">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="font-serif text-2xl font-bold">模擬市場</h2><p className="mt-1 text-xs text-slate-500">價格每 10 秒隨機漲跌，可能形成連續上漲或下跌走勢</p></div><span className="shrink-0 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-700">MARKET OPEN</span></div>
        <div className="market-table">
          {market.map((stock) => {
            const position = game.portfolio[stock.symbol] || { shares: 0, averageCost: 0 }
            const stockProfit = position.shares * (stock.price - position.averageCost)
            return (
              <div key={stock.symbol} className="stock-row">
                <span className="stock-icon" style={{ background: `${stock.color}22` }}>{stock.icon}</span>
                <div className="min-w-0"><b className="block text-sm">{stock.name}</b><small className="font-black text-slate-400">{stock.symbol}</small></div>
                <div className="stock-price"><small>目前價格</small><b>🪙 {stock.price}</b><span className={`market-change ${stock.price >= stock.previousPrice ? 'text-emerald-600' : 'text-rose-600'}`}>{stock.price >= stock.previousPrice ? '▲' : '▼'} {Math.abs(stock.price - stock.previousPrice)}</span></div>
                <div className="stock-position"><small>持有 / 均價</small><b>{position.shares} 股 / {position.shares ? position.averageCost.toFixed(1) : '—'}</b><span className={stockProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{position.shares ? `${stockProfit >= 0 ? '+' : ''}${money(stockProfit)}` : '尚未持有'}</span></div>
                <div className="stock-actions"><input type="number" min="1" value={quantities[stock.symbol]} onChange={(event) => updateQuantity(stock.symbol, event.target.value)} aria-label={`${stock.symbol} 交易股數`} /><button onClick={() => onTrade(stock, quantities[stock.symbol], 'buy')} className="buy-button">買進</button><button onClick={() => onTrade(stock, quantities[stock.symbol], 'sell')} className="sell-button">賣出</button></div>
              </div>
            )
          })}
        </div>
      </section>

      <div className="mt-6 flex flex-col items-center justify-between gap-4 rounded-2xl border border-violet-100 bg-violet-50 p-5 text-sm text-violet-900 sm:flex-row"><div><b>⚠️ 遊戲模擬提醒</b><p className="mt-1 text-xs text-violet-700/75">此頁不是真實投資服務，不使用真實貨幣，也不構成任何投資建議。</p></div><button onClick={onGoCity} className="rounded-xl bg-violet-700 px-5 py-2.5 font-bold text-white hover:bg-violet-800">回城市收取金幣</button></div>
    </main>
  )
}

export default App
