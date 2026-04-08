require('dotenv').config();
const express = require('express');
const Airtable = require('airtable');
const OpenAI = require('openai');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const app = express();
app.use(express.json({ limit: '10mb' }));

const airtableToken = process.env.AIRTABLE_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE_ID || 'app3fQnVHX8w2BOD4';

const base = new Airtable({ apiKey: airtableToken }).base(BASE_ID);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Table IDs
const TABLES = {
  BRANDS:       'tblMYUnIWZepnUUPT',
  INBOX:        'tbloCoqAPsj1MF680',
  TASKS:        'tblcwCcjVI4iuqI2X',
  CAMPAIGNS:    'tblGTzCJrwvs2PF2A',
  DECISIONS:    'tbl0sVS3CI8sJrrEn',
  INITIATIVES:  'tblkR37ej5Di2htQo',
};

// Webhook state
let webhookId = process.env.WEBHOOK_ID || null;

// Known brands for auto-detection from email content
const KNOWN_BRANDS = [
  'MaidPro',
  'Mold Medics',
  'Granite Garage Floors',
  'USA Insulation',
  'Miracle Method',
  'Heating & Air Paramedics',
  'Plumbing Paramedics',
  'Men in Kilts',
  'Pestmaster'
];

// ─── Health check ─────────────────────────────────────────────────────────
app.get('/', (req, res) => res.send('Second Brain is running.'));

