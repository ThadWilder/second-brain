require('dotenv').config();
const express = require('express');
const Airtable = require('airtable');
const OpenAI = require('openai');

const app = express();
app.use(express.json());

const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN }).base(process.env.AIRTABLE_BASE_ID);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Table IDs
const INBOX_TABLE = 'tbloCoqAPsj1MF680';
const TASKS_TABLE = 'tblcwCcjVI4iuqI2X';
const INITIATIVES_TABLE = 'tblkR37ej5Di2htQo';

// Health check
app.get('/', (req, res) => res.send('Second Brain is running.'));

// Airtable webhook hits this endpoint when a new Inbox record is created
app.post('/process-inbox', async (req, res) => {
  try {
    const { recordId } = req.body;

    if (!recordId) {
      return res.status(400).json({ error: 'Missing recordId' });
    }

    console.log(`Processing inbox record: ${recordId}`);

    // 1. Fetch the inbox record
    const inboxRecord = await base(INBOX_TABLE).find(recordId);
    const rawContent = inboxRecord.get('Raw Content') || '';
    const brand = inboxRecord.get('Brand') || '';
    const title = inboxRecord.get('Title') || '';

    if (!rawContent) {
      return res.status(200).json({ message: 'No raw content, skipping.' });
    }

    // 2. Fetch existing tasks to avoid duplicates
    const existingTasks = [];
    await base(TASKS_TABLE).select({ fields: ['Task Name', 'Brand'] }).eachPage((records, next) => {
      records.forEach(r => existingTasks.push({
        name: r.get('Task Name') || '',
        brand: r.get('Brand') || ''
      }));
      next();
    });

    // 3. Fetch initiatives to find matches
    const initiatives = [];
    await base(INITIATIVES_TABLE).select({ fields: ['Initiative Name', 'Brand', 'Status'] }).eachPage((records, next) => {
      records.forEach(r => initiatives.push({
        id: r.id,
        name: r.get('Initiative Name') || '',
        brand: r.get('Brand') || '',
        status: r.get('Status') || ''
      }));
      next();
    });

    // 4. Call OpenAI
    const prompt = `You are a marketing operations assistant for a franchise marketing director managing these brands: MaidPro, Mold Medics, Granite Garage Floors, USA Insulation, Miracle Method, Heating & Air Paramedics, Plumbing Paramedics, Men in Kilts, Pestmaster.

You will receive an inbox item and must:
1. Identify ALL action tasks that need to be created from this content
2. Avoid duplicating any existing tasks listed below
3. If a task relates to an existing initiative, note the initiative name

INBOX ITEM:
Title: ${title}
Brand: ${brand}
Content: ${rawContent}

EXISTING TASKS (do not duplicate these):
${existingTasks.map(t => `- ${t.brand}: ${t.name}`).join('\n') || 'None'}

EXISTING INITIATIVES (reference only — match by name/topic if relevant):
${initiatives.map(i => `- ${i.brand}: ${i.name} [${i.status}]`).join('\n') || 'None'}

Return ONLY a valid JSON array of tasks. Each task:
{
  "task_name": "clear short action title",
  "priority": "High" or "Medium" or "Low",
  "due_date": "YYYY-MM-DD or null",
  "notes": "enough detail to act without reading the original email",
  "related_initiative": "exact initiative name if matched, or null"
}

If no tasks are needed, return an empty array [].
Return ONLY the JSON array, no other text.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2
    });

    const responseText = completion.choices[0].message.content.trim();
    let tasks = [];

    try {
      // Strip markdown code blocks if present
      const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      tasks = JSON.parse(cleaned);
    } catch (e) {
      console.error('Failed to parse OpenAI response:', responseText);
      return res.status(500).json({ error: 'Failed to parse AI response', raw: responseText });
    }

    if (!Array.isArray(tasks) || tasks.length === 0) {
      console.log('No tasks identified for this inbox record.');
      return res.status(200).json({ message: 'No tasks to create.' });
    }

    // 5. Create each task in Airtable
    const created = [];
    for (const task of tasks) {
      // Find matching initiative record ID if referenced
      let initiativeLink = null;
      if (task.related_initiative) {
        const match = initiatives.find(i =>
          i.name.toLowerCase().includes(task.related_initiative.toLowerCase()) ||
          task.related_initiative.toLowerCase().includes(i.name.toLowerCase())
        );
        if (match) initiativeLink = [match.id];
      }

      const fields = {
        'Task Name': task.task_name,
        'Brand': brand,
        'Priority': task.priority,
        'Notes': task.notes,
        'Status': 'To Do',
        'Source Inbox': [recordId]
      };

      if (task.due_date) fields['Due Date'] = task.due_date;
      if (initiativeLink) fields['Initiative'] = initiativeLink;

      const newRecord = await base(TASKS_TABLE).create(fields);
      created.push({ id: newRecord.id, task: task.task_name });
      console.log(`Created task: ${task.task_name}`);
    }

    // 6. Mark inbox record as processed
    await base(INBOX_TABLE).update(recordId, { 'Status': 'In Progress' });

    return res.status(200).json({
      message: `Created ${created.length} task(s)`,
      tasks: created
    });

  } catch (err) {
    console.error('Error processing inbox record:', err);
    return res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Second Brain running on port ${PORT}`));
