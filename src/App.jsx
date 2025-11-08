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
      const damping = 0.16
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
  // Shared state via Supabase (polling fallback)
  const [guests, setGuests] = React.useState([])
  const [isLoading, setIsLoading] = React.useState(true)

  // Form state
  const [name, setName] = React.useState('')
  const [dish, setDish] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [rsvp, setRsvp] = React.useState('yes')
  const [query, setQuery] = React.useState('')
  const [cats, setCats] = React.useState([])

  // Party details (host-facing only)
  const [partyName, setPartyName] = React.useState('Dara & Friends Potluck')
  const [partyDateTime, setPartyDateTime] = React.useState('Saturday • 6:00 PM')
  const [partyLocation, setPartyLocation] = React.useState('Our place')
  const [partyNotes, setPartyNotes] = React.useState('Theme: cozy dishes, please label allergens if possible.')

  // Edit state
  const [edit, setEdit] = React.useState(null)
  const [editOpen, setEditOpen] = React.useState(false)

  const headerRef = React.useRef(null)
  const sparkleRef = React.useRef(null)

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
    const id = setInterval(loadGuests, 5000) // 5s polling
    return () => { alive = false; clearInterval(id) }
  }, [loadGuests])

  const nameTaken = React.useMemo(()=> new Set(guests.map(g=> (g.name||'').trim().toLowerCase())), [guests])

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

  async function addGuest(){
    const n = name.trim(), d = dish.trim()
    if(!n || !d){
      alert('Please enter a name and dish.')
      return
    }
    if(nameTaken.has(n.toLowerCase())){
      if(!confirm('Someone with that name is already in the list. Add anyway?')) return
    }

    const newRow = {
      name: n,
      dish: d,
      categories: cats,
      rsvp,
      notes: notes.trim() || null
    }

    // optimistic insert
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
      alert('Could not save guest. Reverting.')
      await loadGuests()
    }else{
      // swap temp id with real id
      setGuests(prev => prev.map(g => g.id === tempId ? data : g))
    }
  }

  function startEdit(g){ setEdit({...g}); setEditOpen(true) }

  async function saveEdit(){
    if(!edit) return
    const payload = {
      name: edit.name.trim(),
      dish: edit.dish.trim(),
      categories: edit.categories || [],
      rsvp: edit.rsvp,
      notes: edit.notes || null
    }

    // optimistic UI
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
      <header ref={headerRef} className="header card header-bounds" id="header">
        <div>
          <h1>Potluck Planner <span ref={sparkleRef} className="sparkle">✨</span></h1>
          <div className="muted">Let's have a party!</div>
        </div>

        <div style={{flex:1}} />

        <div style={{width:'460px', maxWidth:'100%'}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:12, marginBottom:6}}>
            <div style={{fontWeight:600}}>RSVP Summary</div>
            <div className="legend">
              <span className="chip" style={{background:'var(--green-100)', color:'var(--green-700)'}}><span className="dot" style={{background:'var(--green)'}}></span> Yes {rsvpCounts.yes}</span>
              <span className="chip" style={{background:'var(--yellow-100)', color:'var(--yellow-700)'}}><span className="dot" style={{background:'var(--yellow)'}}></span> Maybe {rsvpCounts.maybe}</span>
              <span className="chip" style={{background:'var(--red-100)', color:'var(--red-700)'}}><span className="dot" style={{background:'var(--red)'}}></span> No {rsvpCounts.no}</span>
            </div>
          </div>
          <div className="rsvp-bar">
            <div style={{background:'var(--green)', width:`${yesPct}%`}} />
            <div style={{background:'var(--yellow)', width:`${maybePct}%`}} />
            <div style={{background:'var(--red)', width:`${noPct}%`}} />
          </div>
          <div className="footer-right" style={{marginTop:6}}>
            <span className="total-badge">Total: {totalGuests}</span>
          </div>
        </div>

        <Panda headerRef={headerRef} anchorRef={sparkleRef} />
      </header>

      {/* Party Details */}
      <section className="card party-details">
        <div className="party-details-header">
          <h2 className="party-details-title">🎉 Party Details</h2>
          <div className="party-details-sub muted">Quick host view</div>
        </div>
        <div className="party-details-grid">
          <div className="field">
            <label>Party Name</label>
            <input
              type="text"
              value={partyName}
              onChange={e=>setPartyName(e.target.value)}
              placeholder="Friendsgiving Potluck"
            />
          </div>
          <div className="field">
            <label>Date &amp; Time</label>
            <input
              type="text"
              value={partyDateTime}
              onChange={e=>setPartyDateTime(e.target.value)}
              placeholder="Sat • 6:00 PM"
            />
          </div>
          <div className="field">
            <label>Location / Address</label>
            <input
              type="text"
              value={partyLocation}
              onChange={e=>setPartyLocation(e.target.value)}
              placeholder="123 Party St, Seattle"
            />
          </div>
          <div className="field">
            <label>Notes / Theme</label>
            <input
              type="text"
              value={partyNotes}
              onChange={e=>setPartyNotes(e.target.value)}
              placeholder="Theme, special instructions, dietary notes, etc."
            />
          </div>
        </div>
      </section>

      {/* Search */}
      <section className="search-section">
        <div className="field" style={{ maxWidth: '100%' }}>
          <label htmlFor="search-input">Search dishes / guests</label>
          <input
            id="search-input"
            className="search"
            type="text"
            placeholder="Search dishes or guests…"
            value={query}
            onChange={e=>setQuery(e.target.value)}
          />
        </div>
      </section>

      {/* Stats by Category */}
      <section className="card">
        <div className="grid grid-6">
          {CATEGORIES.map(c => (
            <div key={c} className="card" style={{background:'rgba(255,255,255,.6)'}}>
              <div style={{textAlign:'center'}}>
                <div className="muted" style={{textTransform:'uppercase', fontSize:11}}>{title(c)}</div>
                <div style={{fontSize:20, fontWeight:700}}>{catCounts[c]}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Add Form */}
      <section className="card">
        <div className="row">
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={e=>setName(e.target.value)} type="text" placeholder="e.g., Dara"/>
          </div>
          <div className="field" style={{flex:1.4}}>
            <label>Dish</label>
            <input value={dish} onChange={e=>setDish(e.target.value)} type="text" placeholder="e.g., Strawberry mochi"/>
          </div>
        </div>
        <div className="row" style={{marginTop:10}}>
          <div className="field" style={{flex:'1 1 100%'}}>
            <label>Dish Types (choose multiple)</label>
            <div className="cat-checks">
              {CATEGORIES.map(c => (
                <label key={c} className="cat-check">
                  <input type="checkbox" checked={cats.includes(c)} onChange={()=>toggleCat(c)} /> {title(c)}
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
              placeholder="e.g., For Kiri only, vegan, has plutonium."
            />
          </div>
        </div>
        <div style={{display:'flex', justifyContent:'flex-end', marginTop:10}}>
          <button onClick={addGuest} className="primary">Add</button>
        </div>
      </section>

      {/* List */}
      <section className="card">
        <div className="list">
          {isLoading && <div className="empty">Loading…</div>}
          {!isLoading && filtered.length === 0 && <div className="empty">No guests yet. Add someone above!</div>}
          {!isLoading && filtered.map(g=>(
            <div key={g.id} className="list-row">
              <div className="list-main">
                <div className="list-name">{g.name}</div>
                <div className="muted">{g.dish}</div>
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
                <button className="secondary" onClick={()=>{ setEdit({...g}); setEditOpen(true) }}>Edit</button>
                <button className="ghost" onClick={()=>removeGuest(g.id)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {editOpen && edit && (
        <div className="modal-backdrop" onClick={()=>setEditOpen(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-header">Edit Guest</div>
            <div className="row">
              <div className="field" style={{flex:1}}>
                <label>Name</label>
                <input value={edit?.name||''} onChange={e=>setEdit(prev => ({...prev, name:e.target.value}))} type="text"/>
              </div>
              <div className="field" style={{flex:1}}>
                <label>Dish</label>
                <input value={edit?.dish||''} onChange={e=>setEdit(prev => ({...prev, dish:e.target.value}))} type="text"/>
              </div>
            </div>
            <div className="row" style={{marginTop:10}}>
              <div className="field" style={{flex:'1 1 100%'}}>
                <label>Dish Types</label>
                <div className="cat-checks">
                  {CATEGORIES.map(c => {
                    const has = (edit?.categories||[]).includes(c)
                    return (
                      <label key={c} className="cat-check">
                        <input
                          type="checkbox"
                          checked={has}
                          onChange={e=>{
                            setEdit(prev => {
                              const has = (prev.categories||[]).includes(c)
                              const nextCats = has ? prev.categories.filter(x=>x!==c) : [...(prev.categories||[]), c]
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
                <select value={edit?.rsvp||'yes'} onChange={e=>setEdit(prev => ({...prev, rsvp:e.target.value}))}>
                  <option>yes</option>
                  <option>maybe</option>
                  <option>no</option>
                </select>
              </div>
              <div className="field" style={{flex:1}}>
                <label>Notes</label>
                <input value={edit?.notes||''} onChange={e=>setEdit(prev => ({...prev, notes:e.target.value}))} type="text"/>
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