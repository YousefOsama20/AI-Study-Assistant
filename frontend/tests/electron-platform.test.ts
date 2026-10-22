import { describe, expect, it } from 'vitest'
import { shouldDisableGpu } from '../electron/platform'

describe('shouldDisableGpu', () => {
  it('leaves acceleration enabled on Windows', () => {
    expect(
      shouldDisableGpu({
        platform: 'win32',
        osRelease: '10.0.26100',
        env: {},
      }),
    ).toBe(false)
  })

  it('leaves acceleration enabled on native Linux', () => {
    expect(
      shouldDisableGpu({
        platform: 'linux',
        osRelease: '6.8.0-45-generic',
        env: {},
      }),
    ).toBe(false)
  })

  it('disables acceleration on WSL2', () => {
    expect(
      shouldDisableGpu({
        platform: 'linux',
        osRelease: '6.18.54.1-microsoft-standard-WSL2',
        env: {},
      }),
    ).toBe(true)
  })

  it('disables acceleration when WSL_DISTRO_NAME is set', () => {
    expect(
      shouldDisableGpu({
        platform: 'linux',
        osRelease: '6.8.0-45-generic',
        env: { WSL_DISTRO_NAME: 'Ubuntu' },
      }),
    ).toBe(true)
  })

  it('allows WSL users to opt back in with MINIRAG_ENABLE_GPU=1', () => {
    expect(
      shouldDisableGpu({
        platform: 'linux',
        osRelease: '6.18.54.1-microsoft-standard-WSL2',
        env: { WSL_DISTRO_NAME: 'Ubuntu', MINIRAG_ENABLE_GPU: '1' },
      }),
    ).toBe(false)
  })
})
