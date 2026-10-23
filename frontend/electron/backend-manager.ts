import { spawn, type ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import fs from 'fs'
import http from 'http'
import net from 'net'
import path from 'path'

export type BackendState = 'stopped' | 'starting' | 'running' | 'failed'

export interface BackendStatus {
  state: BackendState
  port: number | null
  error: string | null
}

export interface BackendManagerOptions {
  userDataDir: string
  packaged: boolean
  resourcesPath: string
  projectRoot: string
}

const MAX_RESTART_ATTEMPTS = 3
const STARTUP_TIMEOUT_MS = 60_000
const HEALTH_POLL_INTERVAL_MS = 500
const STOP_TIMEOUT_MS = 5_000

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close(() => reject(new Error('Could not allocate a local port')))
        return
      }
      const port = address.port
      server.close(() => resolve(port))
    })
  })
}

function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      result[key] = value
    }
  }
  return result
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const ALLOWED_CONFIG_KEYS = new Set([
  'PORT',
  'RELOAD',
  'AISTUDY_AUTO_MIGRATE',
  'AISTUDY_DATA_DIR',
  'CORS_ALLOW_ORIGINS',
  'FILE_MAX_SIZE',
  'FILE_DEFAULT_CHUNK_SIZE',
  'PREVIEW_DPI',
  'PREVIEW_IMAGE_FORMAT',
  'MAX_PREVIEW_PAGES',
  'CHUNK_SIZE_DEFAULT',
  'CHUNK_OVERLAP_DEFAULT',
  'PRIMARY_LANG',
  'DEFAULT_LANG',
  'GENERATION_BACKEND',
  'EMBEDDING_BACKEND',
  'GENERATION_MODEL_ID',
  'EMBEDDING_MODEL_ID',
  'EMBEDDING_MODEL_SIZE',
  'VECTOR_DB_BACKEND',
  'VECTOR_DB_DISTANCE_METHOD',
  'VECTOR_DB_PGVEC_INDEX_THRESHOLD',
])

/**
 * Parse the optional non-secret `config.json` file. Unknown keys and
 * non-scalar values are ignored; secrets must stay in `.env`.
 */
export function parseBackendConfig(content: string): Record<string, string> {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {}
  }

  const result: Record<string, string> = {}
  for (const [rawKey, value] of Object.entries(parsed as Record<string, unknown>)) {
    const key = rawKey.trim().toUpperCase()
    if (!ALLOWED_CONFIG_KEYS.has(key)) continue
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      result[key] = String(value)
    }
  }
  return result
}

export class BackendManager extends EventEmitter {
  private child: ChildProcess | null = null
  private status: BackendStatus = { state: 'stopped', port: null, error: null }
  private restartAttempts = 0
  private stopping = false
  private logStream: fs.WriteStream | null = null
  private readonly options: BackendManagerOptions
  private readonly logPath: string

  constructor(options: BackendManagerOptions) {
    super()
    this.options = options
    this.logPath = path.join(options.userDataDir, 'backend.log')
  }

  getStatus(): BackendStatus {
    return { ...this.status }
  }

  getPort(): number | null {
    return this.status.state === 'running' ? this.status.port : null
  }

