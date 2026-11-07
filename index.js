import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import z from '@deepseek-ai/schemastery'

export const name = 'dsh-worklog'
export const inject = ['commands', 'tools']

/** Loader entry id (= profile row id) the settings service keys this plugin's form by. */
const NS = 'dsh-worklog'

/**
 * User-facing preferences. Every field is volatile so the settings page writes
 * live without reloading the plugin.
 */
const PrefsSchema = z.object({
  outputDir: z
    .string()
    .default('')
    .description('台账输出目录；留空则用 ~/.dsh/worklog，支持 ~ 开头'),
  mergeCrossDay: z
    .boolean()
    .default(true)
    .description('周报 / 月报里，同一会话跨天时合并成一行并标注「跨 N 天」'),
  products: z
    .boolean()
    .default(true)
    .description('在台账末尾附「产物」清单：改动最多的文件、新生成的文档、关键命令'),
  autoWeekly: z
    .object({
      enabled: z.boolean().default(false).description('到点自动生成周报（只在本应用运行时生效）'),
      weekday: z.number().min(1).max(7).step(1).default(7).description('周几生成：1=周一 … 7=周日'),
      time: z.string().default('22:00').description('生成时刻，24 小时制 HH:mm'),
    })
    .default({ enabled: false, weekday: 7, time: '22:00' })
    .description('定时生成周报'),
})

const volatile = Object.fromEntries(
  Object.entries(PrefsSchema.dict ?? {}).map(([key, field]) => [
    key,
    typeof field?.volatile === 'function' ? field.volatile() : field,
  ]),
)

/** Loader row Config: the settings page renders these fields. */
export const Config = z.object({ ...volatile })

