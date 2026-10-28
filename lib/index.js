// dsh-prompt-library — 宿主半边。
// 只做一件事：把提示词库存成一个 JSON 文件，并提供三条回环接口给浏览器半边
// （GET 读全库 / PUT 覆盖保存全库 / POST 记一次使用）。
//
// 设计约束：
//   - 不 import 任何第三方/宿主包，插件以裸 ESM 发布，只依赖 node 内置模块。
//   - 路由只认回环 Host，挡掉 DNS 重绑定；不做鉴权（同源页面）。
//   - 落盘用「临时文件 + rename」，避免写一半留下坏文件。
//   - 每次整库保存前把上一版复制成 backup 文件；只记使用不改内容，不备份。
//   - rev 单调递增，PUT 带回来的 rev 与磁盘不一致时回 409，避免多窗口静默覆盖。
//   - 落盘位置复用 dsh-prompt-boost 的策略：DSH_PROFILE_DIR → DSH_HOME → ~/.dsh →
//     插件目录，保证 link 安装时不把数据写进仓库。

import { copyFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'prompt-library'

const PREFIX = '/prompt-library'
const BODY_LIMIT = 200 * 1024
const MAX_BODY_CHARS = 64 * 1024

const LOOPBACK_HOST = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\]|::1)(?::\d+)?$/i

function storePath() {
  const candidates = [
    process.env.DSH_PROFILE_DIR,
    process.env.DSH_HOME,
    join(homedir(), '.dsh'),
    fileURLToPath(new URL('..', import.meta.url)),
  ]
  for (const dir of candidates) {
    if (typeof dir === 'string' && dir !== '') return join(dir, 'prompt-library.json')
  }
  return join(homedir(), '.dsh', 'prompt-library.json')
}

const STORE_PATH = storePath()
const BACKUP_PATH = join(dirname(STORE_PATH), 'prompt-library.backup.json')
// 临时：客户端配色探针的回传文件，排查完连同客户端探针一起删。
const DIAG_PATH = join(tmpdir(), 'pl-diag.json')

