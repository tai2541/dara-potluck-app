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
    if(!header || !anchor) return
    const hb = header.getBoundingClientRect()
    const ab = anchor.getBoundingClientRect()
    const clamp = (v,min,max)=> Math.max(min, Math.min(max,v))
    const x = clamp(ab.left - hb.left + ab.width/2, 24, hb.width-24)
    const y = clamp(ab.top - hb.top + ab.height/2 - 24, 24, Math.max(60, hb.height*0.6))
    const el = elRef.current
    if(el){ el.style.left = x+'px'; el.style.top = y+'px' }
    posRef.current = { x, y }
    targetRef.current = { x, y }
  }, [headerRef, anchorRef])

  React.useEffect(()=>{
    const header = headerRef.current
    if(!header) return
    const clamp = (v,min,max)=> Math.max(min, Math.min(max,v))
    const onMove = (e)=>{
      const hb = header.getBoundingClientRect()
      if(e.clientX < hb.left || e.clientX > hb.right || e.clientY < hb.top || e.clientY > hb.bottom) return
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

  React.useEffect(()=>{
    const header = headerRef.current
    const el = elRef.current
    if(!header || !el) return
    let raf = 0

    const step = ()=>{
      const now = performance.now()
      const idle = now - lastMouseRef.current > 1200
      const hb = header.getBoundingClientRect()
      const width = hb.width, height = hb.height

      if(idle){
        const cx = width * 0.5
        const ax = Math.max(40, Math.min(160, width * 0.18))
        const swayX = cx + Math.sin(now/650) * ax
        const bobY = Math.max(30, Math.min(70, height*0.35)) + Math.sin(now/900) * 8
        targetRef.current = { x: Math.max(24, Math.min(width-24, swayX)), y: Math.max(24, Math.min(height-24, bobY)) }
      }

      const pos = posRef.current
      const tx = targetRef.current.x
      const ty = targetRef.current.y
      const nx = pos.x + (tx - pos.x) * 0.1
      const ny = pos.y + (ty - pos.y) * 0.1

      posRef.current = { x: nx, y: ny }
      el.style.left = nx+'px'
      el.style.top = ny+'px'

      const wiggle = idle ? Math.sin(now/200) * 3 : 0
      const angle = Math.max(-12, Math.min(12, (tx - pos.x)*0.1 + wiggle))
      el.style.transform = `translate(-50%,-50%) rotate(${angle}deg)`

      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return ()=> cancelAnimationFrame(raf)
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
      return (g.name||'').toLowerCase().includes(q) || (g.dish||'').toLowerCase().includes(q) || catsStr.includes(q) || (g.rsvp||'').includes(q)
    })
  }, [guests, query])

  function toggleCat(c){
    setCats(prev => prev.includes(c) ? prev.filter(x=>x!==c) : [...prev, c])
  }

  async function addGuest(){
    const n = name.trim(), d = dish.trim()
    if(!n || !d) return
    if(nameTaken.has(n.toLowerCase())) return

    const newRow = { name:n, dish:d, categories: cats, rsvp, notes: (notes.trim() || null) }
    // optimistic UI
    const tempId = `tmp_${Math.random().toString(36).slice(2,10)}`
    setGuests(prev => [...prev, { id: tempId, ...newRow, created_at: new Date().toISOString() }])
    setName(''); setDish(''); setNotes(''); setRsvp('yes'); setCats([])

    const { error } = await supabase.from('guests').insert(newRow)
    if(error){
      setGuests(prev => prev.filter(g => g.id !== tempId))
      alert('Could not add guest. Try again.')
    }else{
      loadGuests()
    }
  }

  function startEdit(g){ setEdit({...g}); setEditOpen(true) }

  async function saveEdit(){
    if(!edit) return
    const payload = {
      name: (edit.name||'').trim(),
      dish: (edit.dish||'').trim(),
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
              <span className="chip" style={{background:'var(--green-100)', color:'var(--green-700)', border:'1px solid #bbf7d0'}}><span className="dot" style={{background:'var(--green)'}}></span> Yes {rsvpCounts.yes}</span>
              <span className="chip" style={{background:'var(--yellow-100)', color:'var(--yellow-700)', border:'1px solid #fde68a'}}><span className="dot" style={{background:'var(--yellow)'}}></span> Maybe {rsvpCounts.maybe}</span>
              <span className="chip" style={{background:'var(--red-100)', color:'var(--red-700)', border:'1px solid #fecaca'}}><span className="dot" style={{background:'var(--red)'}}></span> No {rsvpCounts.no}</span>
            </div>
          </div>
          <div className="bar">
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
                  <input type="checkbox" checked={cats.includes(c)} onChange={()=>setCats(prev => prev.includes(c) ? prev.filter(x=>x!==c) : [...prev, c])} /> {c}
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
            <input value={notes} onChange={e=>setNotes(e.target.value)} type="text" placeholder="e.g., For Kiri only, vegan, has plutonium."/>
          </div>
          <div style={{display:'flex', gap:8, alignItems:'end'}}>
            <input className="search" type="text" placeholder="Search name, dish, type, RSVP…" value={query} onChange={e=>setQuery(e.target.value)} />
            <button onClick={addGuest} className="primary">Add</button>
          </div>
        </div>
      </section>

      {/* List */}
      <section className="card">
        <div className="list">
          {isLoading && <div className="empty">Loading…</div>}
          {!isLoading && filtered.length === 0 && <div className="empty">No guests yet. Add someone above!</div>}
          {filtered.map(g => (
            <div key={g.id} className="item">
              <div className="left" style={{gap:6}}>
                {(g.categories||[]).map(c => <span key={c} className="badge">{c}</span>)}
                <div>
                  <div className="name">✨ {g.name} <span className="sub">({(g.rsvp||'').toUpperCase()})</span></div>
                  <div className="sub">{g.dish}{g.notes ? ` · ${g.notes}` : ''}</div>
                </div>
              </div>
              <div className="actions">
                <button className="secondary" onClick={()=>{ setEdit({...g}); setEditOpen(true) }}>Edit</button>
                <button className="danger" onClick={()=>removeGuest(g.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Edit modal */}
      {editOpen && (
        <div className="modal-backdrop" onClick={(e)=>{ if(e.target===e.currentTarget) setEditOpen(false) }}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-header">Edit Guest</div>
            <div className="row">
              <div className="field">
                <label>Name</label>
                <input value={edit?.name||''} onChange={e=>setEdit(prev => ({...prev, name:e.target.value}))} type="text"/>
              </div>
              <div className="field">
                <label>Dish</label>
                <input value={edit?.dish||''} onChange={e=>setEdit(prev => ({...prev, dish:e.target.value}))} type="text"/>
              </div>
            </div>
            <div className="row" style={{marginTop:10}}>
              <div className="field" style={{flex:'1 1 100%'}}>
                <label>Dish Types</label>
                <div className="cat-checks">
                  {CATEGORIES.map(c => (
                    <label key={c} className="cat-check">
                      <input
                        type="checkbox"
                        checked={(edit?.categories||[]).includes(c)}
                        onChange={()=> setEdit(prev => {
                          const has = (prev.categories||[]).includes(c)
                          const nextCats = has ? prev.categories.filter(x=>x!==c) : [...(prev.categories||[]), c]
                          return { ...prev, categories: nextCats }
                        })}
                      /> {c}
                    </label>
                  ))}
                </div>
              </div>
              <div className="field" style={{maxWidth:180}}>
                <label>RSVP</label>
                <select value={edit?.rsvp||'yes'} onChange={e=>setEdit(prev => ({...prev, rsvp:e.target.value}))}>
                  <option>yes</option>
                  <option>maybe</option>
                  <option>no</option>
                </select>
              </div>
            </div>
            <div className="row" style={{marginTop:10}}>
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