const MAX_SESSIONS = 200
const EDIT_TOOLS = /^(edit|write|write_file|multi_edit|apply_patch|patch)$/
const CREATE_TOOLS = /^(write|write_file)$/
const SHELL_TOOLS = /^(pwsh|powershell|bash|sh|zsh|cmd|shell)$/
const DOC_EXT = /\.(md|markdown|txt|pdf|docx|pptx|xlsx|csv|html)$/i
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const DEFAULTS = {
  mergeCrossDay: true,
  products: true,
  autoWeekly: { enabled: false, weekday: 7, time: '22:00' },
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function ymd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function mdOf(ms) {
  const d = new Date(ms)
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function hhmm(ms) {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function startOfWeek(d, offsetWeeks = 0) {
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const shift = (base.getDay() + 6) % 7
  base.setDate(base.getDate() - shift + offsetWeeks * 7)
  return base.getTime()
}

function dayRange(date) {
  const start = startOfDay(date)
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime()
  const key = ymd(date)
  return { kind: 'day', key, start, end, heading: `# 工作台账 · ${key}` }
}

function weekRange(now, offsetWeeks) {
  const start = startOfWeek(now, offsetWeeks)
  const end = start + 7 * 86400000
  const monday = new Date(start)
  return {
    kind: 'week',
    key: `week-${ymd(monday)}`,
    start,
    end,
    heading: `# 工作周报 · ${ymd(monday)} ~ ${ymd(new Date(end - 86400000))}`,
  }
}

function monthRange(now, offsetMonths) {
  const first = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + offsetMonths + 1, 1).getTime()
  const key = `month-${first.getFullYear()}-${pad(first.getMonth() + 1)}`
  return {
    kind: 'month',
    key,
    start: first.getTime(),
    end,
    heading: `# 工作月报 · ${first.getFullYear()} 年 ${first.getMonth() + 1} 月`,
  }
}

function parseTarget(input) {
  const raw = String(input ?? '').trim()
  const lower = raw.toLowerCase()
  const now = new Date()
  if (!raw || raw === '今天' || lower === 'today') return dayRange(now)
  if (raw === '昨天' || lower === 'yesterday') {
    const target = new Date(now)
    target.setDate(target.getDate() - 1)
    return dayRange(target)
  }
  if (raw === '本周' || lower === 'week' || lower === 'this-week') return weekRange(now, 0)
  if (raw === '上周' || lower === 'last-week') return weekRange(now, -1)
  if (raw === '本月' || lower === 'month' || lower === 'this-month') return monthRange(now, 0)
  if (raw === '上月' || lower === 'last-month') return monthRange(now, -1)
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw)
  if (m) return dayRange(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  throw new Error(`无法识别的日期「${raw}」，请用 YYYY-MM-DD、today、昨天、本周、上周、本月、上月`)
}

function normalizeTime(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim())
  if (!m) return undefined
  const hour = Number(m[1])
  const minute = Number(m[2])
  if (hour > 23 || minute > 59) return undefined
  return `${pad(hour)}:${pad(minute)}`
}

function defaultDir() {
  return join(homedir(), '.dsh', 'worklog')
}

function expandHome(dir) {
  return String(dir ?? '').replace(/^~(?=$|[\\/])/, homedir())
}

/** Resolve the ledger directory for one prefs snapshot. */
export function outDirFor(config) {
  const configured = typeof config?.outputDir === 'string' ? config.outputDir.trim() : ''
  const dir = configured || process.env.DSH_WORKLOG_DIR || defaultDir()
  return expandHome(dir)
}

/** Fill defaults and drop malformed values from a settings snapshot. */
export function normalizePrefs(raw) {
  const config = {
    outputDir: '',
    mergeCrossDay: DEFAULTS.mergeCrossDay,
    products: DEFAULTS.products,
    autoWeekly: { ...DEFAULTS.autoWeekly },
  }
  if (typeof raw?.outputDir === 'string') config.outputDir = raw.outputDir
  if (typeof raw?.mergeCrossDay === 'boolean') config.mergeCrossDay = raw.mergeCrossDay
  if (typeof raw?.products === 'boolean') config.products = raw.products
  const auto = raw?.autoWeekly
  if (auto && typeof auto === 'object') {
    if (typeof auto.enabled === 'boolean') config.autoWeekly.enabled = auto.enabled
    if (Number.isInteger(auto.weekday) && auto.weekday >= 1 && auto.weekday <= 7) {
      config.autoWeekly.weekday = auto.weekday
    }
    const time = normalizeTime(auto.time)
    if (time) config.autoWeekly.time = time
  }
  return config
}

/** Pre-0.2 preferences lived in `<ledger dir>/config.json`; kept only for migration. */
export function legacyConfigPath() {
  return join(defaultDir(), 'config.json')
}

export function readLegacyConfig() {
  try {
    return JSON.parse(readFileSync(legacyConfigPath(), 'utf8').replace(/^\uFEFF/, ''))
  } catch {
    return undefined
  }
}

export function writeConfig(config) {
  mkdirSync(defaultDir(), { recursive: true })
  writeFileSync(legacyConfigPath(), `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}

function describeConfig(config) {
  const auto = config.autoWeekly
  const when = `${WEEKDAYS[auto.weekday % 7]} ${auto.time}`
  return [
    `台账存放目录：${outDirFor(config)}`,
    `跨天合流：${config.mergeCrossDay ? '开（一次会话一行，标注跨天）' : '关（按天拆行）'}`,
    `产物清单：${config.products ? '开' : '关'}`,
    `周报自动生成：${auto.enabled ? `开（每${when}）` : '关'}`,
    '',
    '改法：设置页「工作台账」里直接改；也可以 /worklog 设置 目录 D:\\我的台账',
    '/worklog 设置 合流 开|关；/worklog 设置 产物 开|关；',
    '/worklog 设置 自动 开|关；/worklog 设置 时间 周日 22:00',
  ].join('\n')
}

/** Turn one `/worklog 设置 …` line into a settings patch. */
export function applySetting(text, config) {
  const rest = text.replace(/^(设置|config|配置)\s*/i, '').trim()
  if (!rest) return { patch: undefined, message: describeConfig(config) }
  const parts = rest.split(/\s+/)
  const key = parts[0].toLowerCase()
  const value = parts.slice(1).join(' ').trim()
  if (key === '目录' || key === '路径' || key === 'dir' || key === 'path') {
    if (!value) return { patch: undefined, message: '用法：/worklog 设置 目录 D:\\我的台账（留空恢复默认）' }
    const next = value === '默认' || value === 'default' ? '' : value
    return {
      patch: { outputDir: next },
      message: `台账目录已改为 ${outDirFor({ ...config, outputDir: next })}。\n\n${describeConfig({ ...config, outputDir: next })}`,
    }
  }
  if (key === '合流' || key === '跨天' || key === 'merge') {
    const on = /^(开|on|true|1|是|打开)$/i.test(value)
    const off = /^(关|off|false|0|否|关闭)$/i.test(value)
    if (!on && !off) return { patch: undefined, message: '用法：/worklog 设置 合流 开|关' }
    config.mergeCrossDay = on
    return { patch: { mergeCrossDay: on }, message: `跨天合流已${on ? '开启' : '关闭'}。\n\n${describeConfig(config)}` }
  }
  if (key === '产物' || key === 'products') {
    const on = /^(开|on|true|1|是|打开)$/i.test(value)
    const off = /^(关|off|false|0|否|关闭)$/i.test(value)
    if (!on && !off) return { patch: undefined, message: '用法：/worklog 设置 产物 开|关' }
    config.products = on
    return { patch: { products: on }, message: `产物清单已${on ? '开启' : '关闭'}。\n\n${describeConfig(config)}` }
  }
  if (key === '自动' || key === 'auto') {
    const on = /^(开|on|true|1|是|打开)$/i.test(value)
    const off = /^(关|off|false|0|否|关闭)$/i.test(value)
    if (!on && !off) return { patch: undefined, message: '用法：/worklog 设置 自动 开|关' }
    config.autoWeekly.enabled = on
    return {
      patch: { autoWeekly: { ...config.autoWeekly, enabled: on } },
      message: `周报自动生成已${on ? '开启' : '关闭'}。\n\n${describeConfig(config)}`,
    }
  }
  if (key === '时间' || key === 'time') {
    const tokens = value.split(/\s+/).filter(Boolean)
    let weekday = config.autoWeekly.weekday
    let timeText = ''
    for (const token of tokens) {
      const weekdayMatch = /^(?:周|星期)?([日天一二三四五六1234567])$/.exec(token)
      const timeMatch = normalizeTime(token)
      if (timeMatch) timeText = timeMatch
      else if (weekdayMatch) weekday = toIsoWeekday(weekdayMatch[1])
      else return { patch: undefined, message: `无法识别「${token}」，用法：/worklog 设置 时间 周日 22:00` }
    }
    if (!timeText) return { patch: undefined, message: '请给出时间，用法：/worklog 设置 时间 周日 22:00' }
    config.autoWeekly.weekday = weekday
    config.autoWeekly.time = timeText
    return {
      patch: { autoWeekly: { ...config.autoWeekly, weekday, time: timeText } },
      message: `周报时间已改为每${WEEKDAYS[weekday % 7]} ${timeText}。\n\n${describeConfig(config)}`,
    }
  }
  return { patch: undefined, message: `不认识的设置项「${parts[0]}」。\n\n${describeConfig(config)}` }
}

function toIsoWeekday(token) {
  if (token === '日' || token === '天' || token === '7') return 7
  if (token === '一' || token === '1') return 1
  if (token === '二' || token === '2') return 2
  if (token === '三' || token === '3') return 3
  if (token === '四' || token === '4') return 4
  if (token === '五' || token === '5') return 5
  if (token === '六' || token === '6') return 6
  return 7
}

function clean(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim()
}

const NOISE = [
  /^<system-reminder>/i,
  /^<acp\b/i,
  /^Current runtime context\./i,
  /^Time sampled while preparing turn/i,
  /^Browser time zone for this request/i,
  /^\[Compressed conversation section\]/i,
  /^\[Per-summary/i,
  /^\[model changed:/i,
  /^background job /i,
  /^The approval policy changed/i,
  /^Elapsed since the preceding/i,
]

function isNoise(text) {
  return NOISE.some((pattern) => pattern.test(text))
}

function clip(s, n) {
  const t = clean(s)
  return t.length > n ? `${t.slice(0, n)}…` : t
}

function blockText(block) {
  if (!block || typeof block !== 'object') return ''
  if (block.type === 'text' && typeof block.text === 'string') return block.text
  return ''
}

function textOf(message) {
  if (!message || typeof message !== 'object') return ''
  if (typeof message.text === 'string') return message.text
  const parts = []
  const list = Array.isArray(message.content) ? message.content : Array.isArray(message.blocks) ? message.blocks : []
  for (const block of list) {
    const t = blockText(block)
    if (t) parts.push(t)
  }
  return parts.join('\n')
}

function argsOf(value) {
  if (value && typeof value === 'object') return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' ? parsed : undefined
    } catch {
      return undefined
    }
  }
  return undefined
}

function fileOfCall(toolName, args) {
  if (!EDIT_TOOLS.test(toolName)) return undefined
  const value = argsOf(args)
  if (!value) return undefined
  const path = value.file_path ?? value.path ?? value.filePath ?? value.target_file ?? value.target
  return typeof path === 'string' && path ? path : undefined
}

function commandOfCall(toolName, args) {
  if (!SHELL_TOOLS.test(toolName)) return undefined
  const value = argsOf(args)
  if (!value) return undefined
  const command = value.command ?? value.cmd ?? value.script
  return typeof command === 'string' && command.trim() ? clean(command) : undefined
}

function summarize(rec, allEvents, window, durableTitle) {
  const header = rec?.header ?? {}
  const cwd = typeof header.cwd === 'string' ? header.cwd : ''
  const requests = []
  const files = new Map()
  const created = new Set()
  const commands = new Map()
  const tools = new Map()
  const interrupts = new Map()
  const days = new Map()
  let turns = 0
  let lastAssistant = ''
  let spanFirst = Number.POSITIVE_INFINITY
  let spanLast = 0
  let first = Number.POSITIVE_INFINITY
  let last = 0
  for (const event of allEvents) {
    if (typeof event?.time !== 'number') continue
    spanFirst = Math.min(spanFirst, event.time)
    spanLast = Math.max(spanLast, event.time)
    if (event.time < window.start || event.time >= window.end) continue
    first = Math.min(first, event.time)
    last = Math.max(last, event.time)
    const dayKey = ymd(new Date(event.time))
    if (!days.has(dayKey)) days.set(dayKey, { key: dayKey, first: event.time, last: event.time, turns: 0 })
    const bucket = days.get(dayKey)
    bucket.first = Math.min(bucket.first, event.time)
    bucket.last = Math.max(bucket.last, event.time)
    const type = event.type
    if (type === 'user/message') {
      const text = clean(textOf(event.data?.message ?? event.data))
      if (text && !isNoise(text)) requests.push(text)
    } else if (type === 'turn/start') {
      turns += 1
      bucket.turns += 1
    } else if (type === 'turn/end') {
      const kind = typeof event.data?.reason?.kind === 'string' ? event.data.reason.kind : 'unknown'
      if (kind !== 'complete' && kind !== 'completed' && kind !== 'done') {
        interrupts.set(kind, (interrupts.get(kind) ?? 0) + 1)
      }
    } else if (type === 'assistant/message') {
      const text = clean(textOf(event.data?.message ?? event.data))
      if (text) lastAssistant = text
    } else if (type === 'tool/call') {
      const toolName = typeof event.data?.name === 'string' ? event.data.name : ''
      if (toolName) tools.set(toolName, (tools.get(toolName) ?? 0) + 1)
      const file = fileOfCall(toolName, event.data?.arguments)
      if (file) {
        files.set(file, (files.get(file) ?? 0) + 1)
        if (CREATE_TOOLS.test(toolName) && DOC_EXT.test(file)) created.add(file)
      }
      const command = commandOfCall(toolName, event.data?.arguments)
      if (command) commands.set(command, (commands.get(command) ?? 0) + 1)
    }
  }
  const title = clean(durableTitle) || clip(requests[0] ?? (turns ? '(仅工具活动)' : '(空会话)'), 48)
  const unique = []
  for (const request of durableTitle ? requests : requests.slice(1)) {
    if (!unique.includes(request)) unique.push(request)
  }
  return {
    cwd,
    title: clip(title, 48),
    requests: unique.slice(0, 3).map((r) => clip(r, 120)),
    files: [...files.entries()],
    created: [...created],
    commands: [...commands.entries()],
    tools: [...tools.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4),
    turns,
    days: [...days.values()].sort((a, b) => a.first - b.first),
    interrupts: [...interrupts.entries()].reduce((sum, [, n]) => sum + n, 0),
    interruptKinds: [...interrupts.entries()].map(([kind, n]) => `${kind} ${n}`),
    lastAssistant: clip(lastAssistant, 160),
    first: Number.isFinite(first) ? first : last,
    last,
    spanFirst: Number.isFinite(spanFirst) ? spanFirst : last,
    spanLast: spanLast || last,
  }
}

function shortPath(p) {
  const parts = String(p).split(/[\\/]/).filter(Boolean)
  return parts.length <= 2 ? p : `…/${parts.slice(-2).join('/')}`
}

function tally(entries, field) {
  const map = new Map()
  for (const entry of entries) {
    for (const [key, count] of entry[field]) map.set(key, (map.get(key) ?? 0) + count)
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1])
}

function uniqueOf(entries, field) {
  const set = new Set()
  for (const entry of entries) for (const item of entry[field]) set.add(item)
  return [...set]
}

function projectSections(entries) {
  const projects = new Map()
  for (const entry of entries) {
    const key = entry.cwd || '(未知工作目录)'
    if (!projects.has(key)) projects.set(key, [])
    projects.get(key).push(entry)
  }
  return [...projects.entries()].sort(
    (a, b) => Math.max(...b[1].map((e) => e.last)) - Math.max(...a[1].map((e) => e.last)),
  )
}

function sessionBlock(lines, entry, target, config) {
  lines.push(`### ${entry.title}`)
  const meta = []
  if (target.kind === 'day') {
    meta.push(`${hhmm(entry.first)}–${hhmm(entry.last)}`)
  } else if (config.mergeCrossDay) {
    const days = entry.days.length
    meta.push(`${mdOf(entry.first)} ${hhmm(entry.first)} → ${mdOf(entry.last)} ${hhmm(entry.last)}`)
    if (days > 1) meta.push(`跨 ${days} 天`)
  } else {
    meta.push(`${entry.days.length} 天`)
  }
  meta.push(`${entry.turns} 轮`)
  if (entry.interrupts) meta.push(`${entry.interrupts} 次中断`)
  const crossing = []
  if (entry.spanFirst < target.start) crossing.push(`始于 ${mdOf(entry.spanFirst)} ${hhmm(entry.spanFirst)}`)
  if (entry.spanLast >= target.end) crossing.push(`延续至 ${mdOf(entry.spanLast)} ${hhmm(entry.spanLast)}`)
  if (crossing.length && !(target.kind !== 'day' && config.mergeCrossDay)) {
    meta.push(`跨天：${crossing.join('，')}`)
  }
  lines.push(`- ${meta.join(' ｜ ')}`)
  if (entry.requests.length) {
    lines.push(`- 需求：${entry.requests.map((r) => `「${r}」`).join('；')}`)
  }
  if (target.kind !== 'day' && !config.mergeCrossDay) {
    for (const day of entry.days) {
      lines.push(`- ${day.key} ${hhmm(day.first)}–${hhmm(day.last)} ｜ ${day.turns} 轮`)
    }
  }
  if (entry.files.length) {
    const top = entry.files
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([f, n]) => `${shortPath(f)}${n > 1 ? `(${n})` : ''}`)
    lines.push(`- 改动：${top.join('、')}${entry.files.length > 8 ? ` 等 ${entry.files.length} 个` : ''}`)
  }
  if (entry.tools.length) {
    lines.push(`- 工具：${entry.tools.map(([t, n]) => `${t} ${n}`).join(' · ')}`)
  }
  if (entry.interruptKinds?.length) lines.push(`- 中断：${entry.interruptKinds.join('、')}`)
  if (entry.lastAssistant) lines.push(`- 最后进展：${entry.lastAssistant}`)
  lines.push('')
}

function productSection(lines, entries) {
  lines.push('## 产物')
  lines.push('')
  for (const [cwd, group] of projectSections(entries)) {
    lines.push(`### ${cwd}`)
    const files = tally(group, 'files').slice(0, 8)
    if (files.length) {
      lines.push(`- 改动最多：${files.map(([f, n]) => `${shortPath(f)}(${n})`).join('、')}`)
    }
    const docs = uniqueOf(group, 'created').slice(0, 8)
    if (docs.length) lines.push(`- 新生成文档：${docs.map((d) => shortPath(d)).join('、')}`)
    const commandMap = new Map()
    for (const entry of group) {
      for (const [command, count] of entry.commands) {
        const label = clip(command, 60)
        commandMap.set(label, (commandMap.get(label) ?? 0) + count)
      }
    }
    const commands = [...commandMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    if (commands.length) {
      lines.push(`- 关键命令：${commands.map(([c, n]) => `${c} ×${n}`).join('；')}`)
    }
    lines.push('')
  }
}

function renderReport(target, entries, config) {
  const sections = projectSections(entries)
  const turns = entries.reduce((sum, e) => sum + e.turns, 0)
  const interrupts = entries.reduce((sum, e) => sum + e.interrupts, 0)
  const files = new Set(entries.flatMap((e) => e.files.map(([f]) => `${e.cwd}|${f}`))).size
  const lines = [target.heading, '']
  const totals = [
    `${sections.length} 个项目`,
    `${entries.length} 个会话`,
    `${turns} 轮`,
    `改动 ${files} 个文件`,
  ]
  if (interrupts) totals.push(`${interrupts} 次中断`)
  totals.push(`生成于 ${hhmm(Date.now())}`)
  lines.push(`> ${totals.join(' ｜ ')}`)
  lines.push('')
  for (const [cwd, group] of sections) {
    const groupTurns = group.reduce((sum, e) => sum + e.turns, 0)
    const groupFiles = new Set(group.flatMap((e) => e.files.map(([f]) => f))).size
    const days = new Set(group.flatMap((e) => e.days.map((d) => d.key))).size
    lines.push(`## ${cwd}`)
    lines.push('')
    lines.push(
      `> ${group.length} 个会话 ｜ ${days} 天 ｜ ${groupTurns} 轮 ｜ 改动 ${groupFiles} 个文件`,
    )
    lines.push('')
    group.sort((a, b) => a.last - b.last)
    for (const entry of group) sessionBlock(lines, entry, target, config)
  }
  if (!entries.length) {
    lines.push('_这段时间没有找到任何会话活动。_')
    lines.push('')
  } else if (config.products) {
    productSection(lines, entries)
  }
  return lines.join('\n')
}

async function generate(sessionQuery, raw, options = {}) {
  const config = normalizePrefs(options.config)
  const target = parseTarget(raw)
  let sessions
  try {
    sessions = await sessionQuery.listSessions()
  } catch (error) {
    throw new Error(`读取会话列表失败：${error instanceof Error ? error.message : String(error)}`)
  }
  const candidates = (Array.isArray(sessions) ? sessions : [])
    .filter((rec) => (rec?.header?.createdAt ?? 0) < target.end)
    .sort((a, b) => (b?.header?.createdAt ?? 0) - (a?.header?.createdAt ?? 0))
    .slice(0, MAX_SESSIONS)
  const entries = []
  for (const rec of candidates) {
    const id = rec?.header?.id ?? rec?.id
    if (!id) continue
    let snapshot
    try {
      snapshot = await sessionQuery.readSession(id)
    } catch {
      continue
    }
    const events = Array.isArray(snapshot?.events) ? snapshot.events : []
    const inWindow = events.some(
      (event) => typeof event?.time === 'number' && event.time >= target.start && event.time < target.end,
    )
    if (!inWindow) continue
    let durableTitle = typeof rec?.header?.title === 'string' ? rec.header.title : ''
    if (!durableTitle) {
      try {
        const titleSnapshot = await sessionQuery.readTitle(id)
        if (titleSnapshot && typeof titleSnapshot.title === 'string') durableTitle = titleSnapshot.title
      } catch {
        durableTitle = ''
      }
    }
    const entry = summarize(rec, events, target, durableTitle)
    if (!entry.requests.length && !entry.turns && !entry.files.length) continue
    entries.push(entry)
  }
  const markdown = renderReport(target, entries, config)
  const dir = outDirFor(config)
  mkdirSync(dir, { recursive: true })
  const filePath = join(dir, `${target.key}.md`)
  writeFileSync(filePath, markdown, 'utf8')
  return {
    path: filePath,
    markdown,
    sessions: entries.length,
    projects: new Set(entries.map((e) => e.cwd || '(未知工作目录)')).size,
    period: target.heading.replace(/^# /, ''),
  }
}

function nextRunAt(auto, from = Date.now()) {
  const m = /^(\d{2}):(\d{2})$/.exec(auto.time)
  const hour = m ? Number(m[1]) : 22
  const minute = m ? Number(m[2]) : 0
  const targetDow = auto.weekday % 7
  const candidate = new Date(from)
  candidate.setHours(hour, minute, 0, 0)
  let guard = 0
  while (candidate.getDay() !== targetDow && guard < 8) {
    candidate.setDate(candidate.getDate() + 1)
    guard += 1
  }
  if (candidate.getTime() <= from) candidate.setDate(candidate.getDate() + 7)
  return candidate.getTime()
}

function preview(result) {
  const body = result.markdown.length > 1600 ? `${result.markdown.slice(0, 1600)}\n…` : result.markdown
  const counts =
    Number.isFinite(result.sessions) && Number.isFinite(result.projects)
      ? `（${result.projects} 个项目 / ${result.sessions} 个会话）`
      : ''
  return `已写入 ${result.path}${counts}\n\n${body}`
}

export function apply(ctx) {
  const sessionQuery = () => ctx.get('sessionQuery')
  const settingsOf = () => {
    const settings = ctx.get('settings')
    return settings && typeof settings.describe === 'function' ? settings : undefined
  }

  let prefs = normalizePrefs(readLegacyConfig())
  let disposeAuto = null
  let migrated = false

  /** Read the live form value for this plugin's Loader row, else the legacy file. */
  function pullPrefs() {
    const settings = settingsOf()
    if (settings) {
      try {
        const descriptor = settings.describe({ redactSecrets: true }).find((item) => item?.ns === NS)
        if (descriptor && descriptor.value !== undefined) {
          prefs = normalizePrefs(descriptor.value)
          if (!migrated) {
            migrated = true
            void migrateLegacy()
          }
          return prefs
        }
      } catch {
        // fall through to the legacy file
      }
    }
    prefs = normalizePrefs(readLegacyConfig())
    return prefs
  }

  /** Write through the settings service; false means "no settings service". */
  async function pushPatch(patch) {
    if (!patch) return true
    const settings = settingsOf()
    if (!settings || typeof settings.update !== 'function') return false
    try {
      await settings.update(NS, patch)
      return true
    } catch {
      return false
    }
  }

  /** Move a pre-0.2 config.json into the settings form, once. */
  async function migrateLegacy() {
    const legacy = readLegacyConfig()
    if (!legacy) return
    const settings = settingsOf()
    if (!settings) return
    let descriptor
    try {
      descriptor = settings.describe({ redactSecrets: true }).find((item) => item?.ns === NS)
    } catch {
      return
    }
    if (!descriptor) return
    const user = descriptor.user
    if (user && typeof user === 'object' && Object.keys(user).length > 0) {
      // 已经在设置页里调过，配置文件只是旧版本残留
      try {
        unlinkSync(legacyConfigPath())
      } catch {
        // ignore
      }
      return
    }
    const patch = {}
    if (typeof legacy.outputDir === 'string') patch.outputDir = legacy.outputDir
    if (typeof legacy.mergeCrossDay === 'boolean') patch.mergeCrossDay = legacy.mergeCrossDay
    if (typeof legacy.products === 'boolean') patch.products = legacy.products
    if (legacy.autoWeekly && typeof legacy.autoWeekly === 'object') patch.autoWeekly = legacy.autoWeekly
    if (Object.keys(patch).length && (await pushPatch(patch))) {
      pullPrefs()
      try {
        unlinkSync(legacyConfigPath())
      } catch {
        // ignore
      }
    }
  }

  function scheduleAuto() {
    if (typeof disposeAuto === 'function') disposeAuto()
    disposeAuto = null
    const config = prefs
    if (!config.autoWeekly.enabled) return
    const timer = ctx.get('timer')
    if (!timer) return
    const at = nextRunAt(config.autoWeekly)
    const delay = Math.min(Math.max(at - Date.now(), 1000), 2147483647)
    disposeAuto = timer.timeout(() => {
      const run = async () => {
        try {
          const query = ctx.get('sessionQuery')
          if (!query) return
          const fireDay = new Date(at)
          const scope = fireDay.getDay() === 1 ? '上周' : '本周'
          await generate(query, scope, { config: pullPrefs() })
        } catch {
          // 自动生成失败不打断宿主，等下一轮
        } finally {
          scheduleAuto()
        }
      }
      run()
    }, delay)
  }

  ctx.commands.register({
    name: 'worklog',
    description:
      '生成工作台账：今天/昨天/某天/本周/上周/本月/上月，按工作目录分组写入 Markdown；也可 /worklog 设置 调整选项',
    input: { hint: '今天 | 昨天 | YYYY-MM-DD | 本周 | 上周 | 本月 | 上月 | 设置' },
    handler: async (invocation) => {
      const raw = String(invocation.rawInput ?? '').trim()
      if (/^(设置|config|配置)/i.test(raw)) {
        const current = pullPrefs()
        const result = applySetting(raw, { ...current, autoWeekly: { ...current.autoWeekly } })
        const pushed = await pushPatch(result.patch)
        if (!pushed && result.patch) {
          const next = normalizePrefs({ ...current, ...result.patch })
          writeConfig(next)
          prefs = next
        } else if (pushed) {
          pullPrefs()
        }
        scheduleAuto()
        return {
          kind: 'success',
          text: pushed
            ? `${result.message}\n\n以上选项也可以在「设置 → 插件 → 工作台账」里直接改。`
            : result.message,
        }
      }
      const query = sessionQuery()
      if (!query) return { kind: 'error', text: '工作台账需要 sessionQuery 服务，当前 profile 不可用。' }
      try {
        const result = await generate(query, raw, { config: pullPrefs() })
        return { kind: 'success', text: preview(result) }
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
      }
    },
  })

  ctx.tools.register({
    name: 'worklog_generate',
    description:
      'Rebuild a work log from DeepSeek Harness session logs: groups activity by working directory and writes a Markdown ledger. Supports one day, one week, or one month. Use when the user asks what was done today/yesterday/this week, or wants a daily/weekly/monthly report.',
    parameters: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          description:
            'Range to summarize: "today" (default), "yesterday"/"昨天", "本周"/"this week", "上周"/"last week", "本月"/"this month", "上月"/"last month", or YYYY-MM-DD.',
        },
      },
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path of the written Markdown ledger.' },
          markdown: { type: 'string', description: 'Full Markdown content of the ledger.' },
          sessions: { type: 'number', description: 'How many sessions contributed.' },
          projects: { type: 'number', description: 'How many working directories contributed.' },
          period: { type: 'string', description: 'Human readable range covered by the ledger.' },
        },
        required: ['path', 'markdown'],
        additionalProperties: false,
      },
      render: (_args, value) => [{ type: 'text', text: preview(value) }],
    },
    async execute(args) {
      const query = sessionQuery()
      if (!query) throw new Error('工作台账需要 sessionQuery 服务，当前 profile 不可用。')
      const raw = typeof args?.period === 'string' ? args.period : ''
      return await generate(query, raw, { config: pullPrefs() })
    },
  })

  ctx.on('settings/document-updated', () => {
    pullPrefs()
    scheduleAuto()
  })

  pullPrefs()
  scheduleAuto()

  // 设置服务到位后再读一次真实值，并把旧版 config.json 迁进设置页
  ctx.inject(['settings'], (sctx) => {
    // 这一页由插件的 client 半自绘（设置 → 工作台账），所以不要自动生成的表单页
    sctx.effect(() => {
      try {
        return sctx.settings.configure({ auto: false }, ctx.fiber)
      } catch {
        return undefined
      }
    }, 'worklog: settings page policy')
    sctx.effect(() => {
      pullPrefs()
      void migrateLegacy()
      scheduleAuto()
    }, 'worklog: settings ready')
  })

  ctx.on('dispose', () => {
    if (typeof disposeAuto === 'function') disposeAuto()
    disposeAuto = null
  })
}