function asText(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function asStamp(value, fallback = 0) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

function normalizePrompt(raw) {
  if (!raw || typeof raw !== 'object') return null
  const id = asText(raw.id)
  const body = asText(raw.body).slice(0, MAX_BODY_CHARS)
  if (id === '' || body.trim() === '') return null
  const createdAt = asStamp(raw.createdAt) || Date.now()
  return {
    id: id.slice(0, 120),
    title: asText(raw.title).trim().slice(0, 200) || body.trim().split('\n')[0].slice(0, 40),
    body,
    group: asText(raw.group).trim().slice(0, 40),
    pinned: raw.pinned === true,
    createdAt,
    updatedAt: asStamp(raw.updatedAt) || createdAt,
    lastUsedAt: asStamp(raw.lastUsedAt),
  }
}

function normalize(raw) {
  const source = raw && typeof raw === 'object' && Array.isArray(raw.prompts) ? raw.prompts : []
  const seen = new Set()
  const prompts = []
  for (const item of source) {
    const prompt = normalizePrompt(item)
    if (prompt && !seen.has(prompt.id)) {
      seen.add(prompt.id)
      prompts.push(prompt)
    }
  }
  return { version: 1, rev: asStamp(raw && raw.rev), prompts }
}

function load() {
  try {
    return normalize(JSON.parse(readFileSync(STORE_PATH, 'utf8')))
  } catch {
    return { version: 1, rev: 0, prompts: [] }
  }
}

function conflictError(current) {
  const error = new Error('提示词库已在别处被修改，已刷新为最新内容，请重试')
  error.status = 409
  error.code = 'conflict'
  error.rev = current.rev
  return error
}

// expectedRev 为 undefined 时跳过校验（curl 手测、旧客户端都能覆盖保存）。
// withBackup 为真时，先把磁盘上的现有版本复制成备份再写。
function save(data, expectedRev, withBackup) {
  const current = load()
  if (typeof expectedRev === 'number' && expectedRev !== current.rev) throw conflictError(current)

  const next = normalize(data)
  next.rev = current.rev + 1

  mkdirSync(dirname(STORE_PATH), { recursive: true })
  if (withBackup) {
    try {
      copyFileSync(STORE_PATH, BACKUP_PATH)
    } catch {
      // 第一次保存时还没有原文件，不需要备份
    }
  }
  const temp = STORE_PATH + '.tmp'
  writeFileSync(temp, JSON.stringify(next, null, 2) + '\n', 'utf8')
  renameSync(temp, STORE_PATH)
  return next
}

function markUsed(id) {
  const data = load()
  const target = data.prompts.find((item) => item.id === id)
  if (!target) return null
  target.lastUsedAt = Date.now()
  const saved = save(data, data.rev, false)
  return { rev: saved.rev }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

function sendError(res, status, code, message) {
  sendJson(res, status, { ok: false, error: { code, message } })
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > BODY_LIMIT) {
        const error = new Error('请求体过大')
        error.status = 413
        error.code = 'too-large'
        req.destroy()
        reject(error)
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      try {
        resolve(raw === '' ? {} : JSON.parse(raw))
      } catch {
        const error = new Error('请求体不是合法 JSON')
        error.status = 400
        error.code = 'bad-json'
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

async function readBody(req, res) {
  try {
    return { ok: true, body: await readJson(req) }
  } catch (error) {
    sendError(res, error.status || 400, error.code || 'bad-request', error.message || '请求体无法解析')
    return { ok: false }
  }
}

async function handle(req, res) {
  try {
    if (!LOOPBACK_HOST.test(String((req.headers && req.headers.host) || ''))) {
      sendError(res, 403, 'forbidden', '只允许回环地址访问')
      return
    }
    const pathname = new URL(req.url || '/', 'http://localhost').pathname
    const method = req.method || 'GET'

    if (pathname === PREFIX) {
      if (method === 'GET') {
        sendJson(res, 200, {
          ok: true,
          value: load(),
          path: STORE_PATH,
          backupPath: BACKUP_PATH,
        })
        return
      }
      if (method === 'PUT') {
        const parsed = await readBody(req, res)
        if (!parsed.ok) return
        const body = parsed.body
        if (!body || typeof body !== 'object' || !Array.isArray(body.prompts)) {
          sendError(res, 400, 'bad-shape', '缺少 prompts 数组')
          return
        }
        try {
          const value = save(body, typeof body.rev === 'number' ? body.rev : undefined, true)
          sendJson(res, 200, { ok: true, value })
        } catch (error) {
          if (error && error.status === 409) {
            // 把磁盘上的最新整库一起带回去，客户端可以直接刷新，不用再发 GET。
            sendJson(res, 409, {
              ok: false,
              error: { code: error.code, message: error.message },
              value: load(),
            })
            return
          }
          throw error
        }
        return
      }
      sendError(res, 405, 'method', '只支持 GET / PUT')
      return
    }

    if (pathname === PREFIX + '/used') {
      if (method !== 'POST') {
        sendError(res, 405, 'method', '只支持 POST')
        return
      }
      const parsed = await readBody(req, res)
      if (!parsed.ok) return
      const id = parsed.body && typeof parsed.body.id === 'string' ? parsed.body.id : ''
      const result = id === '' ? null : markUsed(id)
      if (!result) {
        sendError(res, 404, 'not-found', '没有这条提示词')
        return
      }
      sendJson(res, 200, { ok: true, rev: result.rev })
      return
    }

    if (pathname === PREFIX + '/__diag') {
      if (method !== 'POST') {
        sendError(res, 405, 'method', '只支持 POST')
        return
      }
      const parsed = await readBody(req, res)
      if (!parsed.ok) return
      writeFileSync(DIAG_PATH, JSON.stringify(parsed.body, null, 2), 'utf8')
      sendJson(res, 200, { ok: true, path: DIAG_PATH })
      return
    }

    sendError(res, 404, 'not-found', '未知接口')
  } catch (error) {
    if (res.writableEnded) return
    sendError(res, 500, 'internal', '内部错误：' + ((error && error.message) || String(error)))
  }
}

export function apply(ctx) {
  // webServer 缺席（无头 profile）时这个回调不会跑，插件保持静默。
  ctx.inject(['webServer'], (wctx) => {
    wctx.effect(() => wctx.webServer.register({
      kind: 'prefix',
      path: PREFIX,
      handler: (req, res) => handle(req, res),
    }))
  })
}