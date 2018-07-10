import { db } from '../main';

export async function acknowledge(req, res) {
  let { notificationIds } = req.query;

  try {
    let result = await db.query('UPDATE notifications SET acknowledged = true WHERE id = ANY ($1)', [notificationIds]);

    let httpStatus = result.rowCount == 0 ? 404 : 204;
    res.status(httpStatus).end();
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
}