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
