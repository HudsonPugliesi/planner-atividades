const { sql } = require('@vercel/postgres');

const BOARD_ID = 'default';

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS boards (
      id text PRIMARY KEY,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}

module.exports = async function handler(req, res) {
  try {
    await ensureTable();

    if (req.method === 'GET') {
      const { rows } = await sql`SELECT data FROM boards WHERE id = ${BOARD_ID}`;
      res.status(200).json(rows.length ? rows[0].data : null);
      return;
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body) || !Array.isArray(body.groups)) {
        res.status(400).json({ error: 'invalid body: expected an object with a "groups" array' });
        return;
      }
      await sql`
        INSERT INTO boards (id, data, updated_at)
        VALUES (${BOARD_ID}, ${JSON.stringify(body)}::jsonb, now())
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
      `;
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader('Allow', 'GET, POST, PUT');
    res.status(405).end('Method Not Allowed');
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
};
