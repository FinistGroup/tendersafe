const express = require('express');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB = path.join(__dirname, 'data', 'tenders.json');

function readDB() {
  try { return JSON.parse(fs.readFileSync(DB, 'utf8')); }
  catch { return { tenders: [] }; }
}
function writeDB(data) { fs.writeFileSync(DB, JSON.stringify(data, null, 2)); }

app.get('/api/tenders', (req, res) => res.json(readDB()));

app.post('/api/tenders', (req, res) => {
  const db = readDB();
  const t = { ...req.body, id: Date.now(), added: new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) };
  db.tenders.push(t);
  writeDB(db);
  res.json(t);
});

app.patch('/api/tenders/:id', (req, res) => {
  const db = readDB();
  const i = db.tenders.findIndex(t => String(t.id) === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Not found' });
  db.tenders[i] = { ...db.tenders[i], ...req.body };
  writeDB(db);
  res.json(db.tenders[i]);
});

app.delete('/api/tenders/:id', (req, res) => {
  const db = readDB();
  db.tenders = db.tenders.filter(t => String(t.id) !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

app.get('/api/etenders/search', async (req, res) => {
  const provinces = req.query.provinces ? req.query.provinces.split(',').filter(Boolean) : [];
  const CATS = ['Financial and insurance activities','Insurance, reinsurance and pension funding, except compulsory social security','Computer programming, consultancy and related activities','Information and communication','Information service activities'];
  try {
    let data = JSON.parse(fs.readFileSync('./data/etenders_cache.json','utf8'));
    data = data.filter(t => CATS.includes(t.category));
    if (provinces.length > 0) {
      data = data.filter(t => provinces.includes(t.province));
    }
    const INS_CATS = ['Financial and insurance activities','Insurance, reinsurance and pension funding, except compulsory social security'];
    const tenders = data.map(t => ({
      ocid: String(t.id||t.tender_No),
      name: t.description||t.tender_No||'Untitled',
      ref: t.tender_No||'',
      entity: t.department||'Unknown',
      category: t.category||'General',
      value: 0,
      deadline: t.closing_Date?t.closing_Date.split('T')[0]:'',
      province: t.province||'National',
      sector: INS_CATS.includes(t.category)?'Insurance':'Tech',
      status:'evaluating',
      source:'etenders',
      compulsoryBriefing: t.briefingCompulsory||false,
      briefingDate: t.compulsory_briefing_session||'',
      briefingVenue: t.briefingVenue||'',
      eSubmission: t.eSubmission||false
    }));
    res.json({tenders, total: tenders.length});
  } catch(err) {
    console.error('error:', err.message);
    res.status(500).json({error: err.message});
  }
});

function extractProvince(name) {
  const p = ['Gauteng','KwaZulu-Natal','Western Cape','Eastern Cape','Limpopo','Mpumalanga','Northern Cape','North West','Free State'];
  return p.find(x => name.includes(x)) || 'National';
}
function mapSector(cat) {
  cat = (cat||'').toLowerCase();
  if (cat.includes('health')||cat.includes('insur')) return 'Insurance';
  if (cat.includes('train')||cat.includes('edu')) return 'Training';
  if (cat.includes('work')||cat.includes('infra')||cat.includes('construct')) return 'Construction';
  if (cat.includes('service')||cat.includes('it')||cat.includes('tech')) return 'Tech';
  return 'Other';
}

app.post('/api/agent-john', async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'No API key' });
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2000, system: `You are Agent John, an expert bid strategist specialising in South African government tenders. You have deep knowledge of PFMA, PPPFA, BBBEE requirements, CSD registration, tax compliance, and SCM regulations.

When analysing a tender, produce a structured report with the following sections:

## BID / NO-BID VERDICT
State clearly: BID or NO-BID. Give a one-sentence reason.

## FIT SCORE
Rate 1-10 and explain: How well does this tender match a technology/insurance/financial services company?

## TENDER SUMMARY
- Department and sphere of government
- What they actually want (plain English)
- Contract duration and estimated value if stated
- Submission deadline and method (eSubmission or physical)
- Compulsory briefing: yes/no, date, venue

## COMPLIANCE CHECKLIST
List every mandatory requirement and whether it is standard or unusual:
- Tax clearance (SARS PIN)
- CSD registration
- BBBEE certificate level required
- Any specific certifications or registrations
- Local content requirements if any

## KEY RISKS
List 3-5 specific risks with this tender. Be direct — incumbent advantage, vague scope, short turnaround, price-only evaluation, etc.

## WIN STRATEGY
How should a bidder position to win? What differentiators matter? What evaluation criteria should they optimise for?

## PRICING APPROACH
What pricing strategy makes sense? Any red flags on budget or rate benchmarks?

## NEXT 48 HOURS
Specific action items in priority order. Include document gathering, site visits, clarification questions to submit.

Be direct, specific, and commercially sharp. No generic advice. If information is missing from the tender, say so explicitly.`, messages: req.body.messages }),
      signal: AbortSignal.timeout(30000)
    });
    const data = await r.json();
    console.log('Anthropic:', JSON.stringify(data).slice(0,200));
    res.json(data);
  } catch (err) {
    console.error('Agent John:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT || 3000, () => console.log('\n  TenderSafe is running\n  → http://localhost:' + (process.env.PORT || 3000) + '\n'));
