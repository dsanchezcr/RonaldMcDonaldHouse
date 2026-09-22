# Accessibility test checklist

Target: WCAG 2.2 AA. Automated checks supplement, but do not replace, manual testing.

- [ ] Complete the journey with keyboard only; focus order is logical and visible, with no traps.
- [ ] Test Edge + Narrator, Chrome + NVDA, and Safari + VoiceOver; headings, labels, errors, selection state, live announcements, and confirmation are understandable.
- [ ] Verify each approved thumbnail's alt text with event owners and verify decorative images are ignored.
- [ ] Verify the canvas text equivalent announces the selected design and full message.
- [ ] Test English plus accented, CJK, and approved RTL text; verify direction, line breaks, glyphs, wrapping, and exported JPG.
- [ ] Zoom to 200% at 1280 CSS pixels without loss of content/functionality or two-dimensional page scrolling.
- [ ] Test 320px mobile width, touch targets, landscape, and reflow.
- [ ] Test Windows High Contrast/forced colors and contrast of text, controls, focus, errors, disabled states, and generated cards.
- [ ] Test reduced motion; confirm no flashing, auto-moving content, or time-limited interactions.
- [ ] Confirm errors identify fields in text, async operations announce progress/result, and focus moves appropriately after blocking errors.
- [ ] Test AI disabled/unavailable, network offline, storage failure, retry, duplicate submit, and retained download.
- [ ] Run axe in each primary state and resolve all serious/critical findings.
