import { useEffect, useMemo, useRef, useState } from 'react'
import { normalizeAdventure } from '../data/adventure'

const weapons = [
  { id: 'wooden-sword', name: '練習木劍', icon: '🗡️', attack: 2, cost: 0, stage: 1 },
  { id: 'iron-sword', name: '守衛鐵劍', icon: '⚔️', attack: 7, cost: 480, stage: 3 },
  { id: 'ember-blade', name: '餘燼之刃', icon: '🔥', attack: 15, cost: 1350, stage: 8 },
  { id: 'moon-glaive', name: '月影長刃', icon: '🌙', attack: 27, cost: 3600, stage: 16 },
]

const armors = [
  { id: 'traveler-cloak', name: '旅行斗篷', icon: '🧥', defense: 1, hp: 0, cost: 0, stage: 1 },
  { id: 'chain-mail', name: '銀環鎖甲', icon: '🛡️', defense: 4, hp: 15, cost: 520, stage: 4 },
  { id: 'forest-plate', name: '森靈板甲', icon: '🌿', defense: 8, hp: 35, cost: 1550, stage: 9 },
  { id: 'dragon-guard', name: '龍衛重甲', icon: '🐉', defense: 14, hp: 65, cost: 4200, stage: 18 },
]

const monsterRoster = [
  { name: '草原史萊姆', icon: '🟢', title: '黏答答的巡路者', tone: '#84cc16' },
  { name: '搗蛋哥布林', icon: '👺', title: '金幣袋覬覦者', tone: '#f97316' },
  { name: '荒野巨狼', icon: '🐺', title: '月下的追獵者', tone: '#64748b' },
  { name: '古墓守衛', icon: '💀', title: '沉睡王陵的哨兵', tone: '#a78bfa' },
  { name: '熔岩飛龍', icon: '🐲', title: '灼熱山口之翼', tone: '#ef4444' },
]

function getMonster(stage) {
  const base = monsterRoster[(stage - 1) % monsterRoster.length]
  const rank = Math.floor((stage - 1) / monsterRoster.length) + 1
  return {
    ...base,
    rank,
    maxHp: Math.round(38 + stage * 15 + stage ** 1.36 * 4),
    attack: Math.round(5 + stage * 1.65),
    defense: Math.floor(1 + stage * .72),
    reward: Math.round(42 + stage * 22 + stage ** 1.18 * 3),
  }
}

function getHeroStats(adventure) {
  const weapon = weapons.find((item) => item.id === adventure.weapon) ?? weapons[0]
  const armor = armors.find((item) => item.id === adventure.armor) ?? armors[0]
  return {
    attack: 10 + adventure.powerLevel * 3 + weapon.attack,
    defense: 2 + adventure.defenseLevel * 2 + armor.defense,
    maxHp: 100 + adventure.vitalityLevel * 14 + armor.hp,
    weapon,
    armor,
  }
}

const clampPercent = (value, max) => `${Math.max(0, Math.min(100, value / max * 100))}%`

