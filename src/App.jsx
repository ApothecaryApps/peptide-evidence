import { useEffect, useMemo, useState } from 'react'
import { PEPTIDES, DIAGNOSES, FREQUENCIES, ROUTES, ASSAYS, DEMO_LOTS } from './catalog'
import { loadState, saveState, mintId, anonymizeProtocols, splitWeeks, gateLots } from './store'
import { LIBRARY } from './library'

const ROLES = [
  { id: 'patient', label: 'Participant' },
  { id: 'physician', label: 'Clinician' },
  { id: 'lab', label: 'Testing lab' },
  { id: 'admin', label: 'Admin' },
]

export default function App() {
  const [state, setState] = useState(loadState)
  const [tab, setTab] = useState('registry')
  const [loginId, setLoginId] = useState('')
  const [loginRole, setLoginRole] = useState('patient')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    saveState(state)
  }, [state])

  const session = state.session
  const myProtocols = state.protocols.filter((p) => p.user_id === session?.user_id)
  const myWeeks = (state.weeks || []).filter((p) => p.user_id === session?.user_id)
  const aggregates = useMemo(() => anonymizeProtocols(state.protocols), [state.protocols])
  const weekSplit = useMemo(() => splitWeeks(state.weeks || []), [state.weeks])
  const lotGate = useMemo(() => gateLots([...DEMO_LOTS, ...state.lots]), [state.lots])
  const lots = [...DEMO_LOTS, ...state.lots]

  function flash(msg) {
    setNotice(msg)
    setTimeout(() => setNotice(''), 3500)
  }

  function enter(existing) {
    const user_id = existing
      ? loginId.trim().toUpperCase()
      : mintId(loginRole === 'lab' ? 'LAB' : loginRole === 'physician' ? 'MD' : loginRole === 'admin' ? 'ADM' : 'PE')
    if (existing && !user_id) return
    setState((s) => ({
      ...s,
      session: { user_id, role: existing ? inferRole(user_id, loginRole) : loginRole },
    }))
    setTab('log')
    flash(existing ? `Signed in as ${user_id}` : `Your ID is ${user_id}. Save it. It is the only key to your data.`)
  }

  function signOut() {
    setState((s) => ({ ...s, session: null }))
    setTab('registry')
  }

  function addProtocol(form) {
    const row = {
      id: crypto.randomUUID(),
      user_id: session.user_id,
      ...form,
      created_at: new Date().toISOString(),
    }
    setState((s) => ({ ...s, protocols: [row, ...s.protocols] }))
    setTab('mine')
    flash('Protocol saved on this device. Nothing identifying was stored.')
  }

  function addWeek(form) {
    const row = {
      id: crypto.randomUUID(),
      user_id: session.user_id,
      ...form,
      created_at: new Date().toISOString(),
    }
    setState((s) => ({ ...s, weeks: [row, ...(s.weeks || [])] }))
    setTab('mine')
    flash('Week saved on this device. No name was stored.')
  }

  function addLot(form) {
    const row = {
      id: crypto.randomUUID(),
      ...form,
      submitted_by: session.user_id,
      status: 'submitted',
      demo: false,
      created_at: new Date().toISOString(),
    }
    setState((s) => ({ ...s, lots: [row, ...s.lots] }))
    setTab('lots')
    flash(
      form.source === 'user_paid'
        ? 'User-paid COA queued as submitted. It stays caveated until documents are checked.'
        : 'Lab report submitted. Attested status comes after the lab is validated.'
    )
  }

  return (
    <div className="app">
      <header className="top">
        <div>
          <p className="kicker">Working title</p>
          <h1>Peptide Evidence</h1>
          <p className="sub">De-identified outcomes + independent lot testing. Not medical advice.</p>
        </div>
        <div className="session">
          {session ? (
            <>
              <span className="pill">{session.role}</span>
              <code>{session.user_id}</code>
              <button className="ghost" onClick={signOut}>Sign out</button>
            </>
          ) : (
            <span className="muted">No session — browse public views</span>
          )}
        </div>
      </header>

      {notice && <div className="toast">{notice}</div>}

      <nav>
        <TabBtn id="registry" tab={tab} setTab={setTab}>Registry</TabBtn>
        <TabBtn id="log" tab={tab} setTab={setTab}>Weekly check-in</TabBtn>
        <TabBtn id="mine" tab={tab} setTab={setTab}>My entries</TabBtn>
        <TabBtn id="lots" tab={tab} setTab={setTab}>Lot potency</TabBtn>
        <TabBtn id="library" tab={tab} setTab={setTab}>Library</TabBtn>
        <TabBtn id="gate" tab={tab} setTab={setTab}>{session ? 'ID card' : 'Get an ID'}</TabBtn>
      </nav>

      <main>
        {tab === 'registry' && (
          <RegistryView
            aggregates={aggregates}
            n={state.protocols.length}
            weekSplit={weekSplit}
            lotGate={lotGate}
          />
        )}
        {tab === 'log' && (
          session ? <WeekForm onSave={addWeek} /> : <NeedId onGo={() => setTab('gate')} />
        )}
        {tab === 'mine' && (
          session ? <MineView rows={myProtocols} weeks={myWeeks} /> : <NeedId onGo={() => setTab('gate')} />
        )}
        {tab === 'lots' && (
          <LotsView
            lots={lots}
            lotGate={lotGate}
            session={session}
            onSubmit={addLot}
            onNeedId={() => setTab('gate')}
          />
        )}
        {tab === 'library' && <LibraryView />}
        {tab === 'gate' && (
          <Gate
            loginId={loginId}
            setLoginId={setLoginId}
            loginRole={loginRole}
            setLoginRole={setLoginRole}
            session={session}
            onCreate={() => enter(false)}
            onReturn={() => enter(true)}
          />
        )}
      </main>

      <footer>
        User-reported outcomes. Lot tests are lab-attested only after a validated lab account exists.
        This v0.1 stores data in your browser so the loop works before Supabase is reconnected.
      </footer>
    </div>
  )
}

