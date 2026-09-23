import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

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
    expect(screen.getByText('42/350 characters · Recommended: 40–350')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Track my volunteer time' })).toHaveAttribute(
      'href',
      'https://microsoft.benevity.org/volunteer/external/track/?cause_id=840-362934689',
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
})