export default function AdventurePage({ game, setGame, notify }) {
  const adventure = normalizeAdventure(game.adventure)
  const stats = useMemo(() => getHeroStats(adventure), [adventure])
  const monster = useMemo(() => getMonster(adventure.stage), [adventure.stage])
  const monsterHp = adventure.monsterHp ?? monster.maxHp
  const [message, setMessage] = useState('前方傳來奇怪的聲音……準備迎戰！')
  const [impact, setImpact] = useState('')
  const [sceneMode, setSceneMode] = useState('walking')
  const [autoPlay, setAutoPlay] = useState(true)
  const [coinDrop, setCoinDrop] = useState(null)
  const attackRef = useRef(null)
  const farmStage = adventure.farmStage

  useEffect(() => {
    if (sceneMode !== 'walking' || !autoPlay) return undefined
    const timer = setTimeout(() => {
      setSceneMode('battle')
      setMessage(`你在路旁遇見了 ${monster.name}。小心應戰！`)
    }, 1800)
    return () => clearTimeout(timer)
  }, [sceneMode, adventure.stage, monster.name, autoPlay])

  useEffect(() => {
    if (!autoPlay || sceneMode !== 'battle' || adventure.hp <= 0) return undefined
    const timer = setTimeout(() => attackRef.current?.(), 760)
    return () => clearTimeout(timer)
  }, [autoPlay, sceneMode, adventure.hp, monsterHp, adventure.stage, farmStage, stats.attack, stats.defense, monster.attack, monster.defense])

  function flash(kind) {
    setImpact('')
    requestAnimationFrame(() => setImpact(kind))
  }

  function attack() {
    if (adventure.hp <= 0 || sceneMode !== 'battle') return
    const critical = Math.random() < .16
    const heroDamage = Math.max(1, stats.attack - monster.defense + Math.floor(Math.random() * 5) - 2) * (critical ? 2 : 1)
    const nextMonsterHp = Math.max(0, monsterHp - heroDamage)
    flash(critical ? 'critical' : 'hit')

    if (nextMonsterHp === 0) {
      const farming = farmStage === adventure.stage
      const nextStage = farming ? adventure.stage : adventure.stage + 1
      setGame((value) => {
        const current = normalizeAdventure(value.adventure)
        const currentStats = getHeroStats(current)
        return {
          ...value,
          coins: value.coins + monster.reward,
          adventure: {
            ...current,
            stage: nextStage,
            maxStage: Math.max(current.maxStage, nextStage),
            monsterHp: null,
            hp: Math.min(currentStats.maxHp, current.hp + Math.ceil(currentStats.maxHp * .18)),
            victories: current.victories + 1,
          },
        }
      })
      setCoinDrop({ id: Date.now(), amount: monster.reward })
      setMessage(farming
        ? `${critical ? '暴擊！' : ''}擊敗 ${monster.name}，掉落 ${monster.reward} 金幣！正在重複攻略。`
        : `${critical ? '暴擊！' : ''}擊敗 ${monster.name}，掉落 ${monster.reward} 金幣！前往第 ${nextStage} 關。`)
      setTimeout(() => setSceneMode('walking'), 520)
      return
    }

    const monsterDamage = Math.max(1, monster.attack - stats.defense + Math.floor(Math.random() * 4) - 1)
    const nextHp = Math.max(0, adventure.hp - monsterDamage)
    if (nextHp === 0) {
      const fallbackStage = Math.max(1, adventure.stage - 1)
      setGame((value) => ({
        ...value,
        adventure: { ...normalizeAdventure(value.adventure), stage: fallbackStage, farmStage: fallbackStage, hp: stats.maxHp, monsterHp: null },
      }))
      setMessage(`無法擊敗 ${monster.name}，冒險者撤退到第 ${fallbackStage} 關，接下來會固定刷怪賺錢。`)
      setSceneMode('retreat')
      setTimeout(() => setSceneMode('walking'), 900)
      return
    }

    setGame((value) => ({
      ...value,
      adventure: { ...normalizeAdventure(value.adventure), hp: nextHp, monsterHp: nextMonsterHp },
    }))
    setMessage(`${critical ? '漂亮的暴擊！' : '自動攻擊！'}造成 ${heroDamage} 傷害，${monster.name} 反擊造成 ${monsterDamage} 傷害。`)
  }

  attackRef.current = attack

  function recover() {
    const cost = 30 + adventure.stage * 4
    if (game.coins < cost) return notify(`休養需要 ${cost} 金幣。`)
    setGame((value) => ({
      ...value,
      coins: value.coins - cost,
      adventure: { ...normalizeAdventure(value.adventure), hp: stats.maxHp },
    }))
    setMessage('營火與熱湯讓你恢復了全部生命。')
    notify(`已恢復全部生命，花費 ${cost} 金幣。`)
  }

  function upgrade(type) {
    const key = `${type}Level`
    const level = adventure[key]
    const cost = 90 + level * 75 + level ** 2 * 18
    if (game.coins < cost) return notify(`金幣不足，這次訓練需要 ${cost} 金幣。`)
    setGame((value) => {
      const current = normalizeAdventure(value.adventure)
      return {
        ...value,
        coins: value.coins - cost,
        adventure: {
          ...current,
          [key]: current[key] + 1,
          hp: type === 'vitality' ? current.hp + 14 : current.hp,
        },
      }
    })
    notify(`${type === 'power' ? '攻擊' : type === 'vitality' ? '生命' : '防禦'}訓練完成！`)
  }

  function equipmentAction(item, kind) {
    const ownedKey = kind === 'weapon' ? 'ownedWeapons' : 'ownedArmors'
    const equipKey = kind === 'weapon' ? 'weapon' : 'armor'
    const isOwned = adventure[ownedKey].includes(item.id)
    if (!isOwned && adventure.maxStage < item.stage) return notify(`通過第 ${item.stage - 1} 關後才會解鎖。`)
    if (!isOwned && game.coins < item.cost) return notify(`購買需要 ${item.cost.toLocaleString('zh-TW')} 金幣。`)
    setGame((value) => {
      const current = normalizeAdventure(value.adventure)
      const before = getHeroStats(current)
      const next = {
        ...current,
        [equipKey]: item.id,
        [ownedKey]: isOwned ? current[ownedKey] : [...current[ownedKey], item.id],
      }
      const after = getHeroStats(next)
      if (kind === 'armor') next.hp = Math.min(after.maxHp, current.hp + Math.max(0, after.maxHp - before.maxHp))
      return { ...value, coins: value.coins - (isOwned ? 0 : item.cost), adventure: next }
    })
    notify(isOwned ? `已裝備 ${item.name}。` : `買下並裝備了 ${item.name}！`)
  }

  function selectStage(direction) {
    const stage = Math.max(1, Math.min(adventure.maxStage, adventure.stage + direction))
    if (stage === adventure.stage) return
    setGame((value) => ({
      ...value,
      adventure: { ...normalizeAdventure(value.adventure), stage, farmStage: stage < adventure.maxStage ? stage : null, monsterHp: null },
    }))
    setMessage(`回到第 ${stage} 關探索。`)
    setSceneMode('walking')
  }

  function challengeNextStage() {
    const stage = Math.min(999, adventure.stage + 1)
    setGame((value) => {
      const current = normalizeAdventure(value.adventure)
      return {
        ...value,
        adventure: { ...current, stage, maxStage: Math.max(current.maxStage, stage), farmStage: null, monsterHp: null },
      }
    })
    setMessage(`結束刷怪，準備再次挑戰第 ${stage} 關！`)
    setSceneMode('walking')
    setAutoPlay(true)
  }

  const upgrades = [
    { type: 'power', icon: '⚔️', name: '力量訓練', bonus: `攻擊 +3`, level: adventure.powerLevel },
    { type: 'vitality', icon: '❤️', name: '體魄訓練', bonus: `生命 +14`, level: adventure.vitalityLevel },
    { type: 'defense', icon: '🛡️', name: '防禦訓練', bonus: `防禦 +2`, level: adventure.defenseLevel },
  ]

  return (
    <main className="adventure-page">
      <div className="adventure-heading">
        <div><span className="eyebrow">WORDSHIRE · WILD FRONTIER</span><h1>迷霧邊境</h1><p>帶著小鎮賺到的金幣，打造一位能走得更遠的冒險者。</p></div>
        <div className="adventure-record"><small>最佳進度</small><b>第 {adventure.maxStage} 關</b><span>{adventure.victories} 次勝利</span></div>
      </div>

      <section className="battle-card">
        <div className="battle-sky"><i className="battle-moon" /><i className="battle-mountain mountain-one" /><i className="battle-mountain mountain-two" /></div>
        <div className="stage-selector"><button onClick={() => selectStage(-1)} disabled={adventure.stage <= 1}>←</button><span>STAGE <b>{String(adventure.stage).padStart(2, '0')}</b></span><button onClick={() => selectStage(1)} disabled={adventure.stage >= adventure.maxStage}>→</button></div>
        <div className={`journey-scene ${sceneMode} ${impact} ${autoPlay ? '' : 'paused'}`} onAnimationEnd={() => setImpact('')}>
          <div className="scenery scenery-far"><i>🌲</i><i>🌲</i><i>🌳</i><i>🌲</i><i>🌳</i><i>🌲</i></div>
          <div className="scenery scenery-near"><i>🌿</i><i>🪨</i><i>🌾</i><i>🍄</i><i>🌿</i><i>🪨</i></div>
          <div className="road-markers"><i /><i /><i /><i /><i /><i /></div>
          <div className="distance-sign">下一站<br/><b>{adventure.stage + 1} 關</b></div>

          <article className="journey-hud hero-hud">
            <div className="fighter-label"><div><small>YOUR HERO · LV. {1 + adventure.powerLevel + adventure.vitalityLevel + adventure.defenseLevel}</small><b>曙光冒險者</b></div><span>⚔ {stats.attack}　🛡 {stats.defense}</span></div>
            <div className="health-bar"><i style={{ width: clampPercent(adventure.hp, stats.maxHp) }} /></div><div className="health-copy"><span>HP</span><b>{adventure.hp} / {stats.maxHp}</b></div>
          </article>

          <div className="hero-actor" aria-label="正在前進的曙光冒險者">
            <i className="actor-cape" /><span className="actor-head">🧑🏻</span><i className="actor-body" /><i className="actor-arm arm-front" /><i className="actor-arm arm-back" /><i className="actor-leg leg-front" /><i className="actor-leg leg-back" /><span className="actor-weapon">{stats.weapon.icon}</span><i className="actor-shadow" />
          </div>

          <div className="trail-dust"><i /><i /><i /></div>
          <div className="encounter-alert">!</div>
          {coinDrop && <div key={coinDrop.id} className="coin-loot" aria-label={`掉落 ${coinDrop.amount} 金幣`}><i>🪙</i><i>🪙</i><i>🪙</i><b>+{coinDrop.amount}</b></div>}

          <article className="journey-hud monster-hud" style={{ '--monster-tone': monster.tone }}>
            <div className="fighter-label"><div><small>RANK {monster.rank} · LV. {adventure.stage}</small><b>{monster.name}</b></div><span>⚔ {monster.attack}　🛡 {monster.defense}</span></div>
            <div className="health-bar monster-health"><i style={{ width: clampPercent(monsterHp, monster.maxHp) }} /></div><div className="health-copy"><span>HP</span><b>{monsterHp} / {monster.maxHp}</b></div>
          </article>
          <div className="monster-actor"><span>{monster.icon}</span><i className="monster-shadow" /></div>
        </div>
        <div className="battle-console">
          <div><small>{farmStage ? `AUTO FARM · STAGE ${farmStage}` : sceneMode === 'walking' ? 'AUTO JOURNEY' : 'AUTO BATTLE'}</small><p>{message}</p></div>
          <div className="auto-controls">
            {farmStage && <button className="challenge-button" onClick={challengeNextStage}>🚩 挑戰下一關</button>}
            <button className={`attack-button ${autoPlay ? 'auto-running' : ''}`} onClick={() => setAutoPlay((value) => !value)}><span>{autoPlay ? '⏸' : '▶️'}</span> {autoPlay ? (sceneMode === 'walking' ? '自動前進中' : '自動攻擊中') : '繼續冒險'}</button>
          </div>
        </div>
      </section>

      <div className="adventure-grid">
        <section className="adventure-panel"><div className="panel-title"><div><small>TRAINING CAMP</small><h2>永久能力訓練</h2></div><button className="recover-button" onClick={recover}>⛺ 休養補滿</button></div><div className="upgrade-list">{upgrades.map((item) => { const cost = 90 + item.level * 75 + item.level ** 2 * 18; return <article className="upgrade-item" key={item.type}><span>{item.icon}</span><div><b>{item.name}</b><small>{item.bonus} · 目前 Lv.{item.level}</small></div><button onClick={() => upgrade(item.type)} disabled={game.coins < cost}><b>升級</b><small>🪙 {cost}</small></button></article> })}</div></section>

        <section className="adventure-panel equipment-panel"><div className="panel-title"><div><small>GEAR MERCHANT</small><h2>武器與防具</h2></div><span className="merchant-mark">♜</span></div><div className="gear-section"><h3>武器</h3><div className="gear-grid">{weapons.map((item) => <GearItem key={item.id} item={item} owned={adventure.ownedWeapons.includes(item.id)} equipped={adventure.weapon === item.id} unlocked={adventure.maxStage >= item.stage} stat={`攻擊 +${item.attack}`} onClick={() => equipmentAction(item, 'weapon')} />)}</div></div><div className="gear-section"><h3>防具</h3><div className="gear-grid">{armors.map((item) => <GearItem key={item.id} item={item} owned={adventure.ownedArmors.includes(item.id)} equipped={adventure.armor === item.id} unlocked={adventure.maxStage >= item.stage} stat={`防禦 +${item.defense}${item.hp ? ` · HP +${item.hp}` : ''}`} onClick={() => equipmentAction(item, 'armor')} />)}</div></div></section>
      </div>
    </main>
  )
}

function GearItem({ item, owned, equipped, unlocked, stat, onClick }) {
  return <button className={`gear-item ${equipped ? 'gear-equipped' : ''} ${!unlocked ? 'gear-locked' : ''}`} onClick={onClick}><span className="gear-icon">{unlocked ? item.icon : '🔒'}</span><span className="gear-info"><b>{item.name}</b><small>{stat}</small></span><span className="gear-price">{equipped ? '裝備中' : owned ? '裝備' : unlocked ? `🪙 ${item.cost.toLocaleString('zh-TW')}` : `第 ${item.stage} 關`}</span></button>
}
