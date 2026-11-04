// 150 BPM의 하프타임 전자 비트: 서브 베이스, 킥, 클랩, 하이햇과 빌드업.
let context
let master
let enabled = true
let voices = []
let cheerBuffer
let cheerLoading
function preloadCheer() {
  cheerLoading ||= fetch(`${import.meta.env.BASE_URL}audio/kids-cheering.mp3`)
    .then(response => { if (!response.ok) throw new Error('Audio unavailable'); return response.arrayBuffer() })
    .then(data => context.decodeAudioData(data))
    .then(buffer => { cheerBuffer = buffer })
    .catch(() => { cheerLoading = null })
}
function playCheer(at) {
  if (!cheerBuffer) return
  const source = context.createBufferSource()
  const gain = context.createGain()
  source.buffer = cheerBuffer
  gain.gain.value = 2
  source.connect(gain)
  gain.connect(master)
  source.start(at)
  voices.push(source)
  source.onended = () => {
    source.disconnect(); gain.disconnect()
    voices = voices.filter(voice => voice !== source)
  }
}

function prepare() {
  const AudioContext = window.AudioContext || window.webkitAudioContext
  if (!AudioContext) return false
  context ||= new AudioContext()
  if (!master) {
    master = context.createGain()
    master.gain.value = enabled ? .22 : 0
    const compressor = context.createDynamicsCompressor()
    compressor.threshold.value = -18
    compressor.ratio.value = 5
    master.connect(compressor)
    compressor.connect(context.destination)
  }
  context.resume().catch(() => {})
  return true
}
function note(frequency, at, duration, volume, type = 'sine', endFrequency) {
  const oscillator = context.createOscillator()
  const envelope = context.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, at)
  if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, at + duration)
  envelope.gain.setValueAtTime(0, at)
  envelope.gain.linearRampToValueAtTime(volume, at + .012)
  envelope.gain.exponentialRampToValueAtTime(.001, at + duration)
  oscillator.connect(envelope)
  envelope.connect(master)
  oscillator.start(at)
  oscillator.stop(at + duration + .02)
  voices.push(oscillator)
  oscillator.onended = () => {
    oscillator.disconnect()
    envelope.disconnect()
    voices = voices.filter(voice => voice !== oscillator)
  }
}
export function stopSound() {
  for (const voice of voices) { try { voice.stop() } catch { /* Already ended. */ } }
  voices = []
}
export function setSoundEnabled(value) {
  enabled = value
  if (master) master.gain.setTargetAtTime(enabled ? .22 : 0, context.currentTime, .03)
}
function percussion(at, duration, volume, highpass) {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const source = context.createBufferSource()
  source.buffer = buffer
  const filter = context.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = highpass
  const gain = context.createGain()
  gain.gain.setValueAtTime(volume, at)
  gain.gain.exponentialRampToValueAtTime(.001, at + duration)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(master)
  source.start(at)
  voices.push(source)
  source.onended = () => {
    source.disconnect(); filter.disconnect(); gain.disconnect()
    voices = voices.filter(voice => voice !== source)
  }
}
function bass(frequency, at, duration) {
  note(frequency, at, duration, .65, 'sine')
  note(frequency * 2, at, duration * .65, .09, 'triangle')
}
export function startSuspense() {
  try {
    if (!prepare()) return
    stopSound()
    preloadCheer()
    const start = context.currentTime + .03
    const beat = .4 // 150 BPM, 15 bars / 24 seconds.
    const roots = [55, 55, 65.41, 49, 55]
    for (let bar = 0; bar < 15; bar++) {
      const base = start + bar * beat * 4
      const root = roots[bar % roots.length]
      for (const hit of [0, 1.75, 2.5, 3.25]) {
        note(155, base + hit * beat, .19, 1.2, 'sine', 42)
        bass(root, base + hit * beat + .035, .25)
      }
      for (const hit of [1, 3]) {
        percussion(base + hit * beat, .15, .65, 1200)
        note(185, base + hit * beat, .08, .18, 'triangle')
      }
      for (let hat = 0; hat < 8; hat++) {
        percussion(base + hat * beat / 2, hat % 2 ? .04 : .065, hat % 2 ? .15 : .25, 7500)
      }
      // 엇박의 짧은 코드 스탭과 마지막 마디의 촘촘한 드럼 롤.
      for (const hit of [.75, 2.25, 3.5]) {
        for (const ratio of [4, 4.7568, 6]) note(root * ratio, base + hit * beat, .13, .09, 'triangle')
      }
      if (bar >= 13) {
        const division = bar === 14 ? 4 : 2
        for (let tick = 0; tick < 4 * division; tick++) {
          percussion(base + tick * beat / division, .055, .1 + tick / (4 * division) * .15, 2200)
        }
      }
    }
    note(220, start + 22.4, 1.5, .08, 'sawtooth', 1760)
  } catch { stopSound() }
}
export function playFinale() {
  try {
    stopSound()
    if (!prepare()) return
    const start = context.currentTime + .02
    playCheer(start + .25)
    // 드롭: 서브 임팩트, 넓게 퍼지는 노이즈 크래시와 짧은 메이저 코드.
    note(170, start, .55, 1.2, 'sine', 35)
    bass(55, start, 1)
    percussion(start, 1.1, .45, 5000)
    ;[220, 277.18, 329.63, 440].forEach(frequency => {
      note(frequency, start, .9, .16, 'triangle')
      note(frequency * 1.004, start + .015, .85, .08, 'triangle')
    })
    ;[660, 880].forEach((frequency, i) => note(frequency, start + .2 + i * .13, .35, .12, 'sine'))
  } catch { stopSound() }
}
