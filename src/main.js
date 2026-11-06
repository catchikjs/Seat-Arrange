import './style.css'
import { planTableVisits, sampleMovement } from './seat-animation.js'
import { startSuspense, playFinale, stopSound, setSoundEnabled } from './sound.js'

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
let expanded = false
let fullscreenPending = false
let finishShuffle = null
let previousScroll = { x: 0, y: 0 }
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
function setExpanded(value) {
  if (expanded === value) return
  if (value) previousScroll = { x: window.scrollX, y: window.scrollY }
  expanded = value
  document.body.classList.toggle('presentation-mode', expanded)
  $('#fullscreen-toggle').textContent = expanded ? '⛶ 전체화면 닫기' : '⛶ 전체화면'
  $('#fullscreen-toggle').setAttribute('aria-pressed', String(expanded))
  if (!expanded) {
    window.scrollTo(previousScroll.x, previousScroll.y)
    $('#fullscreen-toggle').focus({ preventScroll: true })
  }
}
$('#sidebar-toggle').onclick = () => {
  const collapsed = document.body.classList.toggle('settings-collapsed')
  $('#class-settings').hidden = collapsed
  $('#sidebar-toggle').textContent = collapsed ? '◧ 명단·제외 보기' : '◧ 명단·제외 접기'
  $('#sidebar-toggle').setAttribute('aria-expanded', String(!collapsed))
}
$('#fullscreen-toggle').onclick = async () => {
  if (fullscreenPending) return
  fullscreenPending = true
  try {
    if (expanded) {
      if (document.fullscreenElement) await document.exitFullscreen()
      setExpanded(false)
    } else {
      setExpanded(true)
      try {
        await document.documentElement.requestFullscreen()
      } catch {
        // 전체화면 API를 지원하지 않거나 차단한 브라우저도 확대 보기를 제공합니다.
      }
    }
  } catch {
    notify('전체화면을 닫으려면 Esc 키를 눌러 주세요.')
  } finally {
    fullscreenPending = false
  }
}
document.addEventListener('fullscreenchange', () => setExpanded(Boolean(document.fullscreenElement)))
let roomWidth = 0
let roomHeight = 0
new ResizeObserver(() => {
  const room = $('#classroom')
  const width = room.clientWidth
  const height = room.clientHeight
  if (width !== roomWidth || height !== roomHeight) {
    // 화면 크기가 바뀌면 진행 중인 추첨을 마무리해 이전 좌표로 움직이지 않게 합니다.
    finishShuffle?.()
    roomWidth = width
    roomHeight = height
    room.style.setProperty('--room-scale', Math.max(.75, Math.min(1.65, width / 960, height / 480)))
  }
}).observe($('#classroom'))
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
      person.setAttribute('aria-hidden', 'true')
      person.append(
        make('span', 'person-arm arm-left'), make('span', 'person-arm arm-right'),
        make('span', 'person-leg leg-left'), make('span', 'person-leg leg-right'),
        make('span', 'person-body'), make('span', 'person-head', '••')
      )
      const defaultName = /^학생\s*\d+$/.test(s.name)
      node.title = `${s.id}번 ${s.name}`
      const badge = make('span', 'student-badge', String(s.id))
      badge.setAttribute('aria-hidden', 'true')
      node.append(badge, person)
      if (!defaultName) node.append(make('span', 'seat-name', s.name))
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
  $('#print').disabled = locked
  $('#sidebar-toggle').disabled = locked
  $('#fullscreen-toggle').disabled = locked && !expanded
  for (const el of document.querySelectorAll('#roster input, #excluded button')) el.disabled = locked
  $('#shuffle').disabled = locked
  $('#stop-shuffle').disabled = !locked
  $('#edit-toggle').disabled = locked
  for (const el of document.querySelectorAll('#add-form input, #add-form button, #exclude-form input, #exclude-form button')) el.disabled = locked
}
$('#stop-shuffle').onclick = () => {
  if (busy) finishShuffle?.(true)
}
$('#shuffle').onclick = async () => {
  if (busy) return
  if (!active().length) return notify('배치할 학생을 먼저 추가해 주세요.')
  busy = true; selected = null; lockControls(true)
  $('#shuffle').textContent = '✦ 이동하는 중…'
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const old = new Map([...$('#students').children].filter(el => el.classList.contains('occupied')).map(el => [el.dataset.key, { rect: el.getBoundingClientRect(), index: Number(el.dataset.index) }]))
  arrange(); renderRoom()
  $('.classroom-shell').classList.add('shuffling')
  $('#classroom').setAttribute('aria-busy', 'true')
  $('#room-status').textContent = '두근두근… 새 자리를 찾고 있어요!'
  const animations = []
  let stageFrame
  let stopped = false
  try {
    const room = $('#classroom').getBoundingClientRect()
    const keys = shuffled([...old.keys()])
    const revealOrder = shuffled([0, 1, 2, 3, 4, 5])
    const events = []
    const later = (seconds, action) => events.push({ time: seconds, action })
    const students = new Map([...document.querySelectorAll('#students .occupied')].map(node => [node.dataset.key, node]))
    $('.room-label').textContent = 'FIND YOUR TEAM'
    $('#room-status').textContent = '어느 테이블이 우리 모둠이 될까요?'
    // 위치를 모두 설정한 뒤 한 번에 측정해 학생마다 화면을 재계산하지 않습니다.
    const probes = Array.from({ length: 24 }, (_, index) => {
      const probe = make('button', 'seat occupied')
      probe.style.visibility = 'hidden'
      const p = position(index)
      probe.style.left = p.left; probe.style.top = p.top
      probe.style.setProperty('--x', `${p.x}px`); probe.style.setProperty('--y', `${p.y}px`)
      probe.dataset.side = index % 4
      return probe
    })
    $('#students').append(...probes)
    const seatCenters = probes.map(probe => {
      const rect = probe.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    })
    probes.forEach(probe => probe.remove())
    const geometry = new Map([...students].map(([key, node]) => [key, {
      rect: node.getBoundingClientRect(), transform: getComputedStyle(node).transform
    }]))
    const finalStart = 12
    const finalMoveDuration = 3.2
    const animationDuration = finalStart + finalMoveDuration
    const finalSeats = new Map([...students].map(([key, node]) => [key, Number(node.dataset.index)]))
    const finalStarts = new Map([...finalSeats.keys()].map(key => [key, finalStart]))
    const visits = planTableVisits(keys.map(key => [key, old.get(key).index]), finalStarts, finalSeats)
    const seatedAt = new Map(keys.map(key => [key, old.get(key).index]))
    const countLabels = [...$('#tables').children].map(table => table.querySelector('.table-count'))
    const refreshCounts = () => {
      const counts = Array(6).fill(0)
      for (const seat of seatedAt.values()) counts[Math.floor(seat / 4)]++
      counts.forEach((count, table) => {
        const label = `${count} / 4`
        if (countLabels[table].textContent !== label) countLabels[table].textContent = label
      })
    }
    for (const [key, itinerary] of visits) {
      for (const visit of itinerary) {
        later(visit.start, () => {
          const node = students.get(key)
          node.classList.remove('trying-seat')
          node.classList.add('walking')
          seatedAt.delete(key)
        })
        later(visit.arrival, () => {
          const node = students.get(key)
          node.classList.remove('walking')
          node.classList.add('trying-seat')
          seatedAt.set(key, visit.seat)
        })
      }
    }
    $('#room-status').textContent = '여러 테이블에 앉아 보며 우리 모둠을 찾아요.'
    for (const table of revealOrder) {
      const members = state.seats.slice(table * 4, table * 4 + 4).filter(id => id !== null)
      const start = finalStart
      members.forEach(id => {
        later(start, () => {
          const node = students.get(`student-${id}`)
          node.classList.remove('trying-seat')
          node.classList.add('walking')
          seatedAt.delete(`student-${id}`)
        })
        later(start + finalMoveDuration, () => {
          const node = students.get(`student-${id}`)
          node.classList.remove('walking')
          node.classList.add('arrived')
          seatedAt.set(`student-${id}`, state.seats.indexOf(id))
        })
      })
      later(start + finalMoveDuration, () => {
        const tableNode = $('#tables').children[table]
        tableNode.classList.add('revealed')
        tableNode.querySelector('.table-count').textContent = `${members.length} / 4`
        $('#room-status').textContent = `${tableNames[table]} 모둠 완성 · ${members.map(id => id + '번').join(', ') || '빈 모둠'}`
      })
    }
    for (const table of $('#tables').children) table.querySelector('.table-count').textContent = '···'
    for (const [key, node] of students) {
      const previous = old.get(key)
      const before = previous.rect
      const { rect: after, transform } = geometry.get(key)
      const cellWidth = room.width / 3
      const cellHeight = room.height / 2
      const destination = Math.floor(Number(node.dataset.index) / 4)
      const center = table => ({ x: room.left + (table % 3 + .5) * cellWidth, y: room.top + (Math.floor(table / 3) + .5) * cellHeight })
      const rx = cellWidth * .4, ry = cellHeight * .36
      const frames = []
      let cursor = { x: before.left + before.width / 2, y: before.top + before.height / 2 }
      let currentTable = Math.floor(previous.index / 4)
      const add = (p, time) => frames.push({ transform: `translate3d(${p.x - after.left - after.width / 2}px, ${p.y - after.top - after.height / 2}px, 0) ${transform}`, offset: time / animationDuration })
      const moveToSeat = (target, table, start, end) => {
        const from = center(currentTable), to = center(table)
        const angleAt = (p, c) => Math.atan2((p.y - c.y) / ry, (p.x - c.x) / rx)
        const entrance = index => Math.floor(index / 3) === 0 ? Math.PI / 2 : -Math.PI / 2
        const arc = (c, first, last) => {
          const turn = ((last - first + Math.PI * 3) % (Math.PI * 2)) - Math.PI
          return Array.from({ length: 16 }, (_, i) => {
            const angle = first + turn * (i + 1) / 16
            return { x: c.x + Math.cos(angle) * rx, y: c.y + Math.sin(angle) * ry }
          })
        }
        const aisleY = room.top + cellHeight
        const path = [cursor,
          ...arc(from, angleAt(cursor, from), entrance(currentTable)),
          { x: from.x, y: aisleY }, { x: to.x, y: aisleY },
          { x: to.x, y: to.y + Math.sin(entrance(table)) * ry },
          ...arc(to, entrance(table), angleAt(target, to)), target
        ]
        sampleMovement(path, start, end).forEach(point => add(point, point.time))
        cursor = target
        currentTable = table
      }
      add(cursor, 0)
      for (const visit of visits.get(node.dataset.key)) {
        moveToSeat(seatCenters[visit.seat], Math.floor(visit.seat / 4), visit.start, visit.arrival)
        add(cursor, visit.until)
      }
      moveToSeat({ x: after.left + after.width / 2, y: after.top + after.height / 2 }, destination, finalStart, animationDuration)
      add(cursor, animationDuration)
      if (!reduced) {
        const animation = new Animation(new KeyframeEffect(node, frames, {
          duration: animationDuration * 1000, easing: 'linear', fill: 'both'
        }), document.timeline)
        animation.currentTime = 0
        animations.push(animation)
      }
    }
    // 이동과 착석 표시가 하나의 시계를 따르게 하고 같은 프레임의 변경은 묶습니다.
    events.sort((a, b) => a.time - b.time)
    startSuspense()
    await new Promise(resolve => {
      let startTime
      let nextEvent = 0
      finishShuffle = (stopRequested = false) => {
        if (stopRequested) {
          stopped = true
          stopSound()
        }
        cancelAnimationFrame(stageFrame)
        animations.forEach(animation => animation.finish())
        resolve()
      }
      const tick = time => {
        if (startTime === undefined) {
          startTime = time
          animations.forEach(animation => { animation.play(); animation.startTime = startTime })
        }
        const elapsed = (time - startTime) / 1000
        let changed = false
        while (nextEvent < events.length && events[nextEvent].time <= elapsed) {
          events[nextEvent++].action()
          changed = true
        }
        if (changed) refreshCounts()
        if (elapsed >= animationDuration) resolve()
        else stageFrame = requestAnimationFrame(tick)
      }
      stageFrame = requestAnimationFrame(tick)
    })
    if (!stopped) playFinale()
    save()
  } catch {
    stopSound()
  } finally {
    finishShuffle = null
    cancelAnimationFrame(stageFrame)
    animations.forEach(animation => animation.cancel())
    document.querySelectorAll('.occupied').forEach(node => node.classList.remove('meeting', 'walking', 'arrived', 'seeking', 'trying-seat'))
    document.querySelectorAll('.revealed').forEach(node => node.classList.remove('revealed'))
    $('.room-label').textContent = 'OUR CLASSROOM'
    $('.classroom-shell').classList.remove('shuffling')
    $('#classroom').setAttribute('aria-busy', 'false')
  }
  busy = false; lockControls(false)
  $('#shuffle').textContent = '⤨ 다시 섞기'
  renderRoster(); renderRoom()
  if (stopped) {
    $('#room-status').textContent = '중지됨 · 최종 배치를 저장했어요'
    $('#shuffle').focus({ preventScroll: true })
    notify('자리 섞기를 중지하고 최종 배치를 표시했어요.')
  } else notify('새로운 자리 배치 완료! 내 모둠을 찾아 이동해 볼까요?')
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
let soundEnabled = true
$('#sound-toggle').onclick = () => {
  soundEnabled = !soundEnabled
  setSoundEnabled(soundEnabled)
  $('#sound-toggle').textContent = soundEnabled ? '♫ 소리 켜짐' : '♫ 소리 꺼짐'
  $('#sound-toggle').setAttribute('aria-pressed', String(soundEnabled))
  $('#sound-toggle').setAttribute('aria-label', soundEnabled ? '배경음과 효과음 끄기' : '배경음과 효과음 켜기')
}
$('#print').onclick = () => window.print()
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return
  if (expanded && !document.fullscreenElement) setExpanded(false)
  selected = null
  if (!busy) renderRoom()
})
update()
