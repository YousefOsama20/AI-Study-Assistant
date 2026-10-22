import os from 'os'

export interface GpuEnvironment {
  platform?: NodeJS.Platform
  osRelease?: string
  env?: NodeJS.ProcessEnv
}

export function shouldDisableGpu(options: GpuEnvironment = {}): boolean {
  const platform = options.platform ?? process.platform
  if (platform !== 'linux') return false

  const env = options.env ?? process.env
  if (env.MINIRAG_ENABLE_GPU === '1') return false

  const release = (options.osRelease ?? os.release()).toLowerCase()
  return Boolean(env.WSL_DISTRO_NAME) || release.includes('microsoft')
}
