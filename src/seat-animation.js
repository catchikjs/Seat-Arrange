// 각자의 이동/착석 시간을 독립적으로 정하고 착석 구간이 겹치지 않게 예약합니다.
function attemptPlan(entries, finalStarts, finalSeats, random) {
  const reservations = Array.from({ length: 24 }, () => [])
  const plans = new Map(entries.map(([key]) => [key, []]))
  const pending = entries.map(([key, seat]) => ({ key, seat, start: .1 + random() * .8, step: 0 }))
  for (const event of pending) reservations[event.seat].push([0, event.start])
  for (const [key, seat] of finalSeats) reservations[seat].push([finalStarts.get(key) + 3.2, 24])
  while (pending.length) {
    pending.sort((a, b) => a.start - b.start)
    const event = pending.shift()
    const arrival = event.start + 2.3 + random() * .7
    const nextStart = arrival + .5 + random() * .5
    const until = event.step === 2 ? finalStarts.get(event.key) : nextStart
    const candidates = Array.from({ length: 24 }, (_, i) => i).filter(seat =>
      Math.floor(seat / 4) !== Math.floor(event.seat / 4) &&
      reservations[seat].every(([from, to]) => arrival >= to || until <= from)
    )
    if (!candidates.length) return null
    const seat = candidates[Math.floor(random() * candidates.length)]
    reservations[seat].push([arrival, until])
    plans.get(event.key).push({ seat, start: event.start, arrival, until })
    if (event.step < 2) pending.push({ key: event.key, seat, start: nextStart, step: event.step + 1 })
  }
  return plans
}

export function planTableVisits(entries, finalStarts, finalSeats, random = Math.random) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const plan = attemptPlan(entries, finalStarts, finalSeats, random)
    if (plan) return plan
  }
  throw new Error('Unable to reserve animation seats')
}

// 경로와 도착 시간은 유지하면서 출발과 착석 때 속도를 부드럽게 바꿉니다.
// 중간 프레임은 브라우저가 보간하므로 JavaScript로 매 프레임 좌표를 쓰지 않습니다.
export function sampleMovement(path, start, end) {
  const lengths = [0]
  for (let i = 1; i < path.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y))
  }
  let segment = 1
  return Array.from({ length: 49 }, (_, step) => {
    const progress = step / 48
    const distance = lengths.at(-1) * (1 - Math.cos(Math.PI * progress)) / 2
    while (segment < path.length - 1 && lengths[segment] < distance) segment++
    const from = path[segment - 1]
    const to = path[segment]
    const portion = (distance - lengths[segment - 1]) / (lengths[segment] - lengths[segment - 1] || 1)
    return {
      x: from.x + (to.x - from.x) * portion,
      y: from.y + (to.y - from.y) * portion,
      time: start + (end - start) * progress
    }
  })
}
