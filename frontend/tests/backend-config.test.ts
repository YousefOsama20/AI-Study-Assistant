import { describe, expect, it } from 'vitest'
import { parseBackendConfig } from '../electron/backend-manager'

describe('parseBackendConfig', () => {
  it('accepts allowlisted scalar settings and normalizes keys', () => {
    expect(
      parseBackendConfig(
        JSON.stringify({
          port: 5401,
          Preview_DPI: 200,
          reduced_motion: true,
          MAX_PREVIEW_PAGES: '20',
        }),
      ),
    ).toEqual({
      PORT: '5401',
      PREVIEW_DPI: '200',
      MAX_PREVIEW_PAGES: '20',
    })
  })

  it('ignores secrets, unknown keys, and non-scalar values', () => {
    expect(
      parseBackendConfig(
        JSON.stringify({
          OPENAI_API_KEY: 'secret',
          POSTGRES_PASSWORD: 'secret',
          CORS_ALLOW_ORIGINS: 'http://localhost:5173',
          FILE_UPLOAD_TYPES: ['application/pdf'],
          MAX_PREVIEW_PAGES: null,
        }),
      ),
    ).toEqual({ CORS_ALLOW_ORIGINS: 'http://localhost:5173' })
  })

  it('returns an empty object for invalid JSON or non-object values', () => {
    expect(parseBackendConfig('{')).toEqual({})
    expect(parseBackendConfig('[]')).toEqual({})
    expect(parseBackendConfig('null')).toEqual({})
  })
})
