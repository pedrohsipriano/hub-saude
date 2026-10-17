// Cartão de compartilhamento do treino no formato story (9:16), desenhado num <canvas>:
// o trajeto (sem as imagens do mapa), o ponto andando até o fim e os números do treino.
// Gera a imagem (PNG) e o vídeo do percurso (MediaRecorder: MP4 quando o navegador grava MP4, senão WebM).
// As cores e a fonte vêm dos tokens do tokens.css.
import { formatDate } from '../utils/format.js'
import { activityType } from '../workouts/activityTypes.js'
import { formatDuration, formatKm, formatPace, formatSpeed } from '../workouts/format.js'
import { trackProjector } from '../workouts/geo.js'
import { cumulativeDistances, easeInOut, routeAtProgress, simplifyForReplay } from '../workouts/replay.js'

const WIDTH = 720
const HEIGHT = 1280
const MARGIN = 60
// Área do desenho do trajeto.
const ROUTE_BOX = { x: MARGIN, y: 290, width: WIDTH - MARGIN * 2, height: 640 }
// Vídeo: animação do percurso + tempo parado no quadro final.
const ANIMATION_MS = 7000
const HOLD_MS = 2000
const FPS = 30
// Formatos de vídeo, do preferido (MP4 abre em mais apps) ao reserva.
const VIDEO_TYPES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']

/** Cores e fonte do tema, lidas dos tokens na hora de desenhar. */
function readTheme() {
  const css = getComputedStyle(document.documentElement)
  const token = (name) => css.getPropertyValue(name).trim()
  return {
    bg: token('--share-bg'),
    bgAlt: token('--share-bg-alt'),
    text: token('--share-text'),
    muted: token('--share-muted'),
    route: token('--color-route'),
    start: token('--tone-excellent'),
    font: token('--font-family'),
  }
}

/** Números do cartão: distância, tempo e ritmo/velocidade (sem GPS: tempo e calorias). */
export function shareStats(workout) {
  const type = activityType(workout.type)
  const stats = []
  if (workout.distanceM > 0) stats.push({ label: 'Distância', value: `${formatKm(workout.distanceM)} km` })
  stats.push({ label: 'Tempo', value: formatDuration(workout.movingTimeMs) })
  if (workout.distanceM > 0) {
    stats.push(
      type.pace
        ? { label: 'Ritmo', value: `${formatPace(workout.paceSecPerKm)} /km` }
        : { label: 'Velocidade', value: `${formatSpeed(workout.avgSpeedMs)} km/h` },
    )
  }
  stats.push({ label: 'Calorias', value: `${workout.calories} kcal` })
  return stats
}

/** Texto que acompanha o arquivo compartilhado. */
export function shareText(workout) {
  const stats = shareStats(workout)
  return `${workout.name}: ${stats.map((stat) => stat.value).join(' · ')} (Hub de Saúde)`
}

/** Dados prontos para desenhar (calculados uma vez por cartão). */
function prepare(workout) {
  const source = workout.snappedPoints?.length > 1 ? workout.snappedPoints : (workout.points ?? [])
  const track = simplifyForReplay(source, 600)
  const hasRoute = track.length > 1
  return {
    workout,
    track,
    hasRoute,
    cumulative: cumulativeDistances(track),
    project: hasRoute ? trackProjector(track, ROUTE_BOX.width, ROUTE_BOX.height, 30) : null,
    stats: shareStats(workout),
    theme: readTheme(),
  }
}

/** Escreve um texto cortando com "…" se não couber na largura. */
function fillTextFit(ctx, text, x, y, maxWidth) {
  let value = text
  while (value.length > 1 && ctx.measureText(value).width > maxWidth) value = value.slice(0, -1)
  ctx.fillText(value === text ? text : `${value.slice(0, -1)}…`, x, y)
}

