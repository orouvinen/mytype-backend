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
 * Return user's typed typing tests
 */
export const getUserTypingTests = (req, res) => {
  let typingTests = [];
  db.query('SELECT starttime, wpm, acc ' +
    'FROM typed_tests WHERE user_id=$1 ORDER BY starttime', [req.params.id])
    .then(result => {
      typingTests = result.rows.map(row => {
        return {
          startTime: row.starttime,
          endTime: row.endTime,
          wpm: row.wpm,
          acc: row.acc,
        };
      });
      res.status(200).json({ typingTests });
    })
    .catch(err => {
      res.status(500).end();
    });
};
