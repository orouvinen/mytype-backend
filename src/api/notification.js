import { db } from '../main';

export async function acknowledge(req, res) {
  let { notificationId } = req.params.id;

  try {
    let result = await db.query('UPDATE notifications SET acknowledged=1 WHERE id=?', [notificationId]);

    let httpStatus = result.rowCount == 0 ? 404 : 204;
    res.status(httpStatus).end();
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
}