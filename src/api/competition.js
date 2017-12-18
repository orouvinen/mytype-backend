import { db } from '../main';
import { addCompetition, getRunningCompetitions, getCompetitionContent } from '../competition-store';
import { loadUserObject } from './user';

// Loads a competition entry.
// If there's a query parameter "loadResults" with a value of "true", then
// in addition to the normal competition attributes, all competition results
// stored so far will be returned within the object in an array with the key
// 'results'.
export function getCompetition(req, res) {
  let competition = {};
  let results = [];
  const loadResults = req.query.hasOwnProperty('loadResults') && req.query.loadResults.toLowerCase() === "true";

  db.query('SELECT id, created_at, created_by, duration, language FROM competitions WHERE id=$1', [req.params.id])
    .then(result => {
      if (result.rows.length === 0)
        return res.status(404).json({ error: 'Competition not found' });

      competition = result.rows[0];
      if (loadResults)
        return loadCompetitionResults(competition.id);
      return Promise.resolve([]);
    })
    .then(result => {
      competition.results = result;
      
      if (!competition.finished)
        competition.content = getCompetitionContent(competition.id);

      res.json(competition);
    })
    .catch(err => {
      res.status(500).json({ error: err.message });
    });
}

// Creates a new competition.
export function createCompetition(req, res) {
  const { language, content, createdBy } = req.body;

  db.query('INSERT INTO competitions(language, created_at, created_by, content) ' +
    'VALUES ($1, CURRENT_TIMESTAMP, $3, $2) RETURNING id, language, created_at', [language, content, createdBy])
    .then(result => {
      if (result.rows.length !== 1)
        return res.status(500).end();
      else {
        const competitionId = result.rows[0].id;
        // Add to competition store
        addCompetition({
          id: competitionId,
          createdAt: result.rows[0].created_at,
          createdBy,
          language,
          finished: false,
          content,
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
  let competitions = {};

  loadCompetitions(req.query)
    .then(rows => {
      rows.forEach(c => {
        competitions[c.id] = c;
        competitions[c.id].results = [];
      });
      let tasks = rows.map(competition => loadCompetitionResults(competition.id));
      return Promise.all(tasks);
    })
    .then(results => {
      results.forEach(competitionResults => {
        competitionResults.forEach(result => {
          competitions[result.competition].results.push(result);
        });
      });      
      res.status(200).json(competitions);
    })
    .catch(err => {
      res.status(500).json({ error: err.message });
    });
}


export function getCompetitionResults(req, res) {
  loadCompetitionResults(req.params.id)
    .then(resultRows => res.status(200).json({ results: resultRows }))
    .catch(err => res.status(500).json({ error: err.message }));
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
  if (query.hasOwnProperty('finished') && query.finished.toLowerCase() === 'false')
    return Promise.resolve(getRunningCompetitions());

  let statusFilter = '';
  let limitClause = '';
  let offsetClause = '';

  if (query.hasOwnProperty('finished'))
    statusFilter = ' WHERE finished=' + query.finished;

  if (!isNaN(parseInt(query.limit)))
    limitClause = ' LIMIT ' + limit;

  if (!isNaN(parseInt(query.offset)))
    offsetClause = ' OFFSET ' + offset;

  return new Promise((resolve, reject) => {
    db.query('SELECT id, language, created_at, created_by, finished FROM competitions ' +
      statusFilter + limitClause + offsetClause)
      .then(result => {
        resolve(result.rows);
      })
      .catch(err => {
        reject(err);
      });
  });
}

/*
 * Loads all results for a competition.
 * User objects are constructed within the result objects, replacing the
 * plain user id's in the original flat result objects.
 * 
 * Returns a promise that resolves with an array of result objects
 * or rejects with an error object.
 * 
 * If onlyTopResults is true (the default), loads only best result for each user.
 * Otherwise gets all the results for each player.
 */
export function loadCompetitionResults(competitionId, onlyTopResults = true) {
  let userObjectPromises = [];
  let rows = [];

  let query = "";
  if (onlyTopResults)
    query = 'SELECT r.usr, r.start_time, r.end_time, r.wpm, r.acc, r.competition FROM results r' +
            ' INNER JOIN ' +
            ' (SELECT MAX(wpm) wpm, usr FROM results WHERE competition=$1 GROUP BY usr) max' +
            ' ON r.usr = max.usr AND r.wpm = max.wpm ORDER BY max.wpm DESC, r.end_time ASC';
  else
    query = 'SELECT usr, start_time, end_time, wpm, acc, competition FROM results WHERE competition=$1' +
            ' ORDER BY wpm DESC, end_time ASC';

  return new Promise((resolve, reject) => {
    db.query(query, [competitionId])
    .then(result => {
      result.rows.forEach(row => {
        rows.push(row);
        userObjectPromises.push(loadUserObject(row.usr));
      });
      return Promise.all(userObjectPromises);
    })
    .then(userObjects => {
      userObjects.forEach((user, i) => {
        rows[i].user = user;
        delete(rows[i].usr); // Don't keep the user id hanging around for nothing
      });
      resolve(rows);
    })
    .catch(err => {
      reject(err);
    });
  });
}
