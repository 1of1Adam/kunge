# Reading position persistence (localStorage)

## Goal
Persist and restore a reader's position per document page using localStorage.

## Non-goals
- Cross-device sync.
- Server-side persistence.

## Requirements
- Save reading position per pathname.
- Restore on page load.
- Prefer heading anchor restore, fallback to scroll percent.

## Storage key
`kunge:reading-position:<pathname>`

## Stored data
```json
{
  "percent": 0.53,
  "y": 812,
  "headingId": "some-heading-id",
  "updatedAt": 1735180800000
}
```

## Save behavior
- Client component wraps the docs content.
- Track scroll with a throttled handler (e.g. 150ms).
- Compute `percent = scrollY / (scrollHeight - clientHeight)`.
- Track the most recently visible heading via IntersectionObserver on `h1..h6`.
- Persist `{ percent, y, headingId, updatedAt }` to localStorage.

## Restore behavior
- On mount, read localStorage and validate shape.
- If `headingId` exists in DOM: `scrollIntoView({ block: 'start' })` and apply a small positive offset (e.g. +16px).
- Else, if `percent` is valid: scroll to `percent * (scrollHeight - clientHeight)`.
- Else, if `y` is valid: scroll to `y`.
- Delay restore using `requestAnimationFrame` and a short `setTimeout` to avoid layout shifts.
- Suppress save during restore to avoid immediate overwrite.

## Error handling
- Wrap localStorage access in try/catch.
- If IntersectionObserver is unavailable, skip heading detection and only save percent/y.

## Testing (manual)
- Scroll mid-page, refresh, verify restore.
- Navigate between two docs, verify per-path persistence.
- Remove/rename a heading, verify fallback to percent/y.
