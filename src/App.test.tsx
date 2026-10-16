import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { languages, messages } from './locales'
import { cardToBlob } from './cardRenderer'
import * as api from './api'

vi.mock('./config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./config')>()
  return { ...actual, config: { ...actual.config, activityName: '', eventTitle: '', trackingUrl: 'https://example.org/volunteer' } }
})

vi.mock('./cardRenderer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./cardRenderer')>()
  return {
    ...actual,
    renderCard: vi.fn(async () => document.createElement('canvas')),
    cardToBlob: vi.fn(async () => new Blob(['card'], { type: 'image/jpeg' })),
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en'])
})

describe('card creator', () => {
  it('supports template selection, message guidance, consent, and volunteer tracking', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'Words of Encouragement' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Selected' })).not.toBeInTheDocument()
    expect(screen.getByText('Select a design or generate a background to preview your card.')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('radio', { name: 'Use this design' })[0])
    expect(screen.getAllByRole('radio', { name: 'Selected' })).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Encouragement message'), {
      target: { value: 'Sending warmth and kind thoughts your way.' },
    })
    expect(screen.getByText('42/350 characters')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Track my volunteer time' })).toHaveAttribute(
      'href',
      'https://example.org/volunteer',
    )
    expect(screen.getByRole('button', { name: 'Submit card' })).toBeDisabled()
  })

  it('enables final image actions after a valid message and all checks are complete', () => {
    render(<App />)
    fireEvent.click(screen.getAllByRole('radio', { name: 'Use this design' })[0])
    fireEvent.change(screen.getByLabelText('Encouragement message'), {
      target: { value: 'Sending warmth and kind thoughts your way.' },
    })
    for (const checkbox of screen.getAllByRole('checkbox')) {
      fireEvent.click(checkbox)
    }
    expect(screen.getByRole('button', { name: 'Generate JPG' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Download JPG' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Submit card' })).toBeEnabled()
  })

  it.each(languages)('localizes the UI and defaults card content to $code', ({ code }) => {
    render(<App />)
    fireEvent.change(screen.getByLabelText(messages.en.uiLanguage), { target: { value: code } })
    const t = messages[code]
    expect(screen.getByRole('heading', { level: 1, name: t.appTitle })).toBeInTheDocument()
    expect(screen.getByLabelText(t.messageLanguage)).toHaveValue(code)
    expect(screen.getByRole('textbox', { name: t.messageLabel })).toHaveAttribute('lang', code)
    expect(document.documentElement.lang).toBe(code)
    expect(screen.getAllByRole('radio')).toHaveLength(code === 'en' ? 6 : 2)
    fireEvent.click(screen.getByRole('button', { name: t.phrases[0] }))
    expect(screen.getByRole('textbox', { name: t.messageLabel })).toHaveValue(t.phrases[0])
    fireEvent.change(screen.getByRole('textbox', { name: t.messageLabel }), { target: { value: 'person@example.com' } })
    expect(screen.getByText(t.concerns.email)).toBeInTheDocument()
  })

  it('uses browser language and permits an independent card language without translating existing text', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['fr-CA'])
    render(<App />)
    expect(screen.getByLabelText(messages.fr.uiLanguage)).toHaveValue('fr')
    fireEvent.change(screen.getByLabelText(messages.fr.messageLabel), { target: { value: 'Un message à conserver.' } })
    fireEvent.change(screen.getByLabelText(messages.fr.messageLanguage), { target: { value: 'ja' } })
    expect(screen.getByLabelText(messages.fr.messageLabel)).toHaveValue('Un message à conserver.')
    expect(screen.getByRole('button', { name: messages.ja.phrases[0] })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('fr')
  })

  it('clears incompatible artwork when moving to a non-English card', () => {
    render(<App />)
    fireEvent.click(screen.getAllByRole('radio')[0])
    fireEvent.change(screen.getByLabelText(messages.en.messageLanguage), { target: { value: 'es' } })
    expect(screen.queryByRole('radio', { name: messages.en.selected })).not.toBeInTheDocument()
    expect(screen.getByText(messages.en.previewEmpty)).toBeInTheDocument()
  })

  it('regenerates a cached JPG after language or suggested message changes', async () => {
    const submit = vi.spyOn(api, 'submitCard').mockResolvedValue({
      success: true, submissionId: 'test-submission', submittedUtc: '2026-10-16T00:00:00Z',
    })
    render(<App />)
    fireEvent.click(screen.getAllByRole('radio')[1])
    fireEvent.click(screen.getByRole('button', { name: messages.en.phrases[0] }))
    for (const checkbox of screen.getAllByRole('checkbox')) fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: messages.en.generate }))
    await waitFor(() => expect(screen.getByText(messages.en.jpgReady)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: messages.en.submit }))
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole('button', { name: messages.en.submit })).toBeEnabled())
    expect(cardToBlob).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByLabelText(messages.en.messageLanguage), { target: { value: 'ja' } })
    fireEvent.click(screen.getByRole('button', { name: messages.en.submit }))
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByRole('button', { name: messages.en.submit })).toBeEnabled())
    expect(cardToBlob).toHaveBeenCalledTimes(2)
    expect(submit.mock.lastCall?.[1]).toBe('ja')
    fireEvent.click(screen.getByRole('button', { name: messages.ja.phrases[0] }))
    fireEvent.click(screen.getByRole('button', { name: messages.en.submit }))
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(3))
    expect(cardToBlob).toHaveBeenCalledTimes(3)
    expect(vi.mocked(cardToBlob).mock.lastCall?.[0]).toMatchObject({ language: 'ja' })
    expect(vi.mocked(cardToBlob).mock.lastCall?.[0].message).toContain(messages.ja.phrases[0])
    submit.mockRestore()
  })
})
