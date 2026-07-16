interface SiteData {
  id: string
  url: string
  domain: string
  title: string | null
}

interface PairData {
  id: string
  left: SiteData
  right: SiteData
}

interface PairPayload {
  pair: PairData | null
  preloads: PairData[]
}

function initialize() {
  document.documentElement.dataset.enhanced = 'true'
  initializeDropZone()
  initializePreparation()
  initializeComparison()
}

function initializeDropZone() {
  let zone = document.querySelector<HTMLElement>('[data-drop-zone]')
  let input = document.querySelector<HTMLInputElement>('[data-bookmark-input]')
  if (!zone || !input) return

  for (let eventName of ['dragenter', 'dragover']) {
    zone.addEventListener(eventName, (event) => {
      event.preventDefault()
      zone.classList.add('is-dragging')
    })
  }
  for (let eventName of ['dragleave', 'drop']) {
    zone.addEventListener(eventName, (event) => {
      event.preventDefault()
      zone.classList.remove('is-dragging')
    })
  }
  zone.addEventListener('drop', (event) => {
    let file = event.dataTransfer?.files[0]
    if (!file) return
    let transfer = new DataTransfer()
    transfer.items.add(file)
    input.files = transfer.files
    input.form?.requestSubmit()
  })
  input.addEventListener('change', () => input.form?.requestSubmit())
}

function initializePreparation() {
  let page = document.querySelector<HTMLElement>('[data-preparation]')
  if (!page) return

  let progressUrl = page.dataset.progressUrl
  if (!progressUrl) return
  let stopped = false

  async function poll() {
    try {
      let response = await fetch(progressUrl!, { headers: { Accept: 'application/json' } })
      if (!response.ok) throw new Error('Preparation request failed.')
      let progress = (await response.json()) as {
        found: number
        ready: number
        checking: number
        unavailable: number
      }
      for (let key of ['found', 'ready', 'checking', 'unavailable'] as const) {
        let value = page?.querySelector<HTMLElement>(`[data-count="${key}"]`)
        if (value) value.textContent = String(progress[key])
      }

      let percentage = progress.found === 0 ? 0 : ((progress.found - progress.checking) / progress.found) * 100
      page?.querySelector<HTMLElement>('[data-progress-bar]')?.style.setProperty('--progress', `${percentage}%`)

      if (progress.checking === 0) {
        stopped = true
        let title = page?.querySelector<HTMLElement>('[data-preparation-title]')
        let copy = page?.querySelector<HTMLElement>('[data-preparation-copy]')
        let note = page?.querySelector<HTMLElement>('[data-preparation-note]')
        let actions = page?.querySelector<HTMLElement>('[data-preparation-actions]')
        let compare = page?.querySelector<HTMLAnchorElement>('[data-compare-link]')
        if (title) title.textContent = progress.ready >= 2 ? 'Your collection is ready.' : 'More sites are needed.'
        if (copy) copy.textContent = progress.ready >= 2
          ? 'Likely embeddable sites are ready for comparison.'
          : 'At least two sites must allow framing before a comparison can begin.'
        if (note) note.textContent = `${progress.unavailable} unavailable ${progress.unavailable === 1 ? 'site remains' : 'sites remain'} stored in the collection.`
        actions?.classList.remove('is-hidden')
        if (compare && progress.ready < 2) compare.hidden = true
        return
      }
    } catch (error) {
      console.error(error)
    }

    if (!stopped) window.setTimeout(poll, 500)
  }

  void poll()
}

