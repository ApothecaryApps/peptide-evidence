const KEY = 'peptide-evidence-v1'

const empty = () => ({
  session: null,
  protocols: [],
  weeks: [],
  lots: [],
})

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return empty()
    return { ...empty(), ...JSON.parse(raw) }
  } catch {
    return empty()
  }
}

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state))
}

export function mintId(prefix) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let body = ''
  for (let i = 0; i < 6; i++) body += alphabet[Math.floor(Math.random() * alphabet.length)]
  return `${prefix}-${body}`
}

export function anonymizeProtocols(protocols) {
  const byKey = {}
  for (const p of protocols) {
    const key = `${p.peptide}||${p.diagnosis}`
    if (!byKey[key]) {
      byKey[key] = {
        peptide: p.peptide,
        diagnosis: p.diagnosis,
        n: 0,
        ratings: [],
        sideEffects: {},
        weightDeltas: [],
        statuses: { Active: 0, Completed: 0, Stopped: 0 },
      }
    }
    const row = byKey[key]
    row.n += 1
    if (p.efficacy_rating) row.ratings.push(Number(p.efficacy_rating))
    if (p.status && row.statuses[p.status] != null) row.statuses[p.status] += 1
    if (p.start_weight && p.current_weight) {
      row.weightDeltas.push(Number(p.current_weight) - Number(p.start_weight))
    }
    const se = (p.side_effects || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    for (const s of se) row.sideEffects[s] = (row.sideEffects[s] || 0) + 1
  }
  return Object.values(byKey)
    .map((r) => ({
      ...r,
      meanRating: r.ratings.length
        ? r.ratings.reduce((a, b) => a + b, 0) / r.ratings.length
        : null,
      medianWeightDelta: median(r.weightDeltas),
      topSideEffects: Object.entries(r.sideEffects)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4),
    }))
    .sort((a, b) => b.n - a.n)
}

function median(arr) {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

const CHANGE_KEYS = ['diet', 'training', 'sleep', 'supplement', 'illness']

export function weekDelta(w) {
  const base = Number(w.baseline)
  const cur = Number(w.current)
  if (!w.baseline || !w.current || Number.isNaN(base) || Number.isNaN(cur)) return null
  return cur - base
}

export function weekProblems(w) {
  const reasons = []
  if (!w.baseline || !w.current) reasons.push('no baseline and current number')
  if (!w.dose) reasons.push('no dose')
  const changes = w.changes || []
  const big = changes.filter((c) => CHANGE_KEYS.includes(c))
  if (big.length >= 2 && !changes.includes('none')) reasons.push('two or more other changes')
  if (w.stopped && !(w.side_effects || []).length && !w.side_note) reasons.push('stopped with no effect noted')
  return reasons
}

export function splitWeeks(weeks) {
  const usable = []
  const excluded = []
  for (const w of weeks) {
    const reasons = weekProblems(w)
    if (reasons.length) excluded.push({ ...w, reasons })
    else usable.push(w)
  }
  const groups = {}
  for (const w of usable) {
    const key = `${w.peptide}||${w.outcome}`
    if (!groups[key]) {
      groups[key] = { peptide: w.peptide, outcome: w.outcome, clean: [], mixed: [] }
    }
    const onlyOne = (w.changes || []).includes('none') || (w.changes || []).length === 0
    ;(onlyOne ? groups[key].clean : groups[key].mixed).push(weekDelta(w))
  }
  const rows = Object.values(groups).map((g) => ({
    ...g,
    cleanN: g.clean.length,
    mixedN: g.mixed.length,
    cleanMedian: median(g.clean),
    mixedMedian: median(g.mixed),
    showTrend: g.clean.length >= 3,
  }))
  return { rows, excluded: excluded.length, usable: usable.length }
}

export function gateLots(lots) {
  const complete = []
  const held = []
  for (const lot of lots) {
    const missing = []
    if (!lot.lab_name) missing.push('lab')
    if (!lot.lot) missing.push('lot')
    if (!lot.method) missing.push('assay')
    if (!lot.verdict) missing.push('result')
    if (missing.length) {
      held.push({ ...lot, hold: `missing ${missing.join(', ')}` })
      continue
    }
    const validated = lot.source === 'lab' && String(lot.submitted_by || '').startsWith('LAB')
    complete.push({ ...lot, validated, hold: validated ? '' : 'unverified until a lab account matches it' })
  }
  const byLot = {}
  for (const lot of complete) {
    const key = `${lot.peptide}||${lot.lot}`.toLowerCase()
    if (!byLot[key]) byLot[key] = []
    byLot[key].push(lot)
  }
  const trends = Object.values(byLot).map((group) => {
    const submitters = new Set(group.map((g) => g.submitted_by))
    const verdicts = new Set(group.map((g) => g.verdict))
    const agreed = submitters.size >= 2 && verdicts.size === 1
    return {
      peptide: group[0].peptide,
      lot: group[0].lot,
      n: group.length,
      independent: submitters.size,
      verdict: agreed ? group[0].verdict : 'single report',
      agreed,
      labs: [...new Set(group.map((g) => g.lab_name))],
    }
  })
  return { complete, held, trends }
}
