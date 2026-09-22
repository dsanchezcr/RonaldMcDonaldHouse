import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { reviewMessage, submitCard } from './api'
import { cardToBlob, createCardFilename, renderCard } from './cardRenderer'
import { config, designs, languages } from './config'
import type { CardDesign, ReviewResponse, SubmissionResponse, TextAlign } from './types'
import { isRtlLanguage, validateFirstName, validateMessage } from './validation'

const starterPhrases = [
  'Thinking of you.',
  'Wishing you well.',
  'Sending warmth, encouragement, and kind thoughts your way.',
  'You have a caring community supporting you.',
]

function App() {
  const [design, setDesign] = useState<CardDesign>(designs[0])
  const [message, setMessage] = useState('')
  const [firstName, setFirstName] = useState('')
  const [language, setLanguage] = useState('en')
  const [fontSize, setFontSize] = useState(54)
  const [textAlign, setTextAlign] = useState<TextAlign>('center')
  const [consents, setConsents] = useState([false, false, false, false])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState<'review' | 'generate' | 'submit' | null>(null)
  const [review, setReview] = useState<ReviewResponse | null>(null)
  const [imageBlob, setImageBlob] = useState<Blob | null>(null)
  const [submission, setSubmission] = useState<SubmissionResponse | null>(null)
  const [error, setError] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const concerns = useMemo(() => validateMessage(message, config.maxMessageLength), [message])
  const firstNameError = validateFirstName(firstName)
  const state = useMemo(
    () => ({ design, message, firstName, language, textAlign, fontSize }),
    [design, message, firstName, language, textAlign, fontSize],
  )
  const valid = concerns.length === 0 && !firstNameError

  useEffect(() => {
    let active = true
    if (!message.trim()) return
    renderCard(state)
      .then((canvas) => {
        if (!active || !canvasRef.current) return
        canvasRef.current.getContext('2d')?.drawImage(canvas, 0, 0, canvasRef.current.width, canvasRef.current.height)
      })
      .catch(() => setError('The preview could not be rendered. Choose another design and try again.'))
    return () => {
      active = false
    }
  }, [state])

  async function generateJpg() {
    setError('')
    setBusy('generate')
    try {
      const blob = await cardToBlob(state)
      setImageBlob(blob)
      setStatus('Your JPG is ready to download or submit.')
      return blob
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'JPG generation failed.')
      return null
    } finally {
      setBusy(null)
    }
  }

  async function download() {
    const blob = imageBlob || (await generateJpg())
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = createCardFilename()
    link.click()
    URL.revokeObjectURL(url)
  }

  async function requestReview() {
    setBusy('review')
    setError('')
    try {
      setReview(await reviewMessage(message, language))
      setStatus('AI review complete. Review any suggestion before choosing whether to use it.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'AI review is unavailable.')
    } finally {
      setBusy(null)
    }
  }

  async function upload() {
    if (!valid || !consents.every(Boolean)) {
      setError('Resolve message concerns and complete every final check before submitting.')
      return
    }
    const blob = imageBlob || (await generateJpg())
    if (!blob) return
    setBusy('submit')
    setError('')
    try {
      const key = sessionStorage.getItem('rmh-idempotency-key') || crypto.randomUUID()
      sessionStorage.setItem('rmh-idempotency-key', key)
      const result = await submitCard(blob, language, design.source, config.consentVersion, key)
      setSubmission(result)
      setStatus('Card submission succeeded.')
      sessionStorage.removeItem('rmh-idempotency-key')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Submission failed. Your card remains available to download or retry.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <a className="skip-link" href="#main">Skip to card creator</a>
      <header className="site-header">
        <div className="brand-placeholder" role="img" aria-label="Approved Ronald McDonald House logo pending replacement">Approved event logo</div>
        <span>{config.eventTitle}</span>
      </header>
      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <p className="eyebrow">{config.eventDate} · 11:05–11:30 AM Pacific Time</p>
          <h1 id="hero-title">{config.activityName}</h1>
          <p>Create a short message of hope and encouragement for a family staying connected during a child’s healthcare journey. Choose a card, write your note, review it, and submit your finished eCard.</p>
          <p className="privacy-note"><strong>Your card is anonymous.</strong> Please do not include personal, medical, or contact information.</p>
          <div className="actions">
            <a className="button primary" href="#designs">Create a card</a>
            <a className="button secondary" href="#how-it-works">How it works</a>
          </div>
        </section>

        <section id="how-it-works" className="section">
          <h2>How it works</h2>
          <ol className="steps">
            <li><strong>Choose</strong><span>Select an approved design.</span></li>
            <li><strong>Write</strong><span>Add an anonymous supportive note.</span></li>
            <li><strong>Review</strong><span>Check the preview and final confirmations.</span></li>
            <li><strong>Share</strong><span>Download and securely submit your JPG.</span></li>
          </ol>
        </section>

        <section id="designs" className="section" aria-labelledby="design-title">
          <p className="step-label">Step 1</p>
          <h2 id="design-title">Choose a design</h2>
          <p className="approval-warning" role="note">Catalog artwork is a clearly marked placeholder. Event owners must replace it with approved exports from the source presentation before production.</p>
          <div className="design-grid" role="radiogroup" aria-label="Card designs">
            {designs.map((item) => (
              <article className={`design-card ${design.id === item.id ? 'selected' : ''}`} key={item.id}>
                <img src={item.image} alt={item.description} loading="lazy" />
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <button type="button" role="radio" aria-checked={design.id === item.id} onClick={() => { setDesign(item); setImageBlob(null) }}>
                  {design.id === item.id ? 'Selected' : 'Use this design'}
                </button>
              </article>
            ))}
          </div>
          <details className="ai-panel">
            <summary>Create a new background with Microsoft AI (optional)</summary>
            <p>AI generation is a progressive enhancement. The approved catalog remains available if the service is unavailable.</p>
            <label htmlFor="ai-prompt">Describe a warm, family-friendly background</label>
            <textarea id="ai-prompt" disabled={!config.aiImageEnabled} placeholder="Warm sunshine and small hearts" />
            <button type="button" disabled>Generate background (requires approved service configuration)</button>
          </details>
        </section>

        <section className="section composer" aria-labelledby="message-title">
          <div>
            <p className="step-label">Step 2</p>
            <h2 id="message-title">Write your message</h2>
            <p>Write a message of encouragement and hope. Messages in languages other than English are welcome.</p>
            <label htmlFor="language">Message language</label>
            <select id="language" value={language} onChange={(event) => setLanguage(event.target.value)}>
              {languages.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}
            </select>
            <label htmlFor="message">Encouragement message</label>
            <textarea
              id="message"
              value={message}
              dir={isRtlLanguage(language) ? 'rtl' : 'ltr'}
              maxLength={config.maxMessageLength}
              aria-describedby="message-help message-errors"
              aria-invalid={concerns.length > 0 && message.length > 0}
              onChange={(event) => { setMessage(event.target.value); setImageBlob(null); setReview(null) }}
              placeholder="Hi there, sending warmth and kind thoughts your way."
            />
            <div id="message-help" className="field-help">{message.length}/{config.maxMessageLength} characters · Recommended: 40–350</div>
            {concerns.length > 0 && message.length > 0 && (
              <ul id="message-errors" className="errors">{concerns.map((item) => <li key={item.code}>{item.message}</li>)}</ul>
            )}
            <div className="suggestions" aria-label="Suggested phrases">
              {starterPhrases.map((phrase) => <button type="button" key={phrase} onClick={() => setMessage((current) => `${current}${current ? ' ' : ''}${phrase}`.slice(0, config.maxMessageLength))}>{phrase}</button>)}
            </div>
            <label htmlFor="first-name">First name (optional)</label>
            <input id="first-name" value={firstName} maxLength={40} onChange={(event) => { setFirstName(event.target.value); setImageBlob(null) }} />
            <p className="field-help">Please use your first name only. Do not include your last name, email address, phone number, location, or other personal information.</p>
            {firstNameError && <p className="errors">{firstNameError}</p>}
            <aside className="guidance">
              <h3>Writing guidance</h3>
              <p><strong>Try:</strong> Thinking of you. Sending joyful wishes to you and your family.</p>
              <p><strong>Avoid:</strong> “Get well soon,” medical advice, recovery promises, diagnoses, contact details, or assumptions about circumstances.</p>
            </aside>
          </div>
          <div className="preview-column">
            <h2>Live preview</h2>
            <canvas ref={canvasRef} width="800" height="450" role="img" aria-label={`${design.title}. Message: ${message || 'No message entered yet'}`} />
            <div className="preview-controls">
              <label htmlFor="font-size">Text size</label>
              <input id="font-size" type="range" min="38" max="68" value={fontSize} onChange={(event) => { setFontSize(Number(event.target.value)); setImageBlob(null) }} />
              <fieldset>
                <legend>Text alignment</legend>
                {(['left', 'center', 'right'] as TextAlign[]).map((alignment) => (
                  <button type="button" aria-pressed={textAlign === alignment} onClick={() => { setTextAlign(alignment); setImageBlob(null) }} key={alignment}>{alignment}</button>
                ))}
              </fieldset>
              <button type="button" onClick={() => { setFontSize(54); setTextAlign('center'); setImageBlob(null) }}>Reset formatting</button>
            </div>
          </div>
        </section>

        <section className="section ai-panel" aria-labelledby="review-title">
          <p className="step-label">Step 3 · Optional</p>
          <h2 id="review-title">Review my message with AI</h2>
          <p>AI can suggest a warmer, clearer version of your message. Review the suggestion before using it. Do not enter personal, medical, or confidential information.</p>
          <button type="button" disabled={!config.aiReviewEnabled || !valid || busy === 'review'} onClick={requestReview}>
            {busy === 'review' ? 'Reviewing…' : config.aiReviewEnabled ? 'Review my message with AI' : 'AI review is not enabled'}
          </button>
          {review && (
            <div className="review-result">
              <h3>Review result</h3>
              <p>{review.explanation}</p>
              {review.suggestedRevision && <blockquote lang={language} dir={isRtlLanguage(language) ? 'rtl' : 'ltr'}>{review.suggestedRevision}</blockquote>}
              {review.suggestedRevision && <button type="button" onClick={() => { setMessage(review.suggestedRevision || message); setReview(null); setImageBlob(null) }}>Use suggested version</button>}
              <button type="button" onClick={() => setReview(null)}>Keep original</button>
            </div>
          )}
        </section>

        <section className="section" aria-labelledby="final-title">
          <p className="step-label">Step 4</p>
          <h2 id="final-title">Final checks</h2>
          {[
            'I have not included private or contact information.',
            'I have not included medical advice or promises about recovery.',
            'I understand that my card may be shared with Ronald McDonald House families.',
            'I confirm that I have reviewed the final message.',
          ].map((label, index) => (
            <label className="check" key={label}>
              <input type="checkbox" checked={consents[index]} onChange={(event) => setConsents((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.checked : value))} />
              <span>{label}</span>
            </label>
          ))}
          <div className="actions">
            <button type="button" className="primary" disabled={!valid || busy !== null} onClick={generateJpg}>{busy === 'generate' ? 'Generating…' : 'Generate JPG'}</button>
            <button type="button" disabled={!imageBlob} onClick={download}>Download JPG</button>
            <button type="button" disabled={!valid || !consents.every(Boolean) || busy !== null} onClick={upload}>{busy === 'submit' ? 'Submitting…' : 'Submit card'}</button>
          </div>
          <div className="status" aria-live="polite">{status}</div>
          {error && <div className="error-banner" role="alert">{error}</div>}
        </section>

        {submission && (
          <section className="section confirmation" aria-labelledby="confirmation-title">
            <h2 id="confirmation-title">Thank you for sharing encouragement</h2>
            <p>Your card has been created and submitted successfully.</p>
            <p>Submission reference: <strong>{submission.submissionId}</strong></p>
            <div className="actions">
              <button type="button" onClick={download}>Download JPG</button>
              <button type="button" onClick={() => { setSubmission(null); setMessage(''); setFirstName(''); setConsents([false, false, false, false]); setImageBlob(null) }}>Create another card</button>
            </div>
          </section>
        )}

        <section className="section tracking" aria-labelledby="tracking-title">
          <h2 id="tracking-title">Track your volunteer time</h2>
          <p>This is guidance only. Verify that these values reflect your actual participation before submitting.</p>
          <ul>
            <li>Activity: {config.activityName}</li>
            <li>Event date: {config.eventDate}</li>
            <li>Event duration: {config.eventDuration}</li>
            <li>Professional skills used: No</li>
            <li>Volunteer rewards: Company Match, when eligible</li>
          </ul>
          <a className="button primary" href={config.trackingUrl} target="_blank" rel="noopener noreferrer">Track my volunteer time</a>
        </section>

        <section className="section privacy" aria-labelledby="privacy-title">
          <h2 id="privacy-title">Privacy and responsible use</h2>
          <p>No sign-in is required. The app does not ask for contact, employment, family, or medical information. Do not include those details in your card. AI features are optional and never submit on your behalf.</p>
        </section>
      </main>
      <footer>{config.footerText}</footer>
    </>
  )
}

export default App