function inferRole(id, fallback) {
  if (id.startsWith('LAB-')) return 'lab'
  if (id.startsWith('MD-')) return 'physician'
  if (id.startsWith('ADM-')) return 'admin'
  return fallback
}

function TabBtn({ id, tab, setTab, children }) {
  return (
    <button className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
      {children}
    </button>
  )
}

function NeedId({ onGo }) {
  return (
    <section className="card">
      <h2>You need a user number</h2>
      <p>Protocols are tied only to an ID. No name, email, or phone.</p>
      <button onClick={onGo}>Create or enter ID</button>
    </section>
  )
}

function Gate({ loginId, setLoginId, loginRole, setLoginRole, session, onCreate, onReturn }) {
  return (
    <section className="grid-2">
      <div className="card">
        <h2>New ID</h2>
        <p>This string is your account. Screenshot it. If you lose it, that log is gone.</p>
        <label>Role</label>
        <select value={loginRole} onChange={(e) => setLoginRole(e.target.value)}>
          {ROLES.map((r) => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </select>
        <button onClick={onCreate}>Generate ID</button>
      </div>
      <div className="card">
        <h2>Returning</h2>
        <label>Existing ID</label>
        <input
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          placeholder="PE-7K2N4Q"
        />
        <button className="secondary" onClick={onReturn}>Open this ID</button>
        {session && (
          <p className="hint">Current session: <code>{session.user_id}</code></p>
        )}
      </div>
    </section>
  )
}

function RegistryView({ aggregates, n, weekSplit, lotGate }) {
  return (
    <section>
      <div className="card lead">
        <h2>Two counts, kept apart</h2>
        <p>
          Effectiveness asks if the factor moved a number. Source asks if a lot result held up.
          {n} older protocol log{n === 1 ? '' : 's'} stay on file. Week rows are the new count.
          Left out of the trend: {weekSplit.excluded}. Usable weeks: {weekSplit.usable}.
        </p>
      </div>
      <h2>Effectiveness</h2>
      {weekSplit.rows.length === 0 && (
        <div className="card empty">No week rows yet. A trend shows after 3 weeks where nothing else changed.</div>
      )}
      <div className="stack">
        {weekSplit.rows.map((row) => (
          <article className="card row" key={`${row.peptide}-${row.outcome}`}>
            <header>
              <h3>{row.peptide}</h3>
              <span>{row.outcome}</span>
            </header>
            <dl>
              <div><dt>Nothing else changed</dt><dd>n = {row.cleanN}{row.showTrend ? '' : ' · hidden until 3'}</dd></div>
              <div>
                <dt>Median change, clean weeks</dt>
                <dd>{row.showTrend && row.cleanMedian != null ? row.cleanMedian.toFixed(1) : '—'}</dd>
              </div>
              <div><dt>Something else changed</dt><dd>n = {row.mixedN}</dd></div>
              <div>
                <dt>Median change, mixed weeks</dt>
                <dd>{row.mixedMedian == null ? '—' : row.mixedMedian.toFixed(1)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      <h2>Source</h2>
      <div className="stack">
        {lotGate.trends.map((t) => (
          <article className="card row" key={`${t.peptide}-${t.lot}`}>
            <header>
              <h3>{t.peptide}</h3>
              <span>Lot {t.lot}</span>
            </header>
            <dl>
              <div><dt>Reports</dt><dd>{t.n}</dd></div>
              <div><dt>Independent submitters</dt><dd>{t.independent}</dd></div>
              <div><dt>Count</dt><dd>{t.agreed ? t.verdict : 'single report'}</dd></div>
              <div><dt>Labs</dt><dd>{t.labs.join(', ')}</dd></div>
            </dl>
          </article>
        ))}
      </div>
      <p className="hint">Held out of the source count: {lotGate.held.length}. A fail still shows as one fail. It is a trend only after a second independent result agrees.</p>
      {aggregates.length > 0 && <h2>Older protocol logs</h2>}
      <div className="stack">
        {aggregates.map((row) => (
          <article className="card row" key={`${row.peptide}-${row.diagnosis}`}>
            <header>
              <h3>{row.peptide}</h3>
              <span>{row.diagnosis}</span>
            </header>
            <dl>
              <div><dt>Reports</dt><dd>n = {row.n}</dd></div>
              <div>
                <dt>Mean efficacy</dt>
                <dd>{row.meanRating ? row.meanRating.toFixed(1) + ' / 5' : '—'}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  )
}

const SIDE_EFFECTS = ['nausea', 'injection site', 'sleep change', 'mood', 'appetite crash']
const CHANGES = [
  ['none', 'Nothing else changed'],
  ['diet', 'Diet'],
  ['training', 'Training'],
  ['sleep', 'Sleep'],
  ['supplement', 'New supplement'],
  ['illness', 'Illness or travel'],
]

function WeekForm({ onSave }) {
  const [form, setForm] = useState({
    peptide: 'Tirzepatide',
    outcome: 'Weight',
    dose: '',
    week_of: new Date().toISOString().slice(0, 10),
    baseline: '',
    current: '',
    side_effects: [],
    side_note: '',
    stopped: false,
    changes: ['none'],
  })

  function toggle(list, key, value) {
    const has = form[list].includes(value)
    let next = has ? form[list].filter((x) => x !== value) : [...form[list], value]
    if (list === 'changes' && value === 'none') next = ['none']
    if (list === 'changes' && value !== 'none') next = next.filter((x) => x !== 'none')
    setForm((f) => ({ ...f, [list]: next }))
  }

  function submit(e) {
    e.preventDefault()
    onSave(form)
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Weekly check-in</h2>
      <p className="hint">One number, the dose, side effects, and what else changed. Blank is better than a guess.</p>
      <div className="grid-2">
        <Field label="Peptide">
          <select value={form.peptide} onChange={(e) => setForm({ ...form, peptide: e.target.value })}>
            {PEPTIDES.map((p) => (
              <option key={p.id} value={p.name}>{p.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Outcome being tracked">
          <input value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })} placeholder="Weight, waist, fasting glucose" />
        </Field>
        <Field label="Dose this week">
          <input required value={form.dose} onChange={(e) => setForm({ ...form, dose: e.target.value })} placeholder="2.5 mg" />
        </Field>
        <Field label="Week of">
          <input type="date" value={form.week_of} onChange={(e) => setForm({ ...form, week_of: e.target.value })} />
        </Field>
        <Field label="Baseline number">
          <input value={form.baseline} onChange={(e) => setForm({ ...form, baseline: e.target.value })} placeholder="Starting value" />
        </Field>
        <Field label="This week number">
          <input value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} placeholder="Today's value" />
        </Field>
      </div>
      <Field label="Side effects">
        <div className="checks">
          {SIDE_EFFECTS.map((s) => (
            <label key={s}>
              <input type="checkbox" checked={form.side_effects.includes(s)} onChange={() => toggle('side_effects', 'side_effects', s)} /> {s}
            </label>
          ))}
        </div>
      </Field>
      <Field label="Other effect, or why it was stopped">
        <input value={form.side_note} onChange={(e) => setForm({ ...form, side_note: e.target.value })} />
      </Field>
      <label className="checkline">
        <input type="checkbox" checked={form.stopped} onChange={(e) => setForm({ ...form, stopped: e.target.checked })} /> Stopped early
      </label>
      <Field label="What else changed this week">
        <div className="checks">
          {CHANGES.map(([id, label]) => (
            <label key={id}>
              <input type="checkbox" checked={form.changes.includes(id)} onChange={() => toggle('changes', 'changes', id)} /> {label}
            </label>
          ))}
        </div>
      </Field>
      <button type="submit">Save week</button>
    </form>
  )
}

function ProtocolForm({ onSave }) {
  const [form, setForm] = useState({
    peptide: 'Tirzepatide',
    diagnosis: 'Obesity / weight management',
    dose: '',
    frequency: 'Weekly',
    route: 'Subcutaneous',
    weeks: '',
    status: 'Active',
    start_weight: '',
    current_weight: '',
    start_bf: '',
    current_bf: '',
    start_waist: '',
    current_waist: '',
    labs: '',
    results: '',
    side_effects: '',
    efficacy_rating: '3',
    notes: '',
  })

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function submit(e) {
    e.preventDefault()
    onSave(form)
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Log a protocol</h2>
      <p className="hint">Leave a field blank rather than guessing. Blank is more honest than a fake number.</p>
      <div className="grid-2">
        <Field label="Peptide">
          <select value={form.peptide} onChange={(e) => set('peptide', e.target.value)}>
            {PEPTIDES.map((p) => (
              <option key={p.id} value={p.name}>{p.name} · {p.class}</option>
            ))}
          </select>
        </Field>
        <Field label="Diagnosis / aim">
          <select value={form.diagnosis} onChange={(e) => set('diagnosis', e.target.value)}>
            {DIAGNOSES.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Dose (as written on the vial / pen)">
          <input value={form.dose} onChange={(e) => set('dose', e.target.value)} placeholder="e.g. 2.5 mg" />
        </Field>
        <Field label="Frequency">
          <select value={form.frequency} onChange={(e) => set('frequency', e.target.value)}>
            {FREQUENCIES.map((x) => <option key={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="Route">
          <select value={form.route} onChange={(e) => set('route', e.target.value)}>
            {ROUTES.map((x) => <option key={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="Weeks on protocol">
          <input type="number" min="0" value={form.weeks} onChange={(e) => set('weeks', e.target.value)} />
        </Field>
        <Field label="Status">
          <select value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option>Active</option>
            <option>Completed</option>
            <option>Stopped</option>
          </select>
        </Field>
        <Field label="Efficacy (1–5)">
          <input type="number" min="1" max="5" value={form.efficacy_rating} onChange={(e) => set('efficacy_rating', e.target.value)} />
        </Field>
        <Field label="Start weight">
          <input value={form.start_weight} onChange={(e) => set('start_weight', e.target.value)} />
        </Field>
        <Field label="Current / end weight">
          <input value={form.current_weight} onChange={(e) => set('current_weight', e.target.value)} />
        </Field>
        <Field label="Start body fat %">
          <input value={form.start_bf} onChange={(e) => set('start_bf', e.target.value)} />
        </Field>
        <Field label="Current body fat %">
          <input value={form.current_bf} onChange={(e) => set('current_bf', e.target.value)} />
        </Field>
        <Field label="Start waist">
          <input value={form.start_waist} onChange={(e) => set('start_waist', e.target.value)} />
        </Field>
        <Field label="Current waist">
          <input value={form.current_waist} onChange={(e) => set('current_waist', e.target.value)} />
        </Field>
      </div>
      <Field label="Labs (markers + values, optional)">
        <textarea value={form.labs} onChange={(e) => set('labs', e.target.value)} rows={2} />
      </Field>
      <Field label="Results in your words">
        <textarea value={form.results} onChange={(e) => set('results', e.target.value)} rows={2} />
      </Field>
      <Field label="Side effects (comma separated)">
        <input value={form.side_effects} onChange={(e) => set('side_effects', e.target.value)} placeholder="nausea, fatigue" />
      </Field>
      <Field label="Notes">
        <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} />
      </Field>
      <button type="submit">Save protocol</button>
    </form>
  )
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function MineView({ rows, weeks }) {
  return (
    <section>
      <h2>Your weeks</h2>
      {weeks.length === 0 && <div className="card empty">No week rows yet.</div>}
      <div className="stack">
        {weeks.map((w) => (
          <article className="card" key={w.id}>
            <header className="rowhead">
              <h3>{w.peptide}</h3>
              <span>{w.week_of}</span>
            </header>
            <p>{w.outcome}: {w.baseline || '—'} → {w.current || '—'} · dose {w.dose}</p>
            <p className="se">
              {(w.side_effects || []).join(', ') || 'No side effect checked'}
              {w.stopped ? ' · stopped early' : ''}
            </p>
            <p className="muted">Other changes: {(w.changes || []).join(', ') || 'none tagged'}</p>
          </article>
        ))}
      </div>
      {rows.length > 0 && <h2>Older protocol logs</h2>}
      <div className="stack">
        {rows.map((p) => (
          <article className="card" key={p.id}>
            <header className="rowhead">
              <h3>{p.peptide}</h3>
              <span>{p.status}</span>
            </header>
            <p>{p.diagnosis} · {p.dose || 'dose not entered'}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function LotsView({ lots, lotGate, session, onSubmit, onNeedId }) {
  const [q, setQ] = useState('')
  const [form, setForm] = useState({
    peptide: 'BPC-157',
    vendor: '',
    lot: '',
    lab_name: '',
    method: 'HPLC-UV',
    verdict: 'pass',
    percent: '',
    notes: '',
    source: session?.role === 'lab' ? 'lab' : 'user_paid',
  })
  const filtered = lots.filter((l) => {
    const blob = `${l.peptide} ${l.lot} ${l.vendor} ${l.lab_name}`.toLowerCase()
    return blob.includes(q.toLowerCase())
  })

  function submit(e) {
    e.preventDefault()
    onSubmit(form)
  }

  return (
    <section className="stack">
      <div className="card lead">
        <h2>Lot potency</h2>
        <p>
          A row counts only with a lab name, a lot number, an assay, and a pass or fail.
          A participant report stays unverified until a lab account matches it.
          One fail is one fail. It is a trend only after a second independent result on the same lot agrees.
          Held out: {lotGate.held.length}.
        </p>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search peptide, lot, vendor, lab" />
      </div>

      {filtered.map((lot) => (
        <article className="card lot" key={lot.id}>
          <header className="rowhead">
            <h3>{lot.peptide} · Lot {lot.lot || 'unspecified'}</h3>
            <span className={`tag ${lot.source === 'lab' && String(lot.submitted_by || '').startsWith('LAB') ? 'lab_attested' : 'submitted'}`}>
              {lot.source === 'lab' && String(lot.submitted_by || '').startsWith('LAB') ? 'lab account' : 'unverified'}{lot.demo ? ' · demo' : ''}
            </span>
          </header>
          <p>
            <strong className={lot.verdict === 'pass' ? 'ok' : 'fail'}>{(lot.verdict || '').toUpperCase()}</strong>
            {lot.percent ? ` · ${lot.percent}%` : ''} · {lot.method}
          </p>
          <p>
            Lab: {lot.lab_name} · Vendor: {lot.vendor || 'not named'} · Source: {lot.source === 'user_paid' ? 'user-paid COA' : 'lab'} · Submitted by {lot.submitted_by}
          </p>
          {lot.source === 'user_paid' && (
            <p className="se">
              Caveat: a paid test is one sample. It does not certify the rest of the lot or the next order.
            </p>
          )}
          {lot.notes && <p className="muted">{lot.notes}</p>}
        </article>
      ))}

      <div className="card form">
        <h2>Submit a result</h2>
        {session ? (
          <form onSubmit={submit}>
            <div className="grid-2">
              <Field label="Who is filing this">
                <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                  <option value="user_paid">I paid a lab (participant COA)</option>
                  <option value="lab">I am the testing lab</option>
                </select>
              </Field>
              <Field label="Peptide or blend">
                <input value={form.peptide} onChange={(e) => setForm({ ...form, peptide: e.target.value })} required />
              </Field>
              <Field label="Vendor">
                <input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
              </Field>
              <Field label="Lot / batch">
                <input required value={form.lot} onChange={(e) => setForm({ ...form, lot: e.target.value })} />
              </Field>
              <Field label="Lab name">
                <input required value={form.lab_name} onChange={(e) => setForm({ ...form, lab_name: e.target.value })} placeholder="Who ran the assay" />
              </Field>
              <Field label="Method">
                <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                  {ASSAYS.map((a) => <option key={a}>{a}</option>)}
                </select>
              </Field>
              <Field label="Pass / fail">
                <select value={form.verdict} onChange={(e) => setForm({ ...form, verdict: e.target.value })}>
                  <option value="pass">Pass</option>
                  <option value="fail">Fail</option>
                </select>
              </Field>
              <Field label="Percent (if known)">
                <input value={form.percent} onChange={(e) => setForm({ ...form, percent: e.target.value })} placeholder="98.4" />
              </Field>
            </div>
            <Field label="Notes (sterility, endotoxin, odd peaks, etc.)">
              <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            <p className="hint">Submitted by this session ID: {session.user_id}. Reviewers mark docs_checked or lab_attested later.</p>
            <button type="submit">Submit</button>
          </form>
        ) : (
          <p>
            Need an ID first.
            <button className="linkish" type="button" onClick={onNeedId}>Get an ID</button>
          </p>
        )}
      </div>
    </section>
  )
}

function LibraryView() {
  const [q, setQ] = useState('')
  const rows = LIBRARY.filter((item) => {
    const blob = `${item.creator} ${item.title} ${item.tags.join(' ')}`.toLowerCase()
    return blob.includes(q.toLowerCase())
  })
  return (
    <section className="stack">
      <div className="card lead">
        <h2>Public library</h2>
        <p>
          Links only. We do not copy Skool courses, paywalled posts, or takedown-era transcripts.
          Holyfield’s YouTube is gone (Aug 2026); Rumble and his site are what is still public.
          Creator opinion is tagged as such. Papers are tagged research.
        </p>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search creator, peptide, topic" />
      </div>
      {rows.map((item) => (
        <article className="card" key={item.id}>
          <header className="rowhead">
            <h3>{item.title}</h3>
            <span className="tag">{item.type}</span>
          </header>
          <p>{item.creator} · {item.tags.join(' · ')}</p>
          <p><a href={item.url} target="_blank" rel="noreferrer">{item.url}</a></p>
          <p className="muted">{item.note}</p>
        </article>
      ))}
    </section>
  )
}
