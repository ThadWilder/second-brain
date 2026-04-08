require('dotenv').config();
const express = require('express');
const Airtable = require('airtable');
const OpenAI = require('openai');

const app = express();
app.use(express.json());

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

// Webhook state — stored in memory, refreshed on startup and daily
let webhookId = process.env.WEBHOOK_ID || null;

// ─── Health check ──────────────────────────────────────────────────────────
app.get('/', (req, res) => res.send('Second Brain is running.'));

// ─── Webhook renewal ───────────────────────────────────────────────────────
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

// Renew every 7 days (webhook expires after ~7 days, Airtable max is 7 days)
setInterval(renewWebhook, 7 * 24 * 60 * 60 * 1000);
// Also renew on startup
renewWebhook();

// ─── Helper: fetch all records from a table ────────────────────────────────
async function fetchAll(tableId, fields) {
  const records = [];
  await base(tableId).select({ fields }).eachPage((page, next) => {
    page.forEach(r => records.push(r));
    next();
  });
  return records;
}

// ─── Helper: find brand record ID by name ──────────────────────────────────
async function findBrandId(brandName) {
  if (!brandName) return null;
  const brands = await fetchAll(TABLES.BRANDS, ['Brand Name']);
  const match = brands.find(b =>
    (b.get('Brand Name') || '').toLowerCase() === brandName.toLowerCase()
  );
  return match ? match.id : null;
}

// ─── Main webhook handler ──────────────────────────────────────────────────
app.post('/process-inbox', async (req, res) => {
  try {
    // Airtable sends a ping — we need to fetch the actual new records
    // The body may contain changedTablesById with the new record IDs
    let recordId = req.body.recordId;

    // If Airtable sends the standard webhook payload, extract the record ID
    if (!recordId && req.body.changedTablesById) {
      const tableChanges = req.body.changedTablesById[TABLES.INBOX];
      if (tableChanges && tableChanges.createdFieldsById) {
        // not what we want — skip
      }
      if (tableChanges && tableChanges.createdRecordsById) {
        const ids = Object.keys(tableChanges.createdRecordsById);
        if (ids.length > 0) recordId = ids[0];
      }
    }

    if (!recordId) {
      return res.status(200).json({ message: 'No record ID found in payload.' });
    }

    console.log(`Processing inbox record: ${recordId}`);

    // 1. Fetch the inbox record
    const inboxRecord = await base(TABLES.INBOX).find(recordId);
    const rawContent = inboxRecord.get('Raw Content') || '';
    const brandRaw = inboxRecord.get('Brand') || '';
    const title = inboxRecord.get('Title') || '';
    const source = inboxRecord.get('Source') || '';

    // Brand may be a linked record array or a string
    const brandName = Array.isArray(brandRaw) ? brandRaw[0] : brandRaw;

    if (!rawContent) {
      return res.status(200).json({ message: 'No raw content — skipping.' });
    }

    // 2. Fetch existing tasks (for dedup)
    const existingTaskRecords = await fetchAll(TABLES.TASKS, ['Task', 'Brand']);
    const existingTasks = existingTaskRecords.map(r => ({
      name: r.get('Task') || '',
      brand: r.get('Brand') || ''
    }));

    // 3. Fetch initiatives
    const initiativeRecords = await fetchAll(TABLES.INITIATIVES, ['Initiative Name', 'Brand', 'Status']);
    const initiatives = initiativeRecords.map(r => ({
      id: r.id,
      name: r.get('Initiative Name') || '',
      brand: r.get('Brand') || '',
      status: r.get('Status') || ''
    }));

    // 4. Fetch brands for linking
    const brandId = await findBrandId(brandName);

    // 5. Call OpenAI — full brain analysis
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
  "topic": "2-5 word topic tag (e.g. 'McDuffie Invoice Dispute', 'USAI Territory Transfer')",
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
      return res.status(500).json({ error: 'Failed to parse AI response', raw: responseText });
    }

    console.log(`Analysis: category=${analysis.category}, tasks=${analysis.tasks?.length}, decisions=${analysis.decisions?.length}`);

    // Find matching initiative ID
    let initiativeId = null;
    if (analysis.related_initiative) {
      const match = initiativeRecords.find(r =>
        (r.get('Initiative Name') || '').toLowerCase().includes(analysis.related_initiative.toLowerCase()) ||
        analysis.related_initiative.toLowerCase().includes((r.get('Initiative Name') || '').toLowerCase())
      );
      if (match) initiativeId = match.id;
    }

    // 6. Update inbox record with enriched metadata
    const inboxUpdate = {
      'Status': 'Triaged'
    };
    await base(TABLES.INBOX).update(recordId, inboxUpdate);

    const createdTasks = [];
    const createdDecisions = [];

    // 7. Create tasks
    if (Array.isArray(analysis.tasks)) {
      for (const task of analysis.tasks) {
        const fields = {
          'Task': task.task_name,
          'Owner': task.owner || 'Brandy',
          'Status': 'Not Started',
          'Priority': task.priority || 'P2 Soon',
        };

        if (task.notes) fields['Blocker Notes'] = task.notes;
        if (task.due_date) fields['Due Date'] = task.due_date;

        // Link to brand
        if (brandId) fields['Brand'] = [brandId];

        const newTask = await base(TABLES.TASKS).create(fields);
        createdTasks.push({ id: newTask.id, task: task.task_name });
        console.log(`Created task: ${task.task_name}`);
      }
    }

    // 8. Create decision log entries
    if (Array.isArray(analysis.decisions)) {
      for (const decision of analysis.decisions) {
        const fields = {
          'Decision': decision.decision,
          'Made By': decision.made_by || '',
          'Rationale': decision.rationale || '',
          'Impact': decision.impact || 'Medium',
          'Date': new Date().toISOString().split('T')[0]
        };

        if (brandId) fields['Brand'] = [brandId];

        const newDecision = await base(TABLES.DECISIONS).create(fields);
        createdDecisions.push({ id: newDecision.id, decision: decision.decision });
        console.log(`Created decision: ${decision.decision}`);
      }
    }

    // 9. Mark inbox as Tasks Created if tasks were made
    if (createdTasks.length > 0) {
      await base(TABLES.INBOX).update(recordId, { 'Status': 'Tasks Created' });
    }

    return res.status(200).json({
      message: `Processed inbox record`,
      category: analysis.category,
      topic: analysis.topic,
      tasks_created: createdTasks.length,
      decisions_created: createdDecisions.length,
      tasks: createdTasks,
      decisions: createdDecisions
    });

  } catch (err) {
    console.error('Error processing inbox record:', err);
    return res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Second Brain running on port ${PORT}`);
  console.log(`Webhook ID: ${webhookId || 'not set — add WEBHOOK_ID env var'}`);
});