  async start(): Promise<void> {
    if (this.status.state === 'running' || this.status.state === 'starting') {
      return
    }
    this.stopping = false
    this.setStatus({ state: 'starting', port: null, error: null })

    try {
      fs.mkdirSync(this.options.userDataDir, { recursive: true })
      this.logStream = fs.createWriteStream(this.logPath, { flags: 'a' })
      this.writeLog(
        `[${new Date().toISOString()}] starting backend (packaged=${this.options.packaged})`,
      )

      const fileSettings = {
        ...this.readFileConfig(),
        ...this.readFileEnv(),
      }
      if (Object.keys(fileSettings).length > 0) {
        this.writeLog(
          `[${new Date().toISOString()}] loaded user configuration keys: ${Object.keys(fileSettings).sort().join(', ')}`,
        )
      }
      const configuredPort = Number.parseInt(fileSettings.PORT ?? '', 10)
      const port =
        Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort < 65536
          ? configuredPort
          : await findFreePort()

      const { command, args, cwd } = this.resolveCommand()
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        ...fileSettings,
        HOST: '127.0.0.1',
        PORT: String(port),
        RELOAD: '0',
        AISTUDY_PACKAGED: this.options.packaged ? '1' : '0',
        AISTUDY_AUTO_MIGRATE: fileSettings.AISTUDY_AUTO_MIGRATE ?? '1',
        AISTUDY_DATA_DIR:
          fileSettings.AISTUDY_DATA_DIR ??
          path.join(this.options.userDataDir, 'data'),
      }

      this.writeLog(`[${new Date().toISOString()}] spawn ${command} ${args.join(' ')}`)
      const child = spawn(command, args, {
        cwd,
        env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      this.child = child

      child.stdout?.on('data', (chunk: Buffer) => this.writeLog(chunk.toString()))
      child.stderr?.on('data', (chunk: Buffer) => this.writeLog(chunk.toString()))
      child.on('error', (error: Error) => {
        this.writeLog(`[${new Date().toISOString()}] spawn error: ${error.message}`)
        this.handleUnexpectedExit(`Failed to start backend: ${error.message}`)
      })
      child.on('exit', (code, signal) => {
        this.writeLog(
          `[${new Date().toISOString()}] backend exited (code=${code ?? 'null'} signal=${signal ?? 'null'})`,
        )
        if (this.stopping) return
        this.handleUnexpectedExit(
          `Backend exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'null'})`,
        )
      })

      const exitedEarly = new Promise<never>((_, reject) => {
        child.once('exit', () => reject(new Error('Backend process exited during startup')))
      })
      await Promise.race([
        this.waitForHealth(port),
        exitedEarly,
        delay(STARTUP_TIMEOUT_MS).then(() => {
          throw new Error(`Backend did not become healthy within ${STARTUP_TIMEOUT_MS / 1000}s`)
        }),
      ]).catch((error: unknown) => {
        this.writeLog(
          `[${new Date().toISOString()}] startup failed: ${error instanceof Error ? error.message : String(error)}`,
        )
        this.killChild()
        throw error
      })

      this.restartAttempts = 0
      this.setStatus({ state: 'running', port, error: null })
      this.writeLog(`[${new Date().toISOString()}] backend healthy on port ${port}`)
    } catch (error) {
      this.killChild()
      this.closeLog()
      const message = error instanceof Error ? error.message : String(error)
      this.setStatus({ state: 'failed', port: null, error: message })
      throw error instanceof Error ? error : new Error(message)
    }
  }

  async stop(): Promise<void> {
    this.stopping = true
    const child = this.child
    if (child && child.exitCode === null && !child.killed) {
      const exited = new Promise<void>((resolve) => {
        child.once('exit', () => resolve())
      })
      child.kill()
      const timedOut = await Promise.race([
        exited.then(() => false),
        delay(STOP_TIMEOUT_MS).then(() => true),
      ])
      if (timedOut) {
        this.killChild()
        await exited
      }
    }
    this.child = null
    this.closeLog()
    this.setStatus({ state: 'stopped', port: null, error: null })
  }

  async restart(): Promise<{ ok: boolean; error: string | null }> {
    this.restartAttempts += 1
    try {
      await this.stop()
      await this.start()
      return { ok: true, error: null }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  private async handleUnexpectedExit(message: string): Promise<void> {
    if (this.stopping) return
    this.child = null
    this.closeLog()
    if (this.restartAttempts >= MAX_RESTART_ATTEMPTS) {
      this.setStatus({
        state: 'failed',
        port: null,
        error: `${message}. Restart attempts exhausted (${MAX_RESTART_ATTEMPTS}).`,
      })
      return
    }
    this.restartAttempts += 1
    this.setStatus({ state: 'starting', port: null, error: message })
    try {
      await this.stop()
      this.stopping = false
      await this.start()
    } catch {
      // start() already set the failed status
    }
  }

  private waitForHealth(port: number): Promise<void> {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS
    return new Promise((resolve, reject) => {
      const attempt = () => {
        const req = http.get(
          {
            host: '127.0.0.1',
            port,
            path: '/api/v1/health',
            timeout: 2_000,
          },
          (res) => {
            res.resume()
            // Any HTTP response (200 ok / 503 degraded) means the server is up.
            resolve()
          },
        )
        req.on('timeout', () => {
          req.destroy()
        })
        req.on('error', () => {
          if (Date.now() >= deadline) {
            reject(new Error(`Backend health check timed out on port ${port}`))
            return
          }
          setTimeout(attempt, HEALTH_POLL_INTERVAL_MS)
        })
      }
      attempt()
    })
  }

  private resolveCommand(): { command: string; args: string[]; cwd: string } {
    if (this.options.packaged) {
      const exeName = process.platform === 'win32' ? 'AIStudyAssistantBackend.exe' : 'AIStudyAssistantBackend'
      const exePath = path.join(this.options.resourcesPath, 'backend', exeName)
      if (!fs.existsSync(exePath)) {
        throw new Error(`Backend executable not found at ${exePath}`)
      }
      return { command: exePath, args: [], cwd: path.dirname(exePath) }
    }
    const python =
      process.env.AISTUDY_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3')
    const mainPy = path.join(this.options.projectRoot, 'src', 'main.py')
    if (!fs.existsSync(mainPy)) {
      throw new Error(`Backend entry point not found at ${mainPy}`)
    }
    return { command: python, args: [mainPy], cwd: path.join(this.options.projectRoot, 'src') }
  }

  private readFileEnv(): Record<string, string> {
    try {
      const envPath = path.join(this.options.userDataDir, '.env')
      if (!fs.existsSync(envPath)) return {}
      return parseEnvFile(fs.readFileSync(envPath, 'utf8'))
    } catch {
      return {}
    }
  }

  private readFileConfig(): Record<string, string> {
    try {
      const configPath = path.join(this.options.userDataDir, 'config.json')
      if (!fs.existsSync(configPath)) return {}
      return parseBackendConfig(fs.readFileSync(configPath, 'utf8'))
    } catch {
      return {}
    }
  }

  private killChild(): void {
    const child = this.child
    if (child && child.exitCode === null) {
      try {
        child.kill()
      } catch {
        // ignore
      }
    }
    this.child = null
  }

  private closeLog(): void {
    this.logStream?.end()
    this.logStream = null
  }

  private writeLog(line: string): void {
    this.logStream?.write(line.endsWith('\n') ? line : `${line}\n`)
  }

  private setStatus(status: BackendStatus): void {
    this.status = status
    this.emit('status', { ...status })
  }
}
