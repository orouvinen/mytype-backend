import { db } from './main';

export const createTypingTest = (req, res) => {
  const { lang, createdAt, finished } = req.body;

  db.query('INSERT INTO typing_tests(language, created_at) ' +
    'VALUES ($1, $2) RETURNING id', [lang, createdAt])
    .then(result => {
      if (result.rows.length !== 1)
        return res.status(501).end();
      else {
        const typingTestId = result.rows[0].id;
        res.set('Location', '/api/typingtests/' + typingTestId);
        res.status(201).end();
      }
    })
    .catch(err => {
      return res.status(501).json({ error: err.message });
    });
};


export const getCompetitions = (req, res) => {
  const { finished, count, from } = req.query;

  loadCompetitions(finished, count, from)
    .then(rows => {
      res.status(200).json({ competitions: rows });
    })
    .catch(err => {
      res.status(500).json({ error: err.message });
    });
};

/*
 * Loads competition records.
 * args:
 *  finished: false/true
 *  limit: max number of rows to fetch
 *  offset: row number start from (0-based)
 *
 * Returns a new promise that resolves with an array of rows returned
 * by the database, or rejects with an error.
 */
const loadCompetitions = (finished, limit, offset) => {
  let statusFilter = 'WHERE competition=true';
  let limitClause = '';
  let offsetClause = '';

  if (finished === 'true' || finished === 'false')
    statusFilter += ' AND finished=' + finished;

  if (!isNaN(parseInt(limit)))
    limitClause = ' LIMIT ' + limit;

  if (!isNaN(parseInt(offset)))
    offsetClause = ' OFFSET ' + offset;

  return new Promise((resolve, reject) => {
    db.query('SELECT id, language, created_at, finished FROM typing_tests ' +
      statusFilter + limitClause + offsetClause)
    .then(result => {
      resolve(result.rows);
    })
    .catch(err => {
      reject(err);
    });
  });
};
