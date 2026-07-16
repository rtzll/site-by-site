export interface EloUpdate {
  winner: number
  loser: number
}

export function updateElo(
  winnerRating: number,
  loserRating: number,
  winnerComparisons: number,
  loserComparisons: number,
): EloUpdate {
  let k = kFactor(Math.max(winnerComparisons, loserComparisons))
  let expectedWinner = 1 / (1 + 10 ** ((loserRating - winnerRating) / 400))
  let delta = Math.round(k * (1 - expectedWinner))

  return {
    winner: winnerRating + delta,
    loser: loserRating - delta,
  }
}

function kFactor(comparisons: number): number {
  if (comparisons < 5) return 40
  if (comparisons < 15) return 24
  return 16
}
