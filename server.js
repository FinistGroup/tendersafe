const express = require('express');
const pdfParse = require('pdf-parse');

const nodemailer = require('nodemailer');
const cron = require('node-cron');

// ── Finist Client Profile ──────────────────────────────────────────────
const FINIST_PROFILE = {
  company: 'Finist (Pty) Ltd',
  tradingAs: 'InsureBuddy / Lambda Brokers',
  registration: '2026/318089/07',
  director: 'Makabongwe Gambushe',
  address: '28 4th Street, Parkhurst, Johannesburg, Gauteng, 2193',
  fspStatus: 'FSP application pending (Lambda Brokers)',
  bbbee: 'Level 1 — 100% Black-owned',
  services: [
    'Short-term insurance broking',
    'Medical aid broking and administration',
    'Gap cover distribution',
    'AI-powered insurance aggregation and comparison',
    'Insurance admin automation for brokerages'
  ],
  email: 'support@finist.ai',
  phone: 'TBC',
  csd: 'Registration pending',
  taxClearance: 'To be confirmed'
};

// ── Email transporter ──────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: 'smtp.office365.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// ── Simple auth middleware ─────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.headers['x-auth-token'] || req.query.token;
  if (token === process.env.DASHBOARD_PASSWORD) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ── Login endpoint ─────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === process.env.DASHBOARD_PASSWORD) {
    res.json({ token: process.env.DASHBOARD_PASSWORD, ok: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

// ── Proceed/Decline endpoint ───────────────────────────────────────────
app.post('/api/tenders/:id/decision', requireAuth, (req, res) => {
  const db = readDB();
  const i = db.tenders.findIndex(t => String(t.id) === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Not found' });
  db.tenders[i].decision = req.body.decision; // 'proceed' or 'decline'
  db.tenders[i].decisionDate = new Date().toISOString();
  writeDB(db);
  res.json(db.tenders[i]);
});

// ── Bid draft endpoint ─────────────────────────────────────────────────
app.post('/api/agent-john/draft', requireAuth, async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'No API key' });
  const { tender } = req.body;
  try {
    let docText = '';
    if (tender.supportDocument?.[0]?.supportDocumentID) {
      try {
        const pdfParse = require('pdf-parse');
        const pdfUrl = `https://www.etenders.gov.za/home/Download/?blobName=${tender.supportDocument[0].supportDocumentID}.pdf&downloadedFileName=tender.pdf`;
        const pdfRes = await fetch(pdfUrl, { signal: AbortSignal.timeout(20000) });
        if (pdfRes.ok) {
          const buf = await pdfRes.arrayBuffer();
          const parsed = await pdfParse(Buffer.from(buf));
          docText = parsed.text.slice(0, 8000);
        }
      } catch(e) { console.log('PDF fetch failed:', e.message); }
    }

    const profile = FINIST_PROFILE;
    const prompt = `You are Agent John, bid writer for ${profile.company} (trading as ${profile.tradingAs}).

COMPANY PROFILE:
- Registration: ${profile.registration}
- Director: ${profile.director}
- Address: ${profile.address}
- FSP Status: ${profile.fspStatus}
- BBBEE: ${profile.bbbee}
- Services: ${profile.services.join(', ')}

TENDER:
- Name: ${tender.name}
- Reference: ${tender.ref}
- Entity: ${tender.entity}
- Province: ${tender.province}
- Deadline: ${tender.deadline}
- Compulsory Briefing: ${tender.compulsoryBriefing ? 'YES - ' + tender.briefingDate + ' at ' + tender.briefingVenue : 'No'}
- Submission: ${tender.eSubmission ? 'eSubmission' : 'Physical'}

${docText ? 'TENDER DOCUMENT:\n' + docText : ''}

Draft a complete, professional bid response for this tender on behalf of ${profile.company}. Include:
1. Cover letter addressed to the SCM office
2. Company overview and relevant experience
3. Technical proposal aligned to the scope
4. BBBEE and compliance declaration
5. For insurance tenders: list all covers required and flag which need underwriter quotes

Format each section clearly. Where information is missing (e.g. tax PIN, CSD number), insert [PLACEHOLDER - INSERT BEFORE SUBMISSION].`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4000, system: 'You are Agent John, an expert bid writer for a South African insurance brokerage.', messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(90000)
    });
    const data = await r.json();
    res.json(data);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ── RFQ generator endpoint ─────────────────────────────────────────────
app.post('/api/agent-john/rfq', requireAuth, async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'No API key' });
  const { tender, covers } = req.body;
  try {
    const prompt = `You are Agent John. Generate professional RFQ (Request for Quotation) emails to insurers for the following covers needed for a government tender.

TENDER: ${tender.name} — ${tender.entity}
BROKER: ${FINIST_PROFILE.company} (acting as intermediary)
COVERS NEEDED: ${covers.join(', ')}

For each cover, write a separate RFQ email to an insurer. Include:
- What is being insured (based on the tender)
- The government entity and contract duration
- What information is needed from the insurer to complete the bid
- Deadline for quote submission (allow 3 days before tender deadline)
- Contact: ${FINIST_PROFILE.email}

Be professional and concise.`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 3000, system: 'You are Agent John, bid strategist and writer.', messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(60000)
    });
    const data = await r.json();
    res.json(data);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Daily digest cron ──────────────────────────────────────────────────
