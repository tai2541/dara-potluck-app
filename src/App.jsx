import React from 'react'
import { supabase } from './supabaseClient'

const CATEGORIES = ["starter","main","side","dessert","drink","other"]

function title(s){ return s.replace(/\b\w/g, m=>m.toUpperCase()) }

function Panda({ headerRef, anchorRef }){
  const elRef = React.useRef(null)
  const posRef = React.useRef({ x: 120, y: 60 })
  const targetRef = React.useRef({ x: 120, y: 60 })
  const lastMouseRef = React.useRef(performance.now())

  React.useEffect(()=>{
    const header = headerRef.current
    const anchor = anchorRef.current
    const el = elRef.current
    if(!header || !anchor || !el) return

    const hb = header.getBoundingClientRect()
    const ab = anchor.getBoundingClientRect()
    const initial = {
      x: ab.left - hb.left + ab.width/2,
      y: ab.top - hb.top + ab.height/2
    }
    posRef.current = initial
    targetRef.current = initial
    el.style.transform = `translate(${initial.x}px,${initial.y}px)`

    let raf
    function step(){
      const now = performance.now()
      const dt = Math.min(32, now - lastMouseRef.current)
      const stiffness = 0.0028
      const { x:tx, y:ty } = targetRef.current
      let { x:px, y:py } = posRef.current
      const vx = (tx - px) * stiffness * dt
      const vy = (ty - py) * stiffness * dt
      px += vx
      py += vy
      px += (Math.random()-0.5) * 0.04 * dt
      py += (Math.random()-0.5) * 0.04 * dt
      posRef.current = { x:px, y:py }
      el.style.transform = `translate(${px}px,${py}px)`
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return ()=> cancelAnimationFrame(raf)
  }, [headerRef])

  React.useEffect(()=>{
    const header = headerRef.current
    if(!header) return
    const hb = header.getBoundingClientRect()

    function clamp(v,min,max){ return Math.max(min, Math.min(max,v)) }

    function onMove(e){
      const mx = e.clientX - hb.left
      const my = e.clientY - hb.top
      const { x:px, y:py } = posRef.current
      const dx = px - mx, dy = py - my
      const dist = Math.hypot(dx,dy) || 1
      const threshold = 110
      if(dist < threshold){
        const away = Math.min(70, (threshold - dist) * 0.85)
        let nx = px + (dx/dist)*away
        let ny = py + (dy/dist)*away
        targetRef.current = { x: clamp(nx,24,hb.width-24), y: clamp(ny,24,hb.height-24) }
      }
      lastMouseRef.current = performance.now()
    }
    window.addEventListener('mousemove', onMove)
    return ()=> window.removeEventListener('mousemove', onMove)
  }, [headerRef])

  return <div ref={elRef} className="panda"><span className="panda-emoji">🐼</span></div>
}

export default function App(){
  // Guests state
  const [guests, setGuests] = React.useState([])
  const [isLoading, setIsLoading] = React.useState(true)

  // Add-entry form state
  const [name, setName] = React.useState('')
  const [dish, setDish] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [rsvp, setRsvp] = React.useState('yes')
  const [cats, setCats] = React.useState([])
  const [query, setQuery] = React.useState('')
  const [addError, setAddError] = React.useState('')

  // Party details (persisted via Supabase)
  const [partyId, setPartyId] = React.useState(null)
  const [partyName, setPartyName] = React.useState('')
  const [partyDateTime, setPartyDateTime] = React.useState('')
  const [partyLocation, setPartyLocation] = React.useState('')
  const [partyNotes, setPartyNotes] = React.useState('')
  const [isLoadingDetails, setIsLoadingDetails] = React.useState(true)
  const [isSavingDetails, setIsSavingDetails] = React.useState(false)
  const [isEditingDetails, setIsEditingDetails] = React.useState(false)

  // Edit guest modal
  const [edit, setEdit] = React.useState(null)
  const [editOpen, setEditOpen] = React.useState(false)

  const headerRef = React.useRef(null)
  const sparkleRef = React.useRef(null)

  // ---- Load guests (polling) ----
  const loadGuests = React.useCallback(async () => {
    const { data, error } = await supabase
      .from('guests')
      .select('*')
      .order('created_at', { ascending: true })
    if (!error) setGuests(data || [])
  }, [])

  React.useEffect(() => {
    let alive = true
    ;(async () => {
      await loadGuests()
      if (alive) setIsLoading(false)
    })()
    const id = setInterval(loadGuests, 5000)
    return () => { alive = false; clearInterval(id) }
  }, [loadGuests])

  // ---- Load party details once ----
  React.useEffect(() => {
    let alive = true
    ;(async () => {
      setIsLoadingDetails(true)
      const { data, error } = await supabase
        .from('party_details')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!alive) return
      if (!error && data) {
        setPartyId(data.id)
        setPartyName(data.name || '')
        setPartyDateTime(data.date_time || '')
        setPartyLocation(data.location || '')
        setPartyNotes(data.notes || '')
      }
      setIsLoadingDetails(false)
    })()
    return () => { alive = false }
  }, [])

  const nameTaken = React.useMemo(
    () => new Set(guests.map(g => (g.name || '').trim().toLowerCase())),
    [guests]
  )

  const rsvpCounts = React.useMemo(()=>{
    const m = { yes:0, maybe:0, no:0 }
    guests.forEach(g=> m[g.rsvp] = (m[g.rsvp]||0)+1)
    return m
  }, [guests])

  const catCounts = React.useMemo(()=>{
    const m = { starter:0, main:0, side:0, dessert:0, drink:0, other:0 }
    guests.forEach(g => (g.categories||[]).forEach(c => m[c] = (m[c]||0)+1))
    return m
  }, [guests])

  const totalGuests = guests.length
  const yesPct = totalGuests ? Math.round((rsvpCounts.yes/totalGuests)*100) : 0
  const noPct = totalGuests ? Math.round((rsvpCounts.no/totalGuests)*100) : 0
  const maybePct = totalGuests ? 100 - yesPct - noPct : 0

  const filtered = React.useMemo(()=>{
    const q = query.trim().toLowerCase()
    const base = guests.slice().sort((a,b)=> (a.name||'').localeCompare(b.name||''))
    if(!q) return base
    return base.filter(g => {
      const catsStr = (g.categories||[]).join(' ')
      return (g.name||'').toLowerCase().includes(q)
        || (g.dish||'').toLowerCase().includes(q)
        || catsStr.toLowerCase().includes(q)
        || (g.rsvp||'').toLowerCase().includes(q)
        || (g.notes||'').toLowerCase().includes(q)
    })
  }, [guests, query])

  function toggleCat(c){
    setCats(prev => prev.includes(c) ? prev.filter(x=>x!==c) : [...prev, c])
  }

  // ---- Google Calendar URL (template) ----
  const googleCalendarUrl = React.useMemo(() => {
    const base = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
    const text = partyName || 'Potluck'
    const detailsParts = []

    if (partyNotes) detailsParts.push(partyNotes)
    if (partyDateTime) detailsParts.push(`When: ${partyDateTime}`)
    if (partyLocation) detailsParts.push(`Where: ${partyLocation}`)

    const params = new URLSearchParams()
    params.set('text', text)
    if (detailsParts.length) params.set('details', detailsParts.join('\n'))
    if (partyLocation) params.set('location', partyLocation)

    return `${base}&${params.toString()}`
  }, [partyName, partyDateTime, partyLocation, partyNotes])

  // ---- Save party details ----
  async function savePartyDetails(){
    const payload = {
      name: partyName || null,
      date_time: partyDateTime || null,
      location: partyLocation || null,
      notes: partyNotes || null,
    }

    setIsSavingDetails(true)
    try {
      if (partyId) {
        const { error } = await supabase
          .from('party_details')
          .update(payload)
          .eq('id', partyId)
        if (error) {
          console.error(error)
          alert('Could not save party details.')
          return
        }
      } else {
        const { data, error } = await supabase
          .from('party_details')
          .insert(payload)
          .select()
          .single()
        if (error) {
          console.error(error)
          alert('Could not save party details.')
          return
        } else if (data) {
          setPartyId(data.id)
        }
      }
      setIsEditingDetails(false)
    } finally {
      setIsSavingDetails(false)
    }
  }

  // ---- Add / edit / delete guest ----
  async function addGuest(){
    setAddError('')

    const n = name.trim()
    const d = dish.trim()

    // Only Name is required
    if(!n){
      setAddError('Please enter a name.')
      return
    }

    if(nameTaken.has(n.toLowerCase())){
      if(!confirm('Someone with that name is already in the list. Add anyway?')) return
    }

    const newRow = {
      name: n,
      dish: d || null,               // optional
      categories: cats,              // optional
      rsvp,
      notes: notes.trim() || null    // optional
    }

    const tempId = `temp-${Math.random().toString(36).slice(2,10)}`
    setGuests(prev => [...prev, { id: tempId, ...newRow, created_at: new Date().toISOString() }])
    setName('')
    setDish('')
    setNotes('')
    setRsvp('yes')
    setCats([])
    setQuery('')

    const { error, data } = await supabase.from('guests').insert(newRow).select().single()
    if(error){
      alert('Could not save entry. Reverting.')
      await loadGuests()
    }else{
      setGuests(prev => prev.map(g => g.id === tempId ? data : g))
    }
  }

  async function saveEdit(){
    if(!edit) return
    const payload = {
      name: edit.name.trim(),
      dish: (edit.dish || '').trim() || null,
      categories: edit.categories || [],
      rsvp: edit.rsvp,
      notes: (edit.notes || '').trim() || null
    }

    setGuests(prev => prev.map(g => g.id === edit.id ? { ...g, ...payload } : g))
    setEditOpen(false); setEdit(null)

    const { error } = await supabase.from('guests').update(payload).eq('id', edit.id)
    if(error){
      alert('Update failed. Reverting.')
      loadGuests()
    }else{
      loadGuests()
    }
  }

  async function removeGuest(id){
    const prev = guests
    setGuests(prev => prev.filter(g => g.id !== id))
    const { error } = await supabase.from('guests').delete().eq('id', id)
    if(error){
      alert('Delete failed. Reverting.')
      setGuests(prev)
    }else{
      loadGuests()
    }
  }

  return (
    <div className="container">
      {/* HEADER SUMMARY */}
      <header ref={headerRef} className="header card header-bounds" id="header">
        <div>
          <h1>
            Potluck Planner <span ref={sparkleRef} className="sparkle">✨</span>
          </h1>
        </div>

        <div style={{flex:1}} />

        <div style={{width:'460px', maxWidth:'100%'}}>
          <div className="header-summary-row">
            <div className="header-summary-label">RSVP</div>
            <div className="legend">
              <span className="chip" style={{background:'var(--green-100)', color:'var(--green-700)'}}>
                <span className="dot" style={{background:'var(--green)'}}></span> Yes {rsvpCounts.yes}
              </span>
              <span className="chip" style={{background:'var(--yellow-100)', color:'var(--yellow-700)'}}>
                <span className="dot" style={{background:'var(--yellow)'}}></span> Maybe {rsvpCounts.maybe}
              </span>
              <span className="chip" style={{background:'var(--red-100)', color:'var(--red-700)'}}>
                <span className="dot" style={{background:'var(--red)'}}></span> No {rsvpCounts.no}
              </span>
            </div>
          </div>
          <div className="rsvp-bar">
            <div style={{background:'var(--green)', width:`${yesPct}%`}} />
            <div style={{background:'var(--yellow)', width:`${maybePct}%`}} />
            <div style={{background:'var(--red)', width:`${noPct}%`}} />
          </div>
          {/* Clarified summary label */}
          <div className="header-items-summary">
            <span className="items-badge">{totalGuests} guests responded</span>
          </div>
        </div>

        <Panda headerRef={headerRef} anchorRef={sparkleRef} />
      </header>

      {/* PARTY DETAILS */}
      <section className="card party-details">
        <div className="party-details-header">
          <div>
            <a
              href={googleCalendarUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="calendar-link"
            >
              Add to Google Calendar
            </a>
            {isLoadingDetails && (
              <div className="party-details-sub muted">Loading details…</div>
            )}
          </div>
          <div className="party-details-actions">
            <button
              className="secondary"
              type="button"
              onClick={() => setIsEditingDetails(prev => !prev)}
              disabled={isSavingDetails || isLoadingDetails}
            >
              {isEditingDetails ? 'Cancel' : 'Edit'}
            </button>
            <button
              className="primary"
              type="button"
              onClick={savePartyDetails}
              disabled={isSavingDetails || !isEditingDetails}
            >
              {isSavingDetails ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {/* VIEW MODE – compact summary */}
        {!isEditingDetails && (
          <div className="party-details-body">
            <div className="party-main-line">
              {partyName || <span className="party-placeholder">No party name yet</span>}
            </div>
            <div className="party-meta">
              {partyDateTime || <span className="party-placeholder">No date/time set</span>}
              {(partyDateTime || partyLocation) && ' · '}
              {partyLocation || <span className="party-placeholder">No location added</span>}
            </div>
            {partyNotes && (
              <div className="party-notes">
                {partyNotes}
              </div>
            )}
          </div>
        )}

        {/* EDIT MODE – labeled fields, no placeholders inside inputs */}
        {isEditingDetails && (
          <div className="party-edit-grid">
            <div className="field">
              <label>Party Name</label>
              <input
                type="text"
                value={partyName}
                onChange={e=>setPartyName(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Date/Time</label>
              <input
                type="text"
                value={partyDateTime}
                onChange={e=>setPartyDateTime(e.target.value)}
              />
            </div>

            {/* Location: its own full-width line */}
            <div className="field party-location-field">
              <label>Location</label>
              <input
                type="text"
                value={partyLocation}
                onChange={e=>setPartyLocation(e.target.value)}
              />
            </div>

            <div className="field party-notes-field">
              <label>Notes</label>
              <textarea
                value={partyNotes}
                onChange={e=>setPartyNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
        )}
      </section>

      {/* STATS BY CATEGORY */}
      <section className="card">
        <div className="grid grid-6">
          {CATEGORIES.map(c => (
            <div key={c} className="card mini-card">
              <div style={{textAlign:'center'}}>
                <div className="muted" style={{textTransform:'uppercase', fontSize:11}}>
                  {title(c)}
                </div>
                <div style={{fontSize:20, fontWeight:700}}>{catCounts[c]}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ADD FORM */}
      <section className="card">
        <div className="section-header-row">
          <h2 className="section-title">Sign up</h2>
          {addError && <div className="error-text">{addError}</div>}
        </div>

        <div className="row">
          <div className="field">
            <label>Name (required)</label>
            <input
              value={name}
              onChange={e=>setName(e.target.value)}
              type="text"
            />
          </div>
          <div className="field" style={{flex:1.4}}>
            <label>Dish</label>
            <input
              value={dish}
              onChange={e=>setDish(e.target.value)}
              type="text"
            />
          </div>
        </div>

        <div className="row" style={{marginTop:10}}>
          <div className="field" style={{flex:'1 1 100%'}}>
            <label>Dish Type (optional)</label>
            <div className="cat-checks">
              {CATEGORIES.map(c => (
                <label key={c} className="cat-check">
                  <input
                    type="checkbox"
                    checked={cats.includes(c)}
                    onChange={()=>toggleCat(c)}
                  /> {title(c)}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="row" style={{marginTop:10}}>
          <div className="field" style={{maxWidth:180}}>
            <label>RSVP</label>
            <select value={rsvp} onChange={e=>setRsvp(e.target.value)}>
              <option>yes</option>
              <option>maybe</option>
              <option>no</option>
            </select>
          </div>
          <div className="field" style={{flex:1}}>
            <label>Notes (optional)</label>
            <input
              value={notes}
              onChange={e=>setNotes(e.target.value)}
              type="text"
            />
          </div>
        </div>

        <div style={{display:'flex', justifyContent:'flex-end', marginTop:10}}>
          <button onClick={addGuest} className="primary">Add</button>
        </div>
      </section>

      {/* SEARCH – under form, above list */}
      <section className="search-section card">
        <div className="field" style={{ maxWidth: '100%' }}>
          <label htmlFor="search-input">Search entries</label>
          <input
            id="search-input"
            className="search"
            type="text"
            value={query}
            onChange={e=>setQuery(e.target.value)}
          />
        </div>
      </section>

      {/* LIST */}
      <section className="card">
        <div className="list">
          {isLoading && <div className="empty">Loading…</div>}
          {!isLoading && filtered.length === 0 && (
            <div className="empty">
              Nothing here yet. Sign up above ✨
            </div>
          )}
          {!isLoading && filtered.map(g=>(
            <div key={g.id} className="list-row">
              <div className="list-main">
                <div className="list-name">{g.name}</div>
                {g.dish && <div className="muted">{g.dish}</div>}
                <div className="muted" style={{fontSize:12}}>
                  {g.categories && g.categories.length > 0 && (
                    <>
                      {g.categories.map(c => title(c)).join(', ')}
                      {' · '}
                    </>
                  )}
                  RSVP: {g.rsvp}
                  {g.notes ? ` · ${g.notes}` : ''}
                </div>
              </div>
              <div className="list-actions">
                <button
                  className="secondary"
                  onClick={()=>{ setEdit({...g}); setEditOpen(true) }}
                >
                  Edit
                </button>
                <button className="ghost" onClick={()=>removeGuest(g.id)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {editOpen && edit && (
        <div className="modal-backdrop" onClick={()=>setEditOpen(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-header">Edit Entry</div>
            <div className="row">
              <div className="field" style={{flex:1}}>
                <label>Name</label>
                <input
                  value={edit?.name||''}
                  onChange={e=>setEdit(prev => ({...prev, name:e.target.value}))}
                  type="text"
                />
              </div>
              <div className="field" style={{flex:1}}>
                <label>Dish</label>
                <input
                  value={edit?.dish||''}
                  onChange={e=>setEdit(prev => ({...prev, dish:e.target.value}))}
                  type="text"
                />
              </div>
            </div>
            <div className="row" style={{marginTop:10}}>
              <div className="field" style={{flex:'1 1 100%'}}>
                <label>Dish Type</label>
                <div className="cat-checks">
                  {CATEGORIES.map(c => {
                    const has = (edit?.categories||[]).includes(c)
                    return (
                      <label key={c} className="cat-check">
                        <input
                          type="checkbox"
                          checked={has}
                          onChange={()=>{
                            setEdit(prev => {
                              const hasCurrent = (prev.categories||[]).includes(c)
                              const nextCats = hasCurrent
                                ? prev.categories.filter(x=>x!==c)
                                : [...(prev.categories||[]), c]
                              return { ...prev, categories: nextCats }
                            })
                          }}
                        /> {title(c)}
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="row" style={{marginTop:10}}>
              <div className="field" style={{maxWidth:180}}>
                <label>RSVP</label>
                <select
                  value={edit?.rsvp||'yes'}
                  onChange={e=>setEdit(prev => ({...prev, rsvp:e.target.value}))}
                >
                  <option>yes</option>
                  <option>maybe</option>
                  <option>no</option>
                </select>
              </div>
              <div className="field" style={{flex:1}}>
                <label>Notes</label>
                <input
                  value={edit?.notes||''}
                  onChange={e=>setEdit(prev => ({...prev, notes:e.target.value}))}
                  type="text"
                />
              </div>
            </div>
            <div className="modal-actions">
              <button className="secondary" onClick={()=>setEditOpen(false)}>Cancel</button>
              <button className="primary" onClick={saveEdit}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}