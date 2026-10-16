import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { cardFingerprint, generateBackground, reviewMessage, serviceErrorKey, submitCard } from './api'
import { cardToBlob, createCardFilename, renderCard } from './cardRenderer'
import { config, designs } from './config'
import { browserLanguage, format, isLanguage, languages, messages, type Language, type MessageKey } from './locales'
import type { CardDesign, CardState, ReviewResponse, SubmissionResponse, TextAlign } from './types'
import { isRtlLanguage, validateFirstName, validateMessage } from './validation'

function App() {
  const [uiLanguage, setUiLanguage] = useState(() => browserLanguage(navigator.languages))
  const t = messages[uiLanguage]
  const [design, setDesign] = useState<CardDesign | null>(null)
  const [message, setMessage] = useState('')
  const [firstName, setFirstName] = useState('')
  const [language, setLanguage] = useState<Language>(uiLanguage)
  const cardText = messages[language]
  const [fontSize, setFontSize] = useState(54)
  const [textAlign, setTextAlign] = useState<TextAlign>('center')
  const [consents, setConsents] = useState([false, false, false, false])
  const [status, setStatus] = useState<MessageKey | null>(null)
  const [busy, setBusy] = useState<'review' | 'background' | 'generate' | 'submit' | null>(null)
  const [review, setReview] = useState<ReviewResponse | null>(null)
  const [aiPrompt, setAiPrompt] = useState('')
  const [imageBlob, setImageBlob] = useState<{ blob: Blob; state: CardState } | null>(null)
  const [submission, setSubmission] = useState<{ result: SubmissionResponse; state: CardState } | null>(null)
  const [error, setError] = useState<MessageKey | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const concerns = useMemo(() => validateMessage(message, config.maxMessageLength), [message])
  const firstNameError = validateFirstName(firstName)
  const state = useMemo(
    () => design ? { design, message, firstName, language, textAlign, fontSize } : null,
    [design, message, firstName, language, textAlign, fontSize],
  )
  const valid = concerns.length === 0 && !firstNameError
  const finalChecksComplete = consents.every(Boolean)
  const readyForFinalActions = Boolean(state) && valid && finalChecksComplete && busy === null

  function changeCardLanguage(value: Language) {
    setLanguage(value)
    setReview(null)
    setStatus(null)
    setError(null)
    if (value !== 'en' && design?.embeddedEnglish) setDesign(null)
  }

  function changeMessage(value: string) {
    setMessage(value)
    setReview(null)
    setStatus(null)
    setError(null)
  }

  useEffect(() => {
    document.documentElement.lang = uiLanguage
    document.title = config.activityName || t.appTitle
    document.querySelector('meta[name="description"]')?.setAttribute('content', t.intro)
  }, [uiLanguage, t])

  useEffect(() => {
    let active = true
    canvasRef.current?.getContext('2d')?.clearRect(0, 0, 800, 450)
    if (!state) return
    renderCard(state)
      .then((canvas) => {
        if (!active || !canvasRef.current) return
        canvasRef.current.getContext('2d')?.drawImage(canvas, 0, 0, canvasRef.current.width, canvasRef.current.height)
      })
      .catch(() => { if (active) setError('previewError') })
    return () => {
      active = false
    }
  }, [state])

  async function generateJpg() {
    setError(null)
    if (!state) {
      setError('chooseDesignError')
      return null
    }
    setBusy('generate')
    try {
      const blob = await cardToBlob(state)
      setImageBlob({ blob, state })
      setStatus('jpgReady')
      return blob
    } catch {
      setError('generateError')
      return null
    } finally {
      setBusy(null)
    }
  }

  async function download() {
    const blob = imageBlob?.state === state ? imageBlob.blob : await generateJpg()
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
    setError(null)
    try {
      setReview(await reviewMessage(message, language))
      setStatus('reviewComplete')
    } catch (caught) {
      setError(serviceErrorKey(caught, 'reviewError'))
    } finally {
      setBusy(null)
    }
  }

  async function requestBackground() {
    setBusy('background')
    setError(null)
    setStatus('imageGenerating')
    try {
      const result = await generateBackground(aiPrompt, language)
      setDesign({
        id: `ai-${result.requestId}`,
        title: t.aiDesign,
        description: result.accessibleDescription,
        image: result.imageDataUrl,
        source: 'ai-generated',
        textColor: '#2f241f',
        panelColor: 'rgba(255, 250, 239, 0.9)',
      })
      setImageBlob(null)
      setStatus('backgroundReady')
    } catch (caught) {
      setStatus(null)
      setError(serviceErrorKey(caught, 'backgroundError'))
    } finally {
      setBusy(null)
    }
  }

  async function upload() {
    if (!state) {
      setError('chooseDesignError')
      return
    }
    if (!valid || !consents.every(Boolean)) {
      setError('checksError')
      return
    }
    const blob = imageBlob?.state === state ? imageBlob.blob : await generateJpg()
    if (!blob) return
    setBusy('submit')
    setError(null)
    try {
      const fingerprint = await cardFingerprint(state, config.consentVersion)
      const saved = JSON.parse(sessionStorage.getItem('rmh-idempotency') || '{}') as { fingerprint?: string; key?: string }
      const key = saved.fingerprint === fingerprint && saved.key ? saved.key : crypto.randomUUID()
      sessionStorage.setItem('rmh-idempotency', JSON.stringify({ fingerprint, key }))
      const result = await submitCard(blob, language, state.design.source, config.consentVersion, key)
      setSubmission({ result, state })
      setStatus('submitted')
      sessionStorage.removeItem('rmh-idempotency')
    } catch (caught) {
      setError(serviceErrorKey(caught, 'submitError'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <a className="skip-link" href="#main">{t.skip}</a>
      <header className="site-header">
        <img src="/assets/Ronald_McDonald_House_Logo.svg" alt="Ronald McDonald House" className="brand-logo" />
        <span>{config.eventTitle || t.eventTitle}</span>
        <div className="language-picker">
          <label htmlFor="ui-language">{t.uiLanguage}</label>
          <select id="ui-language" value={uiLanguage} disabled={busy !== null} onChange={(event) => {
            const value = event.target.value
            if (isLanguage(value)) { setUiLanguage(value); changeCardLanguage(value) }
          }}>
            {languages.map((item) => <option value={item.code} key={item.code} lang={item.code}>{item.label}</option>)}
          </select>
        </div>
      </header>
      {error && <div className="floating-alert" role="alert">{t[error]}</div>}
      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          {(config.eventDate || config.eventTime) && <p className="eyebrow">{[config.eventDate, config.eventTime].filter(Boolean).join(' · ')}</p>}
          <h1 id="hero-title">{config.activityName || t.appTitle}</h1>
          <p>{t.intro}</p>
          <p className="privacy-note"><strong>{t.anonymous}</strong> {t.noPrivate}</p>
          <div className="actions">
            <a className="button primary" href="#designs">{t.create}</a>
            <a className="button secondary" href="#how-it-works">{t.how}</a>
          </div>
        </section>

        <section id="how-it-works" className="section">
          <h2>{t.how}</h2>
          <ol className="steps">
            {t.steps.map((label, index) => <li key={label}><strong>{label}</strong><span>{t.stepHelp[index]}</span></li>)}
          </ol>
        </section>

        <section id="designs" className="section" aria-labelledby="design-title">
          <p className="step-label">{format(t.step, { number: 1 })}</p>
          <h2 id="design-title">{t.designHeading}</h2>
          <div className="design-grid" role="radiogroup" aria-label={t.designsLabel}>
            {designs.map((item, index) => language !== 'en' && item.embeddedEnglish ? null : (
              <article className={`design-card ${design?.id === item.id ? 'selected' : ''}`} key={item.id}>
                <img src={item.image} alt={t.designDescriptions[index]} loading="lazy" />
                <h3>{t.designTitles[index]}</h3>
                <p>{t.designDescriptions[index]}</p>
                <button type="button" role="radio" disabled={busy !== null} aria-checked={design?.id === item.id} onClick={() => { setDesign(item); setImageBlob(null) }}>
                  {design?.id === item.id ? t.selected : t.useDesign}
                </button>
              </article>
            ))}
          </div>
          <details className="ai-panel">
            <summary>{t.aiBackground}</summary>
            <p>{t.aiFallback}</p>
            <label htmlFor="ai-prompt">{t.promptLabel}</label>
            <textarea id="ai-prompt" value={aiPrompt} maxLength={300} disabled={!config.aiImageEnabled || busy !== null} onChange={(event) => setAiPrompt(event.target.value)} placeholder={t.promptPlaceholder} />
            <p className="field-help">{t.promptHelp}</p>
            <button type="button" disabled={!config.aiImageEnabled || aiPrompt.trim().length < 3 || busy !== null} onClick={requestBackground}>
              {busy === 'background' ? t.generating : config.aiImageEnabled ? t.generateBackground : t.imageDisabled}
            </button>
          </details>
        </section>

        <section className="section composer" aria-labelledby="message-title">
          <div>
            <p className="step-label">{format(t.step, { number: 2 })}</p>
            <h2 id="message-title">{t.writeHeading}</h2>
            <p>{t.writeHelp}</p>
            <label htmlFor="language">{t.messageLanguage}</label>
            <select id="language" value={language} disabled={busy !== null} aria-describedby="language-help" onChange={(event) => {
              if (isLanguage(event.target.value)) changeCardLanguage(event.target.value)
            }}>
              {languages.map((item) => <option value={item.code} key={item.code} lang={item.code}>{item.label}</option>)}
            </select>
            <p id="language-help" className="field-help">{t.languageHelp}</p>
            <label htmlFor="message">{t.messageLabel}</label>
            <textarea
              id="message"
              value={message}
              lang={language}
              disabled={busy !== null}
              dir={isRtlLanguage(language) ? 'rtl' : 'ltr'}
              maxLength={config.maxMessageLength}
              aria-describedby="message-help message-errors"
              aria-invalid={concerns.length > 0 && message.length > 0}
              onChange={(event) => changeMessage(event.target.value)}
              placeholder={cardText.placeholder}
            />
            <div id="message-help" className="field-help">{format(t.count, { count: message.length, max: config.maxMessageLength })}</div>
            {concerns.length > 0 && message.length > 0 && (
              <ul id="message-errors" className="errors">{concerns.map((item) => <li key={item.code}>{format(t.concerns[item.code], { max: config.maxMessageLength })}</li>)}</ul>
            )}
            <div className="suggestions" aria-label={t.phrasesLabel} lang={language}>
              {cardText.phrases.map((phrase) => <button type="button" key={phrase} disabled={busy !== null} onClick={() => changeMessage(`${message}${message ? ' ' : ''}${phrase}`.slice(0, config.maxMessageLength))}>{phrase}</button>)}
            </div>
            <label htmlFor="first-name">{t.firstName}</label>
            <input id="first-name" value={firstName} lang={language} disabled={busy !== null} maxLength={40} onChange={(event) => { setFirstName(event.target.value); setImageBlob(null) }} />
            <p className="field-help">{t.firstNameHelp}</p>
            {firstNameError && <p className="errors">{t.nameError}</p>}
            <aside className="guidance">
              <h3>{t.guidance}</h3>
              <p><strong>{t.try}</strong> <span lang={language}>{cardText.phrases[0]}</span></p>
              <p><strong>{t.avoid}</strong> {t.avoidHelp}</p>
            </aside>
          </div>
          <div className="preview-column">
            <h2>{t.preview}</h2>
            <div className="preview-frame">
              <canvas ref={canvasRef} width="800" height="450" role="img" aria-label={format(t.previewLabel, {
                design: design ? design.source === 'ai-generated' ? t.aiDesign : t.designTitles[designs.findIndex((item) => item.id === design.id)] : t.noDesign,
                message: message || t.noMessage,
              })} />
              {busy === 'background' && <div className="preview-overlay" role="status">{t.imageGenerating}</div>}
              {!design && busy !== 'background' && <div className="preview-overlay muted" role="status">{t.previewEmpty}</div>}
            </div>
            <div className="preview-controls">
              <label htmlFor="font-size">{t.textSize}</label>
              <input id="font-size" type="range" min="38" max="68" value={fontSize} disabled={busy !== null} onChange={(event) => { setFontSize(Number(event.target.value)); setImageBlob(null) }} />
              <fieldset disabled={busy !== null}>
                <legend>{t.alignment}</legend>
                {(['left', 'center', 'right'] as TextAlign[]).map((alignment, index) => (
                  <button type="button" aria-pressed={textAlign === alignment} onClick={() => { setTextAlign(alignment); setImageBlob(null) }} key={alignment}>{t.alignments[index]}</button>
                ))}
              </fieldset>
              <button type="button" disabled={busy !== null} onClick={() => { setFontSize(54); setTextAlign('center'); setImageBlob(null) }}>{t.reset}</button>
            </div>
          </div>
        </section>

        <section className="section ai-panel" aria-labelledby="review-title">
          <p className="step-label">{format(t.step, { number: 3 })} · {t.optional}</p>
          <h2 id="review-title">{t.reviewHeading}</h2>
          <p>{t.reviewHelp}</p>
          <button type="button" disabled={!config.aiReviewEnabled || !valid || busy !== null} onClick={requestReview}>
            {busy === 'review' ? t.reviewing : config.aiReviewEnabled ? t.reviewHeading : t.reviewDisabled}
          </button>
          {review && (
            <div className="review-result">
              <h3>{t.reviewResult}</h3>
              <p>{review.status === 'blocked' ? t.reviewBlocked : review.status === 'suggestion' ? t.reviewSuggestion : review.status === 'unavailable' ? t.reviewError : t.reviewApproved}</p>
              {review.suggestedRevision && <blockquote lang={language} dir={isRtlLanguage(language) ? 'rtl' : 'ltr'}>{review.suggestedRevision}</blockquote>}
              {review.suggestedRevision && <button type="button" disabled={busy !== null} onClick={() => changeMessage(review.suggestedRevision || message)}>{t.useSuggestion}</button>}
              <button type="button" onClick={() => setReview(null)}>{t.keepOriginal}</button>
            </div>
          )}
        </section>

        <section className="section" aria-labelledby="final-title">
          <p className="step-label">{format(t.step, { number: 4 })}</p>
          <h2 id="final-title">{t.finalChecks}</h2>
          {t.consents.map((label, index) => (
            <label className="check" key={label}>
              <input type="checkbox" checked={consents[index]} disabled={busy !== null} onChange={(event) => setConsents((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.checked : value))} />
              <span>{label}</span>
            </label>
          ))}
          <div className="actions">
            <button type="button" className="primary" disabled={!readyForFinalActions} onClick={generateJpg}>{busy === 'generate' ? t.generating : t.generate}</button>
            <button type="button" disabled={!readyForFinalActions} onClick={download}>{t.download}</button>
            <button type="button" disabled={!readyForFinalActions} onClick={upload}>{busy === 'submit' ? t.submitting : t.submit}</button>
          </div>
          <div className="status" aria-live="polite">{status && t[status]}</div>
        </section>

        {submission?.state === state && (
          <section className="section confirmation" aria-labelledby="confirmation-title">
            <h2 id="confirmation-title">{t.thanks}</h2>
            <p>{t.success}</p>
            <p>{t.reference} <strong>{submission.result.submissionId}</strong></p>
            <div className="actions">
              <button type="button" disabled={busy !== null} onClick={download}>{t.download}</button>
              <button type="button" disabled={busy !== null} onClick={() => { setSubmission(null); setMessage(''); setFirstName(''); setConsents([false, false, false, false]); setImageBlob(null); setDesign(null); setError(null); setStatus(null) }}>{t.another}</button>
            </div>
          </section>
        )}

        {config.trackingUrl && <section className="section tracking" aria-labelledby="tracking-title">
          <h2 id="tracking-title">{t.tracking}</h2>
          <p>{t.trackingHelp}</p>
          <ul>
            <li>{t.activity} {config.activityName || t.appTitle}</li>
            {config.eventDate && <li>{t.date} {config.eventDate}</li>}
            {config.eventDuration && <li>{t.duration} {config.eventDuration}</li>}
          </ul>
          <a className="button primary" href={config.trackingUrl} target="_blank" rel="noopener noreferrer">{t.track}</a>
        </section>}

        <section className="section privacy" aria-labelledby="privacy-title">
          <h2 id="privacy-title">{t.privacy}</h2>
          <p>{t.privacyHelp}</p>
        </section>
      </main>
      <footer>{config.footerText || t.footer}</footer>
    </>
  )
}

export default App
