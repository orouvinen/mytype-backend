import { db } from '../main';
import { addCompetition, getRunningCompetitions } from '../competition-store';


// Creates a new typing test.
// If the typing test is for a competition, create a competition
// in the competition store as well.
export function createTypingTest(req, res) {
  const { language, finished, competition } = req.body;

  db.query('INSERT INTO typing_tests(language, created_at, competition, finished) ' +
    'VALUES ($1, CURRENT_TIMESTAMP, $2, $3) RETURNING id, language, created_at', [language, competition, finished])
    .then(result => {
      if (result.rows.length !== 1)
        return res.status(501).end();
      else {
        const typingTestId = result.rows[0].id;

        if (competition) {
          addCompetition({
            id: typingTestId,
            createdAt: result.rows[0].created_at,
            language,
            finished: false,
            createdBy: req.user.name,
          });
        }
        res.set('Location', '/api/typingtests/' + typingTestId);
        res.status(201).end();
      }
    })
    .catch(err => {
      return res.status(500).json({ error: err.message });
    });
}


function getCompetition(req, res) {
  // if req.params.id is found in competition store, return it,
  // otherwise get the competition from database?
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
    db.query('SELECT id, language, created_at, finished FROM typing_tests ' +
      statusFilter + limitClause + offsetClause)
    .then(result => {
      resolve(result.rows);
    })
    .catch(err => {
      reject(err);
    });
  });
}