/** Desenha um trecho do trajeto, um traço por segmento. */
function strokeTrack(ctx, points, toCanvas, color, width) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  points.forEach((point, i) => {
    const [x, y] = toCanvas(point)
    if (i === 0 || points[i - 1].segment !== point.segment) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.stroke()
}

/** Bolinha com borda. */
function dot(ctx, [x, y], radius, fill, border) {
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.lineWidth = 4
  ctx.strokeStyle = border
  ctx.stroke()
}

/** Desenha um quadro do cartão com o percurso em `progress` (0–1). */
function drawFrame(ctx, data, progress) {
  const { theme, workout } = data

  // Fundo em degradê.
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT)
  gradient.addColorStop(0, theme.bg)
  gradient.addColorStop(1, theme.bgAlt)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  // Cabeçalho: app, nome do treino, tipo e data.
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = theme.route
  ctx.font = `600 26px ${theme.font}`
  ctx.fillText('HUB DE SAÚDE', MARGIN, 110)
  ctx.fillStyle = theme.text
  ctx.font = `600 50px ${theme.font}`
  fillTextFit(ctx, workout.name, MARGIN, 180, WIDTH - MARGIN * 2)
  ctx.fillStyle = theme.muted
  ctx.font = `400 28px ${theme.font}`
  ctx.fillText(`${activityType(workout.type).label} · ${formatDate(workout.startedAt)}`, MARGIN, 228)

  // Trajeto: inteiro bem claro ao fundo e, por cima, o trecho já percorrido com o ponto na ponta.
  if (data.hasRoute) {
    const toCanvas = (point) => {
      const { x, y } = data.project(point)
      return [ROUTE_BOX.x + x, ROUTE_BOX.y + y]
    }
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.globalAlpha = 0.3
    strokeTrack(ctx, data.track, toCanvas, theme.muted, 6)
    ctx.globalAlpha = 1
    const { points, head } = routeAtProgress(data.track, easeInOut(progress), data.cumulative)
    strokeTrack(ctx, points, toCanvas, theme.route, 10)
    dot(ctx, toCanvas(data.track[0]), 11, theme.start, theme.text)
    if (head) {
      ctx.shadowColor = theme.route
      ctx.shadowBlur = 30
      dot(ctx, toCanvas(head), 15, theme.text, theme.route)
      ctx.shadowBlur = 0
    }
  } else {
    // Sem GPS: o nome do exercício no lugar do trajeto.
    ctx.textAlign = 'center'
    ctx.fillStyle = theme.route
    ctx.font = `600 72px ${theme.font}`
    ctx.fillText(activityType(workout.type).label, WIDTH / 2, ROUTE_BOX.y + ROUTE_BOX.height / 2)
    ctx.textAlign = 'left'
  }

  // Números em duas colunas.
  const top = 1010
  const columnWidth = (WIDTH - MARGIN * 2) / 2
  data.stats.forEach((stat, i) => {
    const x = MARGIN + (i % 2) * columnWidth
    const y = top + Math.floor(i / 2) * 120
    ctx.fillStyle = theme.muted
    ctx.font = `400 26px ${theme.font}`
    ctx.fillText(stat.label, x, y)
    ctx.fillStyle = theme.text
    ctx.font = `600 54px ${theme.font}`
    fillTextFit(ctx, stat.value, x, y + 58, columnWidth - 20)
  })
}

/** Canvas do tamanho do cartão. */
function createCanvas() {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  return canvas
}

/**
 * Imagem PNG do cartão (trajeto completo).
 * @returns {Promise<Blob>}
 */
export function renderShareImage(workout) {
  const canvas = createCanvas()
  drawFrame(canvas.getContext('2d'), prepare(workout), 1)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível gerar a imagem.'))), 'image/png')
  })
}

/** Formato de vídeo que este navegador grava (null = não grava vídeo de canvas). */
export function videoSupport() {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return null
  return VIDEO_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null
}

/**
 * Grava o vídeo do percurso em tempo real (~9 s): o ponto anda até o fim e o quadro final fica parado.
 * @param {object} workout
 * @param {{ onProgress?: (fraction: number) => void }} [options]
 * @returns {Promise<{ blob: Blob, extension: 'mp4' | 'webm' }>}
 */
export function recordShareVideo(workout, { onProgress } = {}) {
  const mimeType = videoSupport()
  if (!mimeType) return Promise.reject(new Error('este navegador não grava vídeo'))
  const canvas = createCanvas()
  const ctx = canvas.getContext('2d')
  const data = prepare(workout)
  drawFrame(ctx, data, 0)

  const stream = canvas.captureStream(FPS)
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 })
  const chunks = []
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data)
  }

  return new Promise((resolve, reject) => {
    recorder.onerror = (event) => reject(event.error ?? new Error('falha ao gravar o vídeo'))
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop())
      resolve({ blob: new Blob(chunks, { type: mimeType.split(';')[0] }), extension: mimeType.startsWith('video/mp4') ? 'mp4' : 'webm' })
    }
    recorder.start(250)
    const startedAt = performance.now()
    const total = ANIMATION_MS + HOLD_MS
    const tick = (now) => {
      const elapsed = now - startedAt
      drawFrame(ctx, data, Math.min(1, elapsed / ANIMATION_MS))
      onProgress?.(Math.min(1, elapsed / total))
      if (elapsed < total) requestAnimationFrame(tick)
      else recorder.stop()
    }
    requestAnimationFrame(tick)
  })
}
