export const DEFAULT_ADVENTURE = {
  stage: 1,
  maxStage: 1,
  hp: 100,
  monsterHp: null,
  farmStage: null,
  powerLevel: 0,
  vitalityLevel: 0,
  defenseLevel: 0,
  weapon: 'wooden-sword',
  armor: 'traveler-cloak',
  ownedWeapons: ['wooden-sword'],
  ownedArmors: ['traveler-cloak'],
  victories: 0,
}

export function normalizeAdventure(value) {
  return {
    ...DEFAULT_ADVENTURE,
    ...(value ?? {}),
    ownedWeapons: value?.ownedWeapons ?? DEFAULT_ADVENTURE.ownedWeapons,
    ownedArmors: value?.ownedArmors ?? DEFAULT_ADVENTURE.ownedArmors,
  }
}
