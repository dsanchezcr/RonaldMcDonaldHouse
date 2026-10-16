import { expect, test } from '@playwright/test'

test('creates, reviews, renders, and submits an anonymous card', async ({ page }) => {
  await page.route('**/api/review-message', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'suggestion',
        safetyClassification: 'safe',
        detectedConcerns: [],
        suggestedRevision: 'Sending warmth and kind thoughts to you and your family.',
        explanation: 'This keeps your meaning and adds clarity.',
        requestId: 'review-test',
      }),
    }),
  )
  await page.route('**/api/submit-card', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        submissionId: '00000000-0000-4000-8000-000000000001',
        submittedUtc: '2026-10-16T18:05:00.000Z',
      }),
    }),
  )
  await page.goto('/')
  await page.getByLabel('Message language').selectOption('es')
  await page.getByRole('radio', { name: 'Use this design' }).first().click()
  await page.getByLabel('Encouragement message').fill('Sending warm and caring thoughts your way.')
  await page.getByRole('button', { name: 'Review my message with AI' }).click()
  await expect(page.getByText('Review the suggested message before choosing whether to use it.')).toBeVisible()
  await page.getByRole('button', { name: 'Keep original' }).click()
  for (const checkbox of await page.getByRole('checkbox').all()) await checkbox.check()
  await page.getByRole('button', { name: 'Generate JPG' }).click()
  await expect(page.getByText('Your JPG is ready to download or submit.')).toBeVisible()
  await page.getByRole('button', { name: 'Submit card' }).click()
  await expect(page.getByRole('heading', { name: 'Thank you for sharing encouragement' })).toBeVisible()
  const tracking = page.getByRole('link', { name: 'Track my volunteer time' })
  await expect(tracking).toHaveAttribute('target', '_blank')
  await expect(tracking).toHaveAttribute('rel', 'noopener noreferrer')
})

test('uses Japanese message language and blocks PII before submission', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Message language').selectOption('ja')
  const message = page.getByLabel('Encouragement message')
  await message.fill('Contact me at person@example.com')
  await expect(message).toHaveAttribute('dir', 'ltr')
  await expect(message).toHaveAttribute('lang', 'ja')
  await expect(page.getByText('Remove email addresses from your message.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Generate JPG' })).toBeDisabled()
})
