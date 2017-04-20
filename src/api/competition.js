import { db } from '../main';
import { addCompetition, getRunningCompetitions } from '../competition-store';


// Creates a new typing test.
// If the typing test is for a competition, create a competition
// in the competition store as well.
export function createCompetition(req, res) {
  const { language, finished, competition } = req.body;

  db.query('INSERT INTO competitions(language, created_at) ' +
    'VALUES ($1, CURRENT_TIMESTAMP) RETURNING id, language, created_at', [language])
    .then(result => {
      if (result.rows.length !== 1)
        return res.status(501).end();
      else {
        const competitionId = result.rows[0].id;
          // Add to competition store
          addCompetition({
            id: competitionId,
            createdAt: result.rows[0].created_at,
            language,
            finished: false,
            createdBy: req.user.name,
          });
        res.set('Location', '/api/competitions/' + competitionId);
        res.status(201).end();
      }
    })
    .catch(err => {
      return res.status(500).json({ error: err.message });
    });
}


export function getCompetitions(req, res) {
  loadCompetitions(req.query)
    .then(rows => {
      res.status(200).json({ competitions: rows });
    })
    .catch(err => {
      res.status(500).json({ error: err.message });
    });
}


/*
 * Loads competition records.
 * args: query - query parameters object
 *
 * Returns a new promise that resolves with an array of rows returned
 * or rejects with an error.
 */
function loadCompetitions(query) {
  // Return unfinished competitions directly from the competition store.
  if (query.hasOwnProperty('finished') && !query.finished)
    return Promise.resolve(getRunningCompetitions());

  let statusFilter = 'WHERE competition=true';
  let limitClause = '';
  let offsetClause = '';

  if (query.hasOwnProperty('finished'))
    statusFilter += ' AND finished=' + finished;

  if (!isNaN(parseInt(query.limit)))
    limitClause = ' LIMIT ' + limit;

  if (!isNaN(parseInt(query.offset)))
    offsetClause = ' OFFSET ' + offset;

  return new Promise((resolve, reject) => {
    db.query('SELECT id, language, created_at, finished FROM competitions ' +
      statusFilter + limitClause + offsetClause)
    .then(result => {
      resolve(result.rows);
    })
    .catch(err => {
      reject(err);
    });
  });
}