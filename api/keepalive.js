// GET /api/keepalive — daily cron (vercel.json) so the Supabase free project never pauses for inactivity.
const { select, configured } = require('./_supabase');

module.exports = async (req, res) => {
  if (!configured()) return res.status(200).json({ ok: false, reason: 'supabase-not-configured' });
  try {
    const rows = await select('reservation_status_counts', { select: 'status,count' });
    res.status(200).json({ ok: true, counts: rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
};