// ─── Webhook renewal ──────────────────────────────────────────────────────
async function renewWebhook() {
  try {
    if (!webhookId) {
      console.log('No webhook ID set — skipping renewal.');
      return;
    }
    const response = await fetch(
      `https://api.airtable.com/v0/bases/${BASE_ID}/webhooks/${webhookId}/refresh`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${airtableToken}` }
      }
    );
    const data = await response.json();
    if (data.expirationTime) {
      console.log(`Webhook renewed. New expiry: ${data.expirationTime}`);
    } else {
      console.error('Webhook renewal failed:', JSON.stringify(data));
    }
  } catch (err) {
    console.error('Error renewing webhook:', err.message);
  }
}

// Renew every 6 days (webhook expires after 7)
setInterval(renewWebhook, 6 * 24 * 60 * 60 * 1000);
renewWebhook();

// ─── Helpers ──────────────────────────────────────────────────────────────
async function fetchAll(tableId, fields) {
  const records = [];
  await base(tableId).select({ fields }).eachPage((page, next) => {
    page.forEach(r => records.push(r));
    next();
  });
  return records;
}

async function findBrandId(brandName) {
  if (!brandName) return null;
  const brands = await fetchAll(TABLES.BRANDS, ['Brand Name']);
  const match = brands.find(b =>
    (b.get('Brand Name') || '').toLowerCase() === brandName.toLowerCase()
  );
  return match ? match.id : null;
}

// Detect brand name from email content/subject
function detectBrand(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const brand of KNOWN_BRANDS) {
    if (lower.includes(brand.toLowerCase())) return brand;
  }
  // Common abbreviations
  if (lower.includes('ggf')) return 'Granite Garage Floors';
  if (lower.includes('usai')) return 'USA Insulation';
  if (lower.includes('mik')) return 'Men in Kilts';
  if (lower.includes('h&a') || lower.includes('hvac paramedic')) return 'Heating & Air Paramedics';
  return null;
}

// ─── Attachment text extraction ─────────────────────────────────────────
async function extractAttachmentText(attachments) {
  if (!attachments || attachments.length === 0) return '';

  const parts = [];

  for (const attachment of attachments) {
    const name = attachment.Name || 'unnamed';
    const contentType = (attachment.ContentType || '').toLowerCase();
    const content = attachment.Content; // base64 encoded

    if (!content) continue;

    const buffer = Buffer.from(content, 'base64');

    try {
      if (contentType.includes('pdf') || name.toLowerCase().endsWith('.pdf')) {
        const data = await pdfParse(buffer);
        if (data.text && data.text.trim()) {
          parts.push(`--- Attachment: ${name} ---\n${data.text.trim()}`);
          console.log(`Extracted text from PDF: ${name}`);
        }
      } else if (
        contentType.includes('word') ||
        contentType.includes('officedocument') ||
        name.toLowerCase().endsWith('.docx') ||
        name.toLowerCase().endsWith('.doc')
      ) {
        const result = await mammoth.extractRawText({ buffer });
        if (result.value && result.value.trim()) {
          parts.push(`--- Attachment: ${name} ---\n${result.value.trim()}`);
          console.log(`Extracted text from Word doc: ${name}`);
        }
      } else if (contentType.includes('text/plain') || name.toLowerCase().endsWith('.txt')) {
        const text = buffer.toString('utf8').trim();
        if (text) {
          parts.push(`--- Attachment: ${name} ---\n${text}`);
          console.log(`Extracted text from TXT: ${name}`);
        }
      } else {
        // Can't read this type — just log it exists
        parts.push(`--- Attachment: ${name} (${contentType}) — binary file, not readable ---`);
        console.log(`Skipped binary attachment: ${name} (${contentType})`);
      }
    } catch (err) {
      console.error(`Failed to parse attachment ${name}:`, err.message);
      parts.push(`--- Attachment: ${name} — could not be read ---`);
    }
  }

  return parts.join('\n\n');
}

// Strip HTML tags from email body
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Core brain analysis — shared by both email and Airtable webhook
async function analyzeAndProcess(recordId) {
  console.log(`Analyzing inbox record: ${recordId}`);

  const inboxRecord = await base(TABLES.INBOX).find(recordId);
  const rawContent = inboxRecord.get('Raw Content') || '';
  const brandRaw = inboxRecord.get('Brand') || '';
  const title = inboxRecord.get('Title') || '';
  const source = inboxRecord.get('Source') || '';

  const brandName = Array.isArray(brandRaw) ? brandRaw[0] : brandRaw;

  if (!rawContent) {
    return { message: 'No raw content — skipping.' };
  }

  const existingTaskRecords = await fetchAll(TABLES.TASKS, ['Task', 'Brand']);
  const existingTasks = existingTaskRecords.map(r => ({
    name: r.get('Task') || '',
    brand: r.get('Brand') || ''
  }));

  const initiativeRecords = await fetchAll(TABLES.INITIATIVES, ['Initiative Name', 'Brand', 'Status']);
  const initiatives = initiativeRecords.map(r => ({
    id: r.id,
    name: r.get('Initiative Name') || '',
    brand: r.get('Brand') || '',
    status: r.get('Status') || ''
  }));

  const brandId = await findBrandId(brandName);

  const prompt = `You are the marketing operations brain for Brandy Murch, a franchise marketing director managing these brands: MaidPro, Mold Medics, Granite Garage Floors, USA Insulation, Miracle Method, Heating & Air Paramedics, Plumbing Paramedics, Men in Kilts, Pestmaster.

Analyze the following inbox item and return a complete JSON object with your analysis.

INBOX ITEM:
Title: ${title}
Brand: ${brandName}
Source: ${source}
Content: ${rawContent}

EXISTING TASKS (do not duplicate):
${existingTasks.map(t => `- ${t.brand}: ${t.name}`).join('\n') || 'None'}

EXISTING INITIATIVES (match by topic/name if relevant):
${initiatives.map(i => `- ${i.brand}: ${i.name} [${i.status}]`).join('\n') || 'None'}

Return ONLY a valid JSON object with this exact structure:
{
  "category": "one of: Decision | Action | Update | Blocker | FYI | Idea | Finance",
  "topic": "2-5 word topic tag",
  "summary": "2-3 sentence summary with enough detail to act without reading the original",
  "urgency": "Today | This Week | This Month | No Rush",
  "related_initiative": "exact initiative name if matched, or null",
  "tasks": [
    {
      "task_name": "clear short action title",
      "owner": "Brandy or name if specified",
      "priority": "P1 Now | P2 Soon | P3 Someday",
      "due_date": "YYYY-MM-DD or null",
      "notes": "enough context to act without reading the original"
    }
  ],
  "decisions": [
    {
      "decision": "what was decided",
      "made_by": "who decided or empty string",
      "rationale": "why this decision was made",
      "impact": "High | Medium | Low"
    }
  ]
}

Rules:
- tasks: include ALL actionable items. Leave as empty array [] if nothing to do.
- decisions: include only if a real decision was documented. Leave as empty array [] if none.
- Do NOT create tasks that already exist in the existing tasks list.
- Return ONLY the JSON object, no other text.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2
  });

  const responseText = completion.choices[0].message.content.trim();
  let analysis;

  try {
    const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    analysis = JSON.parse(cleaned);
  } catch (e) {
    console.error('Failed to parse OpenAI response:', responseText);
    throw new Error('Failed to parse AI response');
  }

  console.log(`Analysis: category=${analysis.category}, tasks=${analysis.tasks?.length}, decisions=${analysis.decisions?.length}`);

  let initiativeId = null;
  if (analysis.related_initiative) {
    const match = initiativeRecords.find(r =>
      (r.get('Initiative Name') || '').toLowerCase().includes(analysis.related_initiative.toLowerCase()) ||
      analysis.related_initiative.toLowerCase().includes((r.get('Initiative Name') || '').toLowerCase())
    );
    if (match) initiativeId = match.id;
  }

  await base(TABLES.INBOX).update(recordId, { 'Status': 'Triaged' });

  const createdTasks = [];
  const createdDecisions = [];

  if (Array.isArray(analysis.tasks)) {
    for (const task of analysis.tasks) {
      const fields = {
        'Task': task.task_name,
        'Owner': task.owner || 'Brandy',
        'Status': 'Not Started',
        'Priority': task.priority || 'P2 Soon',
        'Source Inbox': [recordId]
      };
      if (task.notes) fields['Blocker Notes'] = task.notes;
      if (task.due_date) fields['Due Date'] = task.due_date;
      if (brandId) fields['Brand'] = [brandId];

      const newTask = await base(TABLES.TASKS).create(fields);
      createdTasks.push({ id: newTask.id, task: task.task_name });
      console.log(`Created task: ${task.task_name}`);
    }
  }

  if (Array.isArray(analysis.decisions)) {
    for (const decision of analysis.decisions) {
      const fields = {
        'Decision': decision.decision,
        'Made By': decision.made_by || '',
        'Rationale': decision.rationale || '',
        'Impact': decision.impact || 'Medium',
        'Date': new Date().toISOString().split('T')[0],
        'Source Inbox': [recordId]
      };
      if (brandId) fields['Brand'] = [brandId];

      const newDecision = await base(TABLES.DECISIONS).create(fields);
      createdDecisions.push({ id: newDecision.id, decision: decision.decision });
      console.log(`Created decision: ${decision.decision}`);
    }
  }

  if (createdTasks.length > 0) {
    await base(TABLES.INBOX).update(recordId, { 'Status': 'Tasks Created' });
  }

  return {
    category: analysis.category,
    topic: analysis.topic,
    tasks_created: createdTasks.length,
    decisions_created: createdDecisions.length,
    tasks: createdTasks,
    decisions: createdDecisions
  };
}

