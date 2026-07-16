import type { ComparisonPair, VoteChoice } from '../data/local-library.ts'

export function orientPair(pair: ComparisonPair, swapped: boolean): ComparisonPair {
  if (!swapped) return pair
  return { ...pair, left: pair.right, right: pair.left }
}

export function translateVisibleChoice(choice: VoteChoice, swapped: boolean): VoteChoice {
  if (!swapped || choice === 'skip') return choice
  return choice === 'left' ? 'right' : 'left'
}
