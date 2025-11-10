import React from 'react'
import { supabase } from './supabaseClient'

const CATEGORIES = ["starter","main","side","dessert","drink","other"]

function title(s){ return s.replace(/\b\w/g, m=>m.toUpperCase()) }

function formatPartyDateTime(value){
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value  // fallback to raw string
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function Panda(){
  const elRef = React.useRef(null)
  const posRef = React.useRef({ x: 0, y: 0 })
  const targetRef = React.useRef({ x: 0, y: 0 })

  React.useEffect(() => {
    const el = elRef.current
    if (!el) return

    const margin = 40

    function randomTarget() {
      const w = window.innerWidth || 800
      const h = window.innerHeight || 600
      return {
        x: margin + Math.random() * Math.max(100, w - margin * 2),
        y: margin + Math.random() * Math.max(100, h - margin * 2),
      }
    }

    // Start somewhere near the middle
    posRef.current = randomTarget()
    targetRef.current = randomTarget()
    el.style.transform = `translate(${posRef.current.x}px,${posRef.current.y}px)`

    let raf

    function step() {
      const { x, y } = posRef.current
      const { x: tx, y: ty } = targetRef.current
      const speed = 0.02 // lower = more floaty

      const nx = x + (tx - x) * speed
      const ny = y + (ty - y) * speed

      posRef.current = { x: nx, y: ny }
      el.style.transform = `translate(${nx}px,${ny}px)`

      const dist = Math.hypot(tx - nx, ty - ny)
      if (dist < 10) {
        targetRef.current = randomTarget()
      }

      raf = requestAnimationFrame(step)
    }

    raf = requestAnimationFrame(step)

    function handleResize() {
      // When screen size changes, pick a new wander target
      targetRef.current = randomTarget()
    }

    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return (
    <div ref={elRef} className="panda">
      <span className="panda-emoji">🐼</span>
    </div>
  )
}

export default function App(){
  // Guests (RSVP rows)
  const [guests, setGuests] = React.useState([])
  const [isLoading, setIsLoading] = React.useState(true)

  // Dishes (child rows per guest)
  const [dishes, setDishes] = React.useState([])

  // Add-entry form state
  const [name, setName] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [rsvp, setRsvp] = React.useState('yes')
  const [query, setQuery] = React.useState('')
  const [addError, setAddError] = React.useState('')

  // Multi-dish input for sign-up
  const [newDishes, setNewDishes] = React.useState([
    { name: '', category: 'main' }
  ])

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
  const [editDishes, setEditDishes] = React.useState([])

  // ---- Load guests ----
  const loadGuests = React.useCallback(async () => {
    const { data, error } = await supabase
      .from('guests')
      .select('*')
      .order('created_at', { ascending: true })
    if (!error) setGuests(data || [])
  }, [])

  // ---- Load dishes ----
  const loadDishes = React.useCallback(async () => {
    const { data, error } = await supabase
      .from('dishes')
      .select('*')
      .order('created_at', { ascending: true })
    if (!error) setDishes(data || [])
  }, [])

  React.useEffect(() => {
    let alive = true
    ;(async () => {
      await Promise.all([loadGuests(), loadDishes()])
      if (alive) setIsLoading(false)
    })()
    const id = setInterval(() => {
      loadGuests()
      loadDishes()
    }, 5000)
    return () => { alive = false; clearInterval(id) }
  }, [loadGuests, loadDishes])

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
    dishes.forEach(d => { m[d.category] = (m[d.category]||0)+1 })
    return m
  }, [dishes])

  // Dishes grouped by category for the "Dishes" section
  const dishesByCategory = React.useMemo(() => {
    const map = {}
    CATEGORIES.forEach(c => { map[c] = [] })
    dishes.forEach(d => {
      if (!map[d.category]) map[d.category] = []
      map[d.category].push(d)
    })
    return map
  }, [dishes])

  // Dishes grouped by guest for list & edit
  const dishesByGuestId = React.useMemo(() => {
    const map = {}
    dishes.forEach(d => {
      if (!map[d.guest_id]) map[d.guest_id] = []
      map[d.guest_id].push(d)
    })
    return map
  }, [dishes])

  // Total *entries* (rows) – used for RSVP percentages
  const totalEntries = guests.length

  const yesPct = totalEntries ? Math.round((rsvpCounts.yes/totalEntries)*100) : 0
  const noPct = totalEntries ? Math.round((rsvpCounts.no/totalEntries)*100) : 0
  const maybePct = totalEntries ? 100 - yesPct - noPct : 0

  // Distinct guests by name – used for "# guests responded"
  const distinctGuests = React.useMemo(() => {
    const set = new Set(
      guests
        .map(g => (g.name || '').trim().toLowerCase())
        .filter(Boolean)
    )
    return set.size
  }, [guests])

  const filtered = React.useMemo(()=>{
    const q = query.trim().toLowerCase()
    const base = guests.slice().sort((a,b)=> (a.name||'').localeCompare(b.name||''))
    if(!q) return base
    return base.filter(g => {
      const guestDishes = dishesByGuestId[g.id] || []
      const dishesStr = guestDishes.map(d => `${d.name} ${d.category}`).join(' ')
      return (g.name||'').toLowerCase().includes(q)
        || dishesStr.toLowerCase().includes(q)
        || (g.rsvp||'').toLowerCase().includes(q)
        || (g.notes||'').toLowerCase().includes(q)
    })
  }, [guests, query, dishesByGuestId])

  function updateNewDishName(index, value){
    setNewDishes(prev => prev.map((d,i) => i === index ? { ...d, name:value } : d))
  }

  function updateNewDishCategory(index, value){
    setNewDishes(prev => prev.map((d,i) => i === index ? { ...d, category:value } : d))
  }

  function addDishRow(){
    setNewDishes(prev => [...prev, { name:'', category:'main' }])
  }

  function removeDishRow(index){
    setNewDishes(prev => prev.length <= 1 ? prev : prev.filter((_,i) => i !== index))
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

    // Try to parse Date/Time and set a proper start/end for Google Calendar
    if (partyDateTime) {
      const start = new Date(partyDateTime)   // works great with datetime-local

      if (!Number.isNaN(start.getTime())) {
        // Default to a 2-hour event
        const end = new Date(start.getTime() + 2 * 60 * 60 * 1000)

        const toCal = (d) => {
          const pad = (n) => String(n).padStart(2, '0')
          const year = d.getUTCFullYear()
          const month = pad(d.getUTCMonth() + 1)
          const day = pad(d.getUTCDate())
          const hours = pad(d.getUTCHours())
          const mins = pad(d.getUTCMinutes())
          const secs = pad(d.getUTCSeconds())
          return `${year}${month}${day}T${hours}${mins}${secs}Z`
        }

        params.set('dates', `${toCal(start)}/${toCal(end)}`)
      }
    }

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

    if(!n){
      setAddError('Please enter a name.')
      return
    }

    if(nameTaken.has(n.toLowerCase())){
      if(!confirm('Someone with that name is already in the list. Add anyway?')) return
    }

    // Clean dishes
    const cleanedDishes = newDishes
      .map(d => ({
        name: d.name.trim(),
        category: d.category
      }))
      .filter(d => d.name)

    const guestRow = {
      name: n,
      rsvp,
      notes: notes.trim() || null
    }

    // Optimistic local add (guest only)
    const tempId = `temp-${Math.random().toString(36).slice(2,10)}`
    setGuests(prev => [...prev, { id: tempId, ...guestRow, created_at: new Date().toISOString() }])

    setName('')
    setNotes('')
    setRsvp('yes')
    setNewDishes([{ name:'', category:'main' }])
    setQuery('')

    // Persist guest
    const { error: guestError, data: guestData } = await supabase
      .from('guests')
      .insert(guestRow)
      .select()
      .single()

    if(guestError || !guestData){
      alert('Could not save entry. Reverting.')
      await Promise.all([loadGuests(), loadDishes()])
      return
    }

    // Replace temp guest with real one
    setGuests(prev => prev.map(g => g.id === tempId ? guestData : g))

    // Persist dishes
    if(cleanedDishes.length){
      const dishRows = cleanedDishes.map(d => ({
        guest_id: guestData.id,
        name: d.name,
        category: d.category
      }))
      const { error: dishError } = await supabase.from('dishes').insert(dishRows)
      if(dishError){
        console.error(dishError)
        alert('Guest saved, but dishes could not be saved.')
      }
    }

    await loadDishes()
  }

  async function saveEdit(){
    if(!edit) return

    const payload = {
      name: edit.name.trim(),
      rsvp: edit.rsvp,
      notes: (edit.notes || '').trim() || null
    }

    // Update guest locally
    setGuests(prev => prev.map(g => g.id === edit.id ? { ...g, ...payload } : g))

    // Clean edit dishes
    const cleaned = (editDishes || [])
      .map(d => ({
        name: (d.name || '').trim(),
        category: d.category || 'other'
      }))
      .filter(d => d.name)

    // Persist guest
    const { error: guestError } = await supabase
      .from('guests')
      .update(payload)
      .eq('id', edit.id)

    if(guestError){
      alert('Update failed. Reverting.')
      await Promise.all([loadGuests(), loadDishes()])
      setEditOpen(false); setEdit(null)
      return
    }

    // Replace dishes by deleting + reinserting
    const { error: delError } = await supabase
      .from('dishes')
      .delete()
      .eq('guest_id', edit.id)

    if(delError){
      console.error(delError)
      alert('Could not update dishes.')
    } else if(cleaned.length){
      const rows = cleaned.map(d => ({
        guest_id: edit.id,
        name: d.name,
        category: d.category
      }))
      const { error: insError } = await supabase
        .from('dishes')
        .insert(rows)
      if(insError){
        console.error(insError)
        alert('Some dishes could not be saved.')
      }
    }

    await Promise.all([loadGuests(), loadDishes()])
    setEditOpen(false); setEdit(null); setEditDishes([])
  }

  async function removeGuest(id){
    const prevGuests = guests
    setGuests(prev => prev.filter(g => g.id !== id))
    const { error } = await supabase.from('guests').delete().eq('id', id)
    if(error){
      alert('Delete failed. Reverting.')
      setGuests(prevGuests)
    }else{
      await Promise.all([loadGuests(), loadDishes()])
    }
  }

  return (
    <div className="container">
      {/* floating panda above everything */}
      <Panda />

      {/* HEADER SUMMARY */}
      <header className="header card header-bounds" id="header">
        <div>
          <h1>
            Potluck Planner <span className="sparkle">✨</span>
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
          <div className="header-items-summary">
            <span className="items-badge">{distinctGuests} guests responded</span>
          </div>
        </div>
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

        {!isEditingDetails && (
          <div className="party-details-body">
            <div className="party-main-line">
              {partyName || <span className="party-placeholder">No party name yet</span>}
            </div>
            <div className="party-meta">
              {partyDateTime
                ? formatPartyDateTime(partyDateTime)
                : <span className="party-placeholder">No date/time set</span>
              }
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
                type="datetime-local"
                value={partyDateTime}
                onChange={e => setPartyDateTime(e.target.value)}
              />
            </div>

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

      {/* DISHES BY CATEGORY */}
      <section className="card dishes-card">
        <div className="section-header-row">
          <h2 className="section-title">Dishes</h2>
          <div className="muted" style={{fontSize:12}}>Quick view of what’s on the table</div>
        </div>
        <div className="grid grid-6 dishes-grid">
          {CATEGORIES.map(c => {
            const items = dishesByCategory[c] || []
            return (
              <div key={c} className="card mini-card dish-column">
                <div className="dish-column-header">{title(c)}</div>
                {items.length === 0 ? (
                  <div className="dish-empty muted">Nothing yet</div>
                ) : (
                  <ul className="dish-list">
                    {items.map((item, idx) => (
                      <li key={item.id || idx}>
                        <span className="dish-name">{item.name}</span>
                        <span className="dish-guest">
                          {' '}
                          · {
                            (guests.find(g => g.id === item.guest_id)?.name) || 'Someone'
                          }
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* SIGN UP FORM */}
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
          <div className="field" style={{maxWidth:180}}>
            <label>RSVP</label>
            <select value={rsvp} onChange={e=>setRsvp(e.target.value)}>
              <option>yes</option>
              <option>maybe</option>
              <option>no</option>
            </select>
          </div>
        </div>

        <div className="row" style={{marginTop:10}}>
          <div className="field" style={{flex:'1 1 100%'}}>
            <label>Notes (optional)</label>
            <input
              value={notes}
              onChange={e=>setNotes(e.target.value)}
              type="text"
            />
          </div>
        </div>

        <div style={{marginTop:12, marginBottom:4, fontSize:12, color:'var(--muted)'}}>
          Dishes you&apos;re bringing (one dish per row)
        </div>

        {newDishes.map((d, index) => (
          <div className="row" key={index}>
            <div className="field" style={{flex:1.4}}>
              <label>{newDishes.length > 1 ? `Dish #${index+1}` : 'Dish'}</label>
              <input
                type="text"
                value={d.name}
                onChange={e=>updateNewDishName(index, e.target.value)}
              />
            </div>
            <div className="field" style={{maxWidth:180}}>
              <label>Dish Type</label>
              <select
                value={d.category}
                onChange={e=>updateNewDishCategory(index, e.target.value)}
              >
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{title(c)}</option>
                ))}
              </select>
            </div>
            {newDishes.length > 1 && (
              <div style={{display:'flex', alignItems:'flex-end'}}>
                <button
                  type="button"
                  className="ghost"
                  onClick={()=>removeDishRow(index)}
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}

        <div style={{display:'flex', justifyContent:'space-between', marginTop:10}}>
          <button type="button" className="secondary" onClick={addDishRow}>
            + Add another dish
          </button>
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
          {!isLoading && filtered.map(g=>{
            const guestDishes = dishesByGuestId[g.id] || []
            return (
              <div key={g.id} className="list-row">
                <div className="list-main">
                  <div className="list-name">{g.name}</div>
                  {guestDishes.length > 0 && (
                    <div className="muted" style={{fontSize:12}}>
                      {guestDishes.map(d => `${d.name} (${title(d.category)})`).join(', ')}
                    </div>
                  )}
                  <div className="muted" style={{fontSize:12}}>
                    RSVP: {g.rsvp}
                    {g.notes ? ` · ${g.notes}` : ''}
                  </div>
                </div>
                <div className="list-actions">
                  <button
                    className="secondary"
                    onClick={()=>{
                      setEdit({...g})
                      const ds = dishesByGuestId[g.id] || []
                      setEditDishes(ds.map(d => ({
                        id: d.id,
                        name: d.name || '',
                        category: d.category || 'other'
                      })))
                      setEditOpen(true)
                    }}
                  >
                    Edit
                  </button>
                  <button className="ghost" onClick={()=>removeGuest(g.id)}>Remove</button>
                </div>
              </div>
            )
          })}
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
            </div>

            <div className="row" style={{marginTop:10}}>
              <div className="field" style={{flex:'1 1 100%'}}>
                <label>Notes</label>
                <input
                  value={edit?.notes||''}
                  onChange={e=>setEdit(prev => ({...prev, notes:e.target.value}))}
                  type="text"
                />
              </div>
            </div>

            <div style={{marginTop:12, marginBottom:4, fontSize:12, color:'var(--muted)'}}>
              Dishes for this guest
            </div>

            {editDishes.map((d, index) => (
              <div className="row" key={d.id || index}>
                <div className="field" style={{flex:1.4}}>
                  <label>{editDishes.length > 1 ? `Dish #${index+1}` : 'Dish'}</label>
                  <input
                    type="text"
                    value={d.name}
                    onChange={e=>{
                      const value = e.target.value
                      setEditDishes(prev => prev.map((x,i) =>
                        i === index ? { ...x, name:value } : x
                      ))
                    }}
                  />
                </div>
                <div className="field" style={{maxWidth:180}}>
                  <label>Dish Type</label>
                  <select
                    value={d.category}
                    onChange={e=>{
                      const value = e.target.value
                      setEditDishes(prev => prev.map((x,i) =>
                        i === index ? { ...x, category:value } : x
                      ))
                    }}
                  >
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{title(c)}</option>
                    ))}
                  </select>
                </div>
                {editDishes.length > 1 && (
                  <div style={{display:'flex', alignItems:'flex-end'}}>
                    <button
                      type="button"
                      className="ghost"
                      onClick={()=>{
                        setEditDishes(prev =>
                          prev.length <= 1 ? prev : prev.filter((_,i) => i !== index)
                        )
                      }}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}

            <div style={{display:'flex', justifyContent:'space-between', marginTop:10}}>
              <button
                type="button"
                className="secondary"
                onClick={()=>setEditDishes(prev => [...prev, { name:'', category:'main' }])}
              >
                + Add dish
              </button>
              <div className="modal-actions" style={{marginTop:0}}>
                <button className="secondary" onClick={()=>{ setEditOpen(false); setEdit(null); setEditDishes([]) }}>
                  Cancel
                </button>
                <button className="primary" onClick={saveEdit}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}