async function sendDailyDigest() {
  try {
    const key = process.env.ANTHROPIC_API_KEY;
    const data = JSON.parse(fs.readFileSync('./data/etenders_cache.json', 'utf8'));
    const CATS = ['Financial and insurance activities','Insurance, reinsurance and pension funding, except compulsory social security','Computer programming, consultancy and related activities','Information and communication','Information service activities'];
    const PROVS = ['Northern Cape','Limpopo','Eastern Cape','Free State','North West'];
    
    const today = new Date().toISOString().split('T')[0];
    const recent = data.filter(t => {
      const pub = t.datePublished?.split('T')[0];
      return pub === today && CATS.includes(t.category) && PROVS.includes(t.province);
    });

    if (recent.length === 0) {
      console.log('No new tenders today');
      return;
    }

    let emailBody = '<h2>TenderSafe Daily Digest</h2>';
    emailBody += `<p>${recent.length} new tender(s) matching your profile today:</p>`;

    for (const t of recent.slice(0, 10)) {
      emailBody += `<hr><h3>${t.description||t.tender_No}</h3>`;
      emailBody += `<p><strong>Entity:</strong> ${t.department}<br>`;
      emailBody += `<strong>Province:</strong> ${t.province}<br>`;
      emailBody += `<strong>Deadline:</strong> ${t.closing_Date?.split('T')[0]||'TBC'}<br>`;
      emailBody += `<strong>Briefing:</strong> ${t.briefingCompulsory?'Compulsory':'No'}</p>`;
      emailBody += `<p><a href="https://tendersafe.onrender.com">View & Analyse on TenderSafe</a></p>`;
    }

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: process.env.DIGEST_EMAIL,
      subject: `TenderSafe: ${recent.length} new tender(s) — ${today}`,
      html: emailBody
    });
    console.log('Daily digest sent');
  } catch(err) {
    console.error('Digest error:', err.message);
  }
}

// Run at 7am daily
cron.schedule('0 7 * * *', sendDailyDigest);

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
      eSubmission: t.eSubmission||false,
      supportDocument: t.supportDocument||[]
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
    let docText = '';
    const { supportDocumentID, fileName, messages } = req.body;
    
    if (supportDocumentID) {
      try {
        const pdfUrl = `https://www.etenders.gov.za/home/Download/?blobName=${supportDocumentID}.pdf&downloadedFileName=${encodeURIComponent(fileName||'tender.pdf')}`;
        const pdfRes = await fetch(pdfUrl, { signal: AbortSignal.timeout(20000) });
        if (pdfRes.ok) {
          const buffer = await pdfRes.arrayBuffer();
          const parsed = await pdfParse(Buffer.from(buffer));
          docText = parsed.text.slice(0, 8000);
        }
      } catch(e) {
        console.log('PDF fetch failed:', e.message);
      }
    }

    const systemPrompt = `You are Agent John, an expert bid strategist specialising in South African government tenders. You have deep knowledge of PFMA, PPPFA, BBBEE requirements, CSD registration, tax compliance, and SCM regulations.

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

Be direct, specific, and commercially sharp. No generic advice. If information is missing from the tender, say so explicitly.`;

    const userMessages = messages || [];
    if (docText && userMessages.length > 0) {
      userMessages[0].content = userMessages[0].content + `

TENDER DOCUMENT CONTENT:
${docText}`;
    }

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2000, system: systemPrompt, messages: userMessages }),
      signal: AbortSignal.timeout(60000)
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