function initializeComparison() {
  let stage = document.querySelector<HTMLElement>('[data-comparison]')
  if (!stage) return

  let divider = stage.querySelector<HTMLElement>('[data-divider]')
  let leftFrame = stage.querySelector<HTMLIFrameElement>('[data-site-frame="left"]')
  let rightFrame = stage.querySelector<HTMLIFrameElement>('[data-site-frame="right"]')
  let leftDomain = stage.querySelector<HTMLAnchorElement>('[data-domain="left"]')
  let rightDomain = stage.querySelector<HTMLAnchorElement>('[data-domain="right"]')
  let instruction = stage.querySelector<HTMLElement>('[data-instruction]')
  let feedback = stage.querySelector<HTMLElement>('[data-vote-feedback]')
  let preloadPool = stage.querySelector<HTMLElement>('[data-preload-pool]')
  if (!divider || !leftFrame || !rightFrame || !leftDomain || !rightDomain || !feedback || !preloadPool) return

  const dividerElement = divider
  const leftFrameElement = leftFrame
  const rightFrameElement = rightFrame
  const leftDomainElement = leftDomain
  const rightDomainElement = rightDomain
  const feedbackElement = feedback
  const preloadPoolElement = preloadPool

  let pair = parseJson<PairData>(stage.dataset.pair)
  let preloads = parseJson<PairData[]>(stage.dataset.preloads) ?? []
  let dividerPercent = 50
  let savedDivider = 50
  let dragging = false
  let submitting = false
  let focusedSide: 'left' | 'right' = 'left'

  function setDivider(percent: number) {
    dividerPercent = Math.min(100, Math.max(0, percent))
    stage?.style.setProperty('--divider', `${dividerPercent}%`)
  }

  function updateFromPointer(clientX: number) {
    setDivider((clientX / window.innerWidth) * 100)
  }

  dividerElement.addEventListener('pointerdown', (event) => {
    dragging = true
    dividerElement.setPointerCapture(event.pointerId)
    updateFromPointer(event.clientX)
  })
  dividerElement.addEventListener('pointermove', (event) => {
    if (dragging) updateFromPointer(event.clientX)
  })
  dividerElement.addEventListener('pointerup', (event) => {
    dragging = false
    dividerElement.releasePointerCapture(event.pointerId)
  })
  dividerElement.addEventListener('dblclick', () => setDivider(50))

  leftDomainElement.addEventListener('focus', () => { focusedSide = 'left' })
  rightDomainElement.addEventListener('focus', () => { focusedSide = 'right' })

  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey || submitting || event.repeat) return
    if (event.key === 'ArrowLeft') { event.preventDefault(); void submitChoice('left') }
    if (event.key === 'ArrowRight') { event.preventDefault(); void submitChoice('right') }
    if (event.key === 'ArrowDown') { event.preventDefault(); void submitChoice('skip') }
    if (event.key === '1') {
      event.preventDefault(); savedDivider = dividerPercent; focusedSide = 'left'; setDivider(100)
    }
    if (event.key === '2') {
      event.preventDefault(); savedDivider = dividerPercent; focusedSide = 'right'; setDivider(0)
    }
    if (event.key === 'Enter' && pair) {
      event.preventDefault(); window.open(pair[focusedSide].url, '_blank', 'noopener,noreferrer')
    }
  })
  window.addEventListener('keyup', (event) => {
    if (event.key === '1' || event.key === '2') setDivider(savedDivider)
  })

  async function submitChoice(choice: 'left' | 'right' | 'skip') {
    if (!pair || submitting) return
    submitting = true
    feedbackElement.className = `vote-feedback is-visible feedback-${choice}`
    let formData = new FormData()
    formData.set('pair_id', pair.id)
    formData.set('choice', choice)

    try {
      let response = await fetch(stage?.dataset.voteUrl ?? '', { method: 'POST', body: formData })
      if (!response.ok) throw new Error('Vote failed.')
      let payload = (await response.json()) as PairPayload
      await delay(120)
      if (!payload.pair) {
        window.location.assign(stage?.dataset.rankingUrl ?? '/')
        return
      }
      pair = payload.pair
      preloads = payload.preloads
      feedbackElement.className = 'vote-feedback'
      await loadPair(pair)
      preloadPairs(preloads)
    } catch (error) {
      console.error(error)
      feedbackElement.className = 'vote-feedback'
    } finally {
      submitting = false
    }
  }

  async function loadPair(nextPair: PairData) {
    stage?.classList.add('is-loading')
    setDivider(50)
    leftDomainElement.textContent = nextPair.left.domain
    leftDomainElement.href = nextPair.left.url
    rightDomainElement.textContent = nextPair.right.domain
    rightDomainElement.href = nextPair.right.url
    leftFrameElement.title = `Left: ${nextPair.left.domain}`
    rightFrameElement.title = `Right: ${nextPair.right.domain}`

    let results = await Promise.all([
      preflight(nextPair.left),
      preflight(nextPair.right),
    ])
    let failedIndex = results.findIndex((ready) => !ready)
    if (failedIndex !== -1) {
      await reportRuntimeFailure(failedIndex === 0 ? nextPair.left : nextPair.right)
      return
    }

    await Promise.all([setFrameSource(leftFrameElement, nextPair.left.url), setFrameSource(rightFrameElement, nextPair.right.url)])
    stage?.classList.remove('is-loading')
  }

  async function reportRuntimeFailure(site: SiteData) {
    if (!pair) return
    let formData = new FormData()
    formData.set('pair_id', pair.id)
    formData.set('website_id', site.id)
    let response = await fetch(stage?.dataset.runtimeUrl ?? '', { method: 'POST', body: formData })
    if (!response.ok) throw new Error('Runtime failure could not be recorded.')
    let payload = (await response.json()) as PairPayload
    if (!payload.pair) {
      window.location.assign(stage?.dataset.rankingUrl ?? '/')
      return
    }
    pair = payload.pair
    preloads = payload.preloads
    await loadPair(pair)
    preloadPairs(preloads)
  }

  function preflight(site: SiteData): Promise<boolean> {
    return new Promise((resolve) => {
      let iframe = document.createElement('iframe')
      iframe.tabIndex = -1
      iframe.setAttribute('aria-hidden', 'true')
      iframe.addEventListener('load', () => { iframe.remove(); resolve(true) }, { once: true })
      iframe.addEventListener('error', () => { iframe.remove(); resolve(false) }, { once: true })
      preloadPoolElement.append(iframe)
      iframe.src = site.url
      window.setTimeout(() => { if (iframe.isConnected) { iframe.remove(); resolve(false) } }, 10_000)
    })
  }

  function preloadPairs(pairs: PairData[]) {
    preloadPoolElement.replaceChildren()
    for (let site of pairs.flatMap((candidate) => [candidate.left, candidate.right])) {
      let iframe = document.createElement('iframe')
      iframe.tabIndex = -1
      iframe.setAttribute('aria-hidden', 'true')
      iframe.src = site.url
      preloadPoolElement.append(iframe)
    }
  }

  if (instruction) window.setTimeout(() => instruction.classList.add('is-hidden'), 3_600)
  if (pair) void loadPair(pair).then(() => preloadPairs(preloads))
}

function setFrameSource(frame: HTMLIFrameElement, url: string): Promise<void> {
  return new Promise((resolve) => {
    frame.addEventListener('load', () => resolve(), { once: true })
    frame.src = url
    window.setTimeout(resolve, 5_000)
  })
}

function parseJson<T>(value: string | undefined): T | null {
  if (!value) return null
  try { return JSON.parse(value) as T } catch { return null }
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize, { once: true })
} else {
  initialize()
}
