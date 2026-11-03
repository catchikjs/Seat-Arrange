import './style.css'

const $ = (selector) => document.querySelector(selector)
const STORAGE_KEY = 'jarisup-classroom-v1'
const colors = ['#db885e', '#77998c', '#9b8abb', '#ceab55', '#7398b1', '#bd8390']
const tableNames = ['새싹', '햇살', '나무', '바람', '구름', '열매']
// 예외 테이블의 위치: 1행 1열 (0부터 시작하는 인덱스).
const EXCEPTION_TABLE_INDEX = 0
const TABLE_PRIORITY = [1, 2, 3, 4, 5, EXCEPTION_TABLE_INDEX]
const initial = () => ({ students: Array.from({ length: 20 }, (_, i) => ({ id: i + 1, name: `학생${i + 1}`, excluded: false })), seats: Array.from({ length: 24 }, () => null) })
let state = initial()
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
  if (saved && Array.isArray(saved.students) && Array.isArray(saved.seats) && saved.seats.length === 24 && saved.students.every(s => Number.isInteger(s.id) && typeof s.name === 'string' && typeof s.excluded === 'boolean') && new Set(saved.students.map(s => s.id)).size === saved.students.length) state = saved
} catch { /* A fresh classroom works even when browser storage is unavailable. */ }
let editing = false
let selected = null
let busy = false
let timer
const active = () => state.students.filter(s => !s.excluded)
function notify(message) {
  $('#toast').textContent = message
  $('#toast').classList.add('visible')
  clearTimeout(timer)
  timer = setTimeout(() => $('#toast').classList.remove('visible'), 3500)
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { notify('브라우저 저장 공간을 사용할 수 없어 이번 변경은 저장되지 않았어요.') }
}
function shuffled(list) {
  const result = [...list]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
function arrange() {
  const people = shuffled(active())
  state.seats = Array(24).fill(null)
  people.forEach((s, i) => { state.seats[TABLE_PRIORITY[i % 6] * 4 + Math.floor(i / 6)] = s.id })
}
// 인원이 같으면 예외 테이블보다 다른 테이블의 빈자리를 우선합니다.
function nextOpenSeat() {
  const table = [...TABLE_PRIORITY].sort((a, b) =>
    state.seats.slice(a * 4, a * 4 + 4).filter(id => id !== null).length -
    state.seats.slice(b * 4, b * 4 + 4).filter(id => id !== null).length
  )[0]
  return state.seats.findIndex((id, i) => i >= table * 4 && i < table * 4 + 4 && id === null)
}
// Remove stale assignments and fill every active student's seat on startup.
const assigned = state.seats.filter(id => id !== null)
if (assigned.length !== active().length || new Set(assigned).size !== assigned.length || assigned.some(id => !active().some(s => s.id === id))) arrange()

function make(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}
function renderRoster() {
  $('#roster').replaceChildren()
  for (const s of active()) {
    const label = make('label', 'roster-row')
    label.append(make('span', 'student-number', String(s.id).padStart(2, '0')))
    const input = make('input')
    input.value = s.name
    input.maxLength = 16
    input.setAttribute('aria-label', `${s.id}번 이름`)
    input.addEventListener('change', () => {
      s.name = input.value.trim() || `학생${s.id}`
      input.value = s.name
      renderRoom(); save()
    })
    label.append(input, make('span', 'roster-dot', '•'))
    $('#roster').append(label)
  }
  $('#excluded').replaceChildren()
  for (const s of state.students.filter(s => s.excluded)) {
    const chip = make('div', 'excluded-chip')
    chip.append(make('span', '', `${s.id}번 ${s.name}`))
    const restore = make('button', '', '↶')
    restore.type = 'button'
    restore.setAttribute('aria-label', `${s.id}번 복구`)
    restore.disabled = busy
    restore.onclick = () => {
      if (busy) return
      if (active().length >= 24) return notify('배치 정원은 24명이에요. 빈자리가 있어야 복구할 수 있어요.')
      s.excluded = false
      state.seats[nextOpenSeat()] = s.id
      update(); notify(`${s.id}번 학생을 복구했어요.`)
    }
    chip.append(restore); $('#excluded').append(chip)
  }
  $('#roster-count').textContent = `${active().length}명`
  $('#active-count').textContent = `${active().length}명 참여`
}
function position(index) {
  const table = Math.floor(index / 4), side = index % 4
  const offsets = [[0, -64], [78, 0], [0, 64], [-78, 0]]
  return { left: `${(table % 3 + .5) * 100 / 3}%`, top: `${(Math.floor(table / 3) + .5) * 50}%`, x: offsets[side][0], y: offsets[side][1] }
}
function renderRoom() {
  $('#tables').replaceChildren()
  tableNames.forEach((name, i) => {
    const table = make('div', `round-table table-${i}`)
    table.append(make('span', 'table-number', String(i + 1).padStart(2, '0')), make('strong', '', `${name} 모둠`), make('span', 'table-count', `${state.seats.slice(i * 4, i * 4 + 4).filter(id => id !== null).length} / 4`))
    if (i === EXCEPTION_TABLE_INDEX && active().length < 24) {
      table.classList.add('exception-table')
      table.append(make('span', 'exception-label', '소인원 우선 · 1행 1열'))
    }
    $('#tables').append(table)
  })
  const layer = $('#students')
  const existing = new Map([...layer.children].map(el => [el.dataset.key, el]))
  const keep = new Set()
  state.seats.forEach((id, index) => {
    const s = state.students.find(s => s.id === id)
    const key = s ? `student-${id}` : `empty-${index}`
    keep.add(key)
    let node = existing.get(key)
    if (!node) { node = make('button', 'seat'); node.type = 'button'; node.dataset.key = key; layer.append(node) }
    node.replaceChildren()
    node.dataset.index = index
    node.dataset.side = index % 4
    node.className = `seat ${s ? 'occupied' : 'empty'} ${selected === index ? 'selected' : ''}`
    node.draggable = editing && !!s && !busy
    node.setAttribute('aria-label', `${Math.floor(index / 4) + 1}모둠 ${index % 4 + 1}번 자리, ${s ? `${s.id}번 ${s.name}` : '빈자리'}${editing ? ', 선택하여 자리 교환' : ''}`)
    node.setAttribute('aria-pressed', String(selected === index))
    if (s) {
      node.style.setProperty('--shirt', colors[(s.id - 1) % colors.length])
      const person = make('span', `person hair-${s.id % 3}`)
      person.append(make('span', 'person-body'), make('span', 'person-head', '••'))
      const displayName = s.name.replace(/^학생\s+(\d+)$/, '학생$1')
      node.title = `${s.id}번 ${displayName}`
      node.append(person, make('span', 'seat-name', displayName))
    } else node.append(make('span', 'empty-circle', '+'), make('span', 'seat-name', '빈자리'))
    const p = position(index)
    node.style.left = p.left; node.style.top = p.top
    node.style.setProperty('--x', `${p.x}px`); node.style.setProperty('--y', `${p.y}px`)
    node.onclick = () => selectSeat(index)
    node.ondragstart = e => { if (!editing || busy) return e.preventDefault(); e.dataTransfer.setData('text/plain', String(index)); e.dataTransfer.effectAllowed = 'move'; node.classList.add('dragging') }
    node.ondragend = () => node.classList.remove('dragging')
    node.ondragover = e => { if (editing && !busy) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }
    node.ondrop = e => { e.preventDefault(); if (!editing || busy) return; const raw = e.dataTransfer.getData('text/plain'); if (!/^\d+$/.test(raw)) return; const from = Number(raw); if (from >= 0 && from < 24) swap(from, index) }
  })
  for (const [key, node] of existing) if (!keep.has(key)) node.remove()
  $('.classroom-shell').classList.toggle('editing', editing)
  $('#room-status').textContent = busy ? '새 친구를 만나러 이동 중이에요…' : editing ? '수정 중 · 두 자리를 선택해 교환하세요' : active().length ? '모두 자리에 앉았어요' : '학생을 추가해 주세요'
}
function update() { renderRoster(); renderRoom(); save() }
function selectSeat(index) {
  if (!editing || busy) return
  if (selected === null) { selected = index; renderRoom() }
  else if (selected === index) { selected = null; renderRoom() }
  else swap(selected, index)
}
function swap(from, to) {
  ;[state.seats[from], state.seats[to]] = [state.seats[to], state.seats[from]]
  selected = null
  renderRoom(); save()
  if (from !== to) notify('자리를 변경하고 저장했어요.')
}
$('#edit-toggle').onclick = () => {
  if (busy) return
  editing = !editing; selected = null
  $('#edit-toggle').textContent = editing ? '✓ 수정 완료' : '✎ 자리 수정'
  $('#edit-toggle').setAttribute('aria-pressed', String(editing))
  renderRoom()
}
function lockControls(locked) {
  $('#shuffle').disabled = locked
  $('#edit-toggle').disabled = locked
  for (const el of document.querySelectorAll('#add-form input, #add-form button, #exclude-form input, #exclude-form button')) el.disabled = locked
}
$('#shuffle').onclick = async () => {
  if (busy) return
  if (!active().length) return notify('배치할 학생을 먼저 추가해 주세요.')
  busy = true; selected = null; lockControls(true)
  $('#shuffle').textContent = '✦ 이동하는 중…'
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const old = new Map([...$('#students').children].filter(el => el.classList.contains('occupied')).map(el => [el.dataset.key, el.getBoundingClientRect()]))
  arrange(); renderRoom(); save()
  const animations = []
  for (const node of $('#students').children) {
    const before = old.get(node.dataset.key)
    if (!before) continue
    const after = node.getBoundingClientRect()
    const transform = getComputedStyle(node).transform
    animations.push(node.animate([
      { transform: `translate(${before.left - after.left}px, ${before.top - after.top}px) ${transform}` },
      { transform: `translate(${(before.left - after.left) * .4}px, ${(before.top - after.top) * .4 - 22}px) ${transform}`, offset: .55 },
      { transform }
    ], { duration: reduced ? 1 : 1400, delay: reduced ? 0 : Math.random() * 250, easing: 'cubic-bezier(.4,0,.2,1)' }).finished)
  }
  await Promise.allSettled(animations)
  busy = false; lockControls(false)
  $('#shuffle').textContent = '⤨ 다시 섞기'
  renderRoster(); renderRoom()
  notify('새로운 자리 배치 완료! 내 모둠을 찾아 이동해 볼까요?')
}
$('#add-form').onsubmit = e => {
  e.preventDefault()
  if (busy) return
  if (active().length >= 24) return notify('최대 24명까지 배치할 수 있어요.')
  const name = $('#new-name').value.trim()
  if (!name) return notify('전학생 이름을 입력해 주세요.')
  const id = Math.max(0, ...state.students.map(s => s.id)) + 1
  state.students.push({ id, name, excluded: false })
  const seat = nextOpenSeat()
  state.seats[seat] = id
  $('#new-name').value = ''; selected = null; update(); notify(`${id}번 ${name}, 우리 반에 온 걸 환영해요!`)
}
$('#exclude-form').onsubmit = e => {
  e.preventDefault()
  if (busy) return
  const raw = $('#exclude-numbers').value.trim()
  if (!/^\d+(?:[\s,，]+\d+)*$/.test(raw)) return notify('학생 번호를 쉼표나 공백으로 구분해 입력해 주세요.')
  const ids = [...new Set(raw.split(/[\s,，]+/).map(Number))]
  const invalid = ids.filter(id => !state.students.some(s => s.id === id && !s.excluded))
  if (invalid.length) return notify(`${invalid.join(', ')}번은 참여 명단에 없어요. 번호를 확인해 주세요.`)
  for (const id of ids) { state.students.find(s => s.id === id).excluded = true; state.seats = state.seats.map(v => v === id ? null : v) }
  selected = null; $('#exclude-numbers').value = ''; update(); notify(`${ids.join(', ')}번을 명단과 배치에서 제외했어요.`)
}
$('#print').onclick = () => window.print()
document.addEventListener('keydown', e => { if (e.key === 'Escape') { selected = null; renderRoom() } })
update()
