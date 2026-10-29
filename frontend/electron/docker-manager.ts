import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'

export interface DockerStatus {
  installed: boolean
  running: boolean
  version: string | null
  composeVersion: string | null
  composeFile: string | null
  error: string | null
}

export interface DockerStartOptions {
  resourcesPath: string
  projectRoot: string
  port: number
  database: string
  username: string
  password: string
}

const PROJECT_NAME = 'ai-study-assistant'
const SERVICE = 'pgvector'
const COMMAND_TIMEOUT_MS = 30_000
const START_TIMEOUT_MS = 600_000
const HEALTH_TIMEOUT_MS = 120_000

function composeFileFor(options: Pick<DockerStartOptions, 'resourcesPath' | 'projectRoot'>): string {
  const packaged = path.join(options.resourcesPath, 'docker', 'docker-compose.yml')
  if (fs.existsSync(packaged)) return packaged
  return path.join(options.projectRoot, 'docker', 'docker-compose.yml')
}

function run(
  args: string[],
  options: { timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      'docker',
      args,
      {
        windowsHide: true,
        timeout: options.timeoutMs ?? COMMAND_TIMEOUT_MS,
        maxBuffer: 4 * 1024 * 1024,
        env: options.env ?? process.env,
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = (stderr || stdout || error.message).trim()
          reject(new Error(detail || 'Docker command failed'))
          return
        }
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() })
      },
    )
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function redact(value: string, secret: string): string {
  if (!secret) return value
  return value.split(secret).join('[redacted]')
}

export async function getDockerStatus(
  options: Pick<DockerStartOptions, 'resourcesPath' | 'projectRoot'>,
): Promise<DockerStatus> {
  const composeFile = composeFileFor(options)
  const status: DockerStatus = {
    installed: false,
    running: false,
    version: null,
    composeVersion: null,
    composeFile: fs.existsSync(composeFile) ? composeFile : null,
    error: null,
  }

  try {
    const version = await run(['--version'], { timeoutMs: 10_000 })
    status.installed = true
    status.version = version.stdout.replace(/^Docker version\s*/i, '') || version.stdout
  } catch (error) {
    status.error =
      error instanceof Error && /ENOENT|not recognized|not found/i.test(error.message)
        ? 'Docker Desktop is not installed.'
        : error instanceof Error
          ? error.message
          : 'Docker is not available.'
    return status
  }

  try {
    await run(['version', '--format', '{{.Server.Version}}'], { timeoutMs: 15_000 })
    status.running = true
  } catch {
    status.error = 'Docker Desktop is installed but the engine is not running.'
  }

  try {
    const compose = await run(['compose', 'version', '--short'], { timeoutMs: 15_000 })
    status.composeVersion = compose.stdout
  } catch {
    status.error = status.error ?? 'Docker Compose is not available.'
  }

  if (!status.composeFile) {
    status.error = 'The bundled Docker Compose file is missing. Reinstall the application.'
  }

  return status
}

function composeArgs(composeFile: string): string[] {
  return ['compose', '-p', PROJECT_NAME, '-f', composeFile]
}

export async function startDatabase(options: DockerStartOptions): Promise<{
  ok: boolean
  containerStatus: string
  message: string
}> {
  const composeFile = composeFileFor(options)
  if (!fs.existsSync(composeFile)) {
    throw new Error('The bundled Docker Compose file is missing. Reinstall the application.')
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    POSTGRES_PASSWORD: options.password,
    POSTGRES_DB: options.database,
    POSTGRES_USER: options.username,
    AISTUDY_DB_PORT: String(options.port),
  }

  try {
    await run([...composeArgs(composeFile), 'up', '-d', SERVICE], {
      timeoutMs: START_TIMEOUT_MS,
      env,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(redact(message, options.password))
  }

  const containerStatus = await waitForHealthy(composeFile, env, options.password)
  return {
    ok: containerStatus === 'healthy',
    containerStatus,
    message:
      containerStatus === 'healthy'
        ? 'Database container is running.'
        : `Database container is ${containerStatus}.`,
  }
}

async function containerId(composeFile: string, env: NodeJS.ProcessEnv): Promise<string | null> {
  try {
    const result = await run([...composeArgs(composeFile), 'ps', '-q', SERVICE], {
      timeoutMs: COMMAND_TIMEOUT_MS,
      env,
    })
    return result.stdout.split(/\r?\n/).filter(Boolean)[0] ?? null
  } catch {
    return null
  }
}

async function waitForHealthy(
  composeFile: string,
  env: NodeJS.ProcessEnv,
  password: string,
): Promise<string> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS
  let lastStatus = 'unknown'
  while (Date.now() < deadline) {
    const id = await containerId(composeFile, env)
    if (id) {
      try {
        const inspect = await run(
          [
            'inspect',
            '--format',
            '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}',
            id,
          ],
          { timeoutMs: 15_000, env },
        )
        lastStatus = inspect.stdout || 'unknown'
        if (lastStatus === 'healthy') return lastStatus
        if (lastStatus === 'exited' || lastStatus === 'dead') {
          const logs = await run([...composeArgs(composeFile), 'logs', '--tail', '40', SERVICE], {
            timeoutMs: 20_000,
            env,
          }).catch(() => ({ stdout: '', stderr: '' }))
          throw new Error(
            redact(
              `The database container stopped before becoming healthy.\n${logs.stdout}\n${logs.stderr}`,
              password,
            ).trim(),
          )
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('stopped before becoming healthy')) {
          throw error
        }
      }
    }
    await delay(2_000)
  }
  throw new Error(`Database did not become healthy in time (last status: ${lastStatus}).`)
}

export async function stopDatabase(options: DockerStartOptions): Promise<void> {
  const composeFile = composeFileFor(options)
  if (!fs.existsSync(composeFile)) return
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    POSTGRES_PASSWORD: options.password,
    POSTGRES_DB: options.database,
    POSTGRES_USER: options.username,
    AISTUDY_DB_PORT: String(options.port),
  }
  await run([...composeArgs(composeFile), 'stop', SERVICE], {
    timeoutMs: COMMAND_TIMEOUT_MS,
    env,
  }).catch(() => undefined)
}
