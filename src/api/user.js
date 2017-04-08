import { db } from '../main';
/*
 * /api/users/
 */


/*
 * Return user account data
 */
export const getUser = (req, res) => {
  db.query('SELECT id, name FROM users WHERE id=$1', [req.params.id])
    .then(result => {
      if (result.rows.length === 0)
        return res.status(404).json({ error: "User not found" });

      const { id, name } = result.rows[0];
      return res.status(200).json({"user": { id, name }});
    });
};


/*
 * Delete user account
 */
export const deleteUser = (req, res) => {
  // For non-admins, only allow deleting your own account
  if (req.user.id !== req.params.id && !req.user.admin)
    return res.status(401).json({ error: "Not permitted" });

  db.query('DELETE FROM users WHERE id=$1 RETURNING id', [req.params.id])
    .then(result => {
      if (result.rows.length === 0)
        return res.status(404).json({ error: "User not found" });
      else
        return res.status(204).end();
    })
    .catch(err => {
      res.status(500).end();
    });
};


/*
 * Return typing tests in which user has participated
 */
export const getUserResults = (req, res) => {
  loadUserResults(req.params.id)
    .then(results => {
      res.status(200).json({ "results": results });
    })
    .catch(err => {
      res.status(501).end();
    });
};


export const saveResult = (req, res) => {

};


/*******************************************************************************
 *
 * Loaders used by API workers.
 * These typically load an array of objects to be further transformed or
 * joined to another object by the main API worker.
 */
const loadUserResults = userId => {
  return new Promise((resolve, reject) => {
    db.query('SELECT start_time, end_time, wpm, acc FROM results WHERE usr=$1',
      [userId])
      .then(result => {
        resolve(result.rows.map(row => {
          return {
            startTime: row.start_time,
            endTime: row.end_time,
            wpm: row.wpm,
            acc: row.acc,
          };
        }));
      })
      .catch(err => {
        reject(err);
      });
  });
};
