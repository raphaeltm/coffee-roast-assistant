# Session TODO — Pick up here next time

## Done this session
- [x] Added `estimated_time_seconds` to all events in JSON (0 for index 0, null for the rest)
- [x] Updated TypeScript types to include `estimated_time_seconds: number | null`
- [x] Added `formatTime` / `parseTime` utilities (seconds ↔ M:SS)
- [x] Built local browser admin (`admin/`) — edit profiles, events, times, actions, notes

---

## Next: Wire up the timer in the app (MVP 2)

### Step 1 — Fill in estimated times via the admin
- Run `cd admin && npm start` → open http://localhost:3001
- Edit each event for both profiles and fill in `Est. Time` (M:SS format)
- Hit "Save to JSON" — changes write directly to `src/data/roastProfiles.json`
- These times are the reference for the pre-alert system

### Step 2 — Start the timer when roast begins
- In `roastStore.ts`: add `roastStartedAt: number | null`
- Set it to `Date.now()` when the user confirms index 0 (clicks Next on first event)
- Expose `elapsedSeconds` as a derived value

### Step 3 — Display elapsed time on RoastScreen
- Show a running M:SS timer in the roast screen header (advisory label)
- Use `setInterval` in the component, display only — never used as a trigger

### Step 4 — Pre-alert logic
- In engine: compare `elapsedSeconds` against `nextEvent.estimated_time_seconds`
- If within 10 seconds → set `preAlertActive: true` in store
- RoastScreen shows a warning banner: "Next step in ~Xs"
- IMPORTANT: pre-alert never auto-advances the step

### Step 5 — Sound / haptic alert (Phase 2)
- Install `expo-haptics`
- Trigger haptic on pre-alert
- Optional: sound via `expo-av`

---

## Admin improvements (future, low priority)
- Drag-and-drop event reordering (currently up/down arrows)
- Duplicate profile button
- Export/import JSON backup
