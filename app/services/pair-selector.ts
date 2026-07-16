export interface RankedWebsite {
  id: string
  rating: number
  comparisons: number
}

export interface SelectedPair {
  websiteAId: string
  websiteBId: string
  leftWebsiteId: string
  rightWebsiteId: string
}

export function pairKey(firstId: string, secondId: string): string {
  return [firstId, secondId].sort().join(':')
}

export function selectPair(
  websites: RankedWebsite[],
  recentPairKeys: ReadonlySet<string>,
  random: () => number = Math.random,
): SelectedPair | null {
  if (websites.length < 2) return null

  let candidates: Array<{ first: RankedWebsite; second: RankedWebsite }> = []
  for (let index = 0; index < websites.length; index++) {
    for (let secondIndex = index + 1; secondIndex < websites.length; secondIndex++) {
      candidates.push({ first: websites[index]!, second: websites[secondIndex]! })
    }
  }

  let fresh = candidates.filter(
    ({ first, second }) => !recentPairKeys.has(pairKey(first.id, second.id)),
  )
  if (fresh.length > 0) candidates = fresh

  let minimumComparisons = Math.min(...websites.map((website) => website.comparisons))
  let underExposed = websites.some((website) => website.comparisons < 3)

  let selected: { first: RankedWebsite; second: RankedWebsite }
  if (!underExposed && random() < 0.12) {
    selected = candidates.toSorted(
      (left, right) =>
        Math.abs(right.first.rating - right.second.rating) -
        Math.abs(left.first.rating - left.second.rating),
    )[0]!
  } else {
    selected = candidates.toSorted((left, right) => {
      let leftIncludesLeast =
        left.first.comparisons === minimumComparisons || left.second.comparisons === minimumComparisons
      let rightIncludesLeast =
        right.first.comparisons === minimumComparisons || right.second.comparisons === minimumComparisons

      if (leftIncludesLeast !== rightIncludesLeast) return leftIncludesLeast ? -1 : 1

      let leftExposure = left.first.comparisons + left.second.comparisons
      let rightExposure = right.first.comparisons + right.second.comparisons
      if (leftExposure !== rightExposure) return leftExposure - rightExposure

      return (
        Math.abs(left.first.rating - left.second.rating) -
        Math.abs(right.first.rating - right.second.rating)
      )
    })[0]!
  }

  let leftFirst = random() < 0.5
  return {
    websiteAId: selected.first.id,
    websiteBId: selected.second.id,
    leftWebsiteId: leftFirst ? selected.first.id : selected.second.id,
    rightWebsiteId: leftFirst ? selected.second.id : selected.first.id,
  }
}
