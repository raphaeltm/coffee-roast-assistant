const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;
const DATA_FILE = path.join(__dirname, '../src/data/roastProfiles.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// GET all profiles
app.get('/api/profiles', (req, res) => {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  res.json(data);
});

// PUT full data (save everything)
app.put('/api/profiles', (req, res) => {
  const data = req.body;
  // Re-index events before saving to keep indexes consistent
  data.profiles.forEach(profile => {
    profile.events.forEach((event, i) => {
      event.index = i;
    });
  });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`\n✅ Roast Profile Admin running at http://localhost:${PORT}\n`);
});