// ─── Airtable webhook: new Inbox record created ───────────────────────────
app.post('/process-inbox', async (req, res) => {
  try {
    let recordId = req.body.recordId;

    if (!recordId && req.body.changedTablesById) {
      const tableChanges = req.body.changedTablesById[TABLES.INBOX];
      if (tableChanges && tableChanges.createdRecordsById) {
        const ids = Object.keys(tableChanges.createdRecordsById);
        if (ids.length > 0) recordId = ids[0];
      }
    }

    if (!recordId) {
      return res.status(200).json({ message: 'No record ID found in payload.' });
    }

    const result = await analyzeAndProcess(recordId);
    return res.status(200).json(result);

  } catch (err) {
    console.error('Error in /process-inbox:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Debug endpoint — logs raw Postmark payload ─────────────────────────
app.post('/debug-email', async (req, res) => {
  console.log('DEBUG POSTMARK PAYLOAD:');
  console.log(JSON.stringify(req.body, null, 2));
  return res.status(200).json({ received: true });
});

// ─── Postmark inbound email endpoint ─────────────────────────────────────
app.post('/inbound-email', async (req, res) => {
  try {
    const email = req.body;

    // Extract email fields
    const fromEmail = email.From || '';
    const fromName = email.FromName || fromEmail;
    const subject = email.Subject || '(no subject)';
    const textBody = email.TextBody || '';
    const htmlBody = email.HtmlBody || '';
    const date = email.Date || new Date().toISOString();

    // Prefer plain text; fall back to stripped HTML
    const bodyText = textBody || stripHtml(htmlBody);

    // Extract text from attachments
    const attachments = email.Attachments || [];
    const attachmentText = await extractAttachmentText(attachments);
    const attachmentNames = attachments.map(a => a.Name).filter(Boolean);

    // Build rich raw content — body + all attachment text
    let rawContent = `From: ${fromName} <${fromEmail}>
Date: ${date}
Subject: ${subject}

${bodyText}`;

    if (attachmentText) {
      rawContent += `\n\n${attachmentText}`;
    } else if (attachmentNames.length > 0) {
      rawContent += `\n\nAttachments (not readable): ${attachmentNames.join(', ')}`;
    }

    // Auto-detect brand from subject + body
    const detectedBrand = detectBrand(subject + ' ' + bodyText);

    console.log(`Inbound email: "${subject}" from ${fromEmail}, brand detected: ${detectedBrand || 'none'}`);

    // Create Inbox record
    const fields = {
      'Title': subject,
      'Raw Content': rawContent,
      'Source': 'Email',
      'Status': 'New',
      'Date Captured': new Date(date).toISOString().split('T')[0]
    };

    // If brand detected, find and link it
    if (detectedBrand) {
      const brandId = await findBrandId(detectedBrand);
      if (brandId) fields['Brand'] = [brandId];
    }

    const newRecord = await base(TABLES.INBOX).create(fields);
    console.log(`Created Inbox record: ${newRecord.id}`);

    // The Airtable webhook will auto-trigger analysis — but we also kick it
    // off directly here so there's no delay
    analyzeAndProcess(newRecord.id).catch(err =>
      console.error('Background analysis error:', err.message)
    );

    // Respond immediately to Postmark (must be fast)
    return res.status(200).json({ message: 'Email received', recordId: newRecord.id });

  } catch (err) {
    console.error('Error in /inbound-email:', err);
    return res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Second Brain running on port ${PORT}`);
  console.log(`Webhook ID: ${webhookId || 'not set — add WEBHOOK_ID env var'}`);
  console.log(`Inbound email endpoint: POST /inbound-email`);
});
