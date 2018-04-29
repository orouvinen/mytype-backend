import { db } from '../main';
import { addCompetition, getRunningCompetitions, getCompetitionContent } from '../competition-store';
import { loadUserObject } from './user';

// Loads a competition entry.
// If there's a query parameter "loadResults" with a value of "true", then
// in addition to the normal competition attributes, all competition results
// stored so far will be returned within the object in an array with the key
// 'results'.
export async function getCompetition(req, res) {
  let competition = {};
  let results = [];
  const loadResults = req.query.hasOwnProperty('loadResults') && req.query.loadResults.toLowerCase() === "true";

  try {
    let result = await
      db.query('SELECT id, created_at, created_by, duration, language' + 
        ' FROM competitions WHERE id=$1', [req.params.id]);
      
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Competition not found' });

    let competition = result.rows[0];
    if (loadResults)
      competition.results = await loadCompetitionResults(competition.id);
    else
      competition.results = [];

    if (!competition.finished)
      competition.content = getCompetitionContent(competition.id);

    res.json(competition);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}

// Creates a new competition.
export async function createCompetition(req, res) {
  const { language, content, createdBy } = req.body;

  try {
    let result = await db.query(
      'INSERT INTO competitions(language, created_by, content)' +
      ' VALUES ($1, $3, $2) RETURNING id, language, created_at',
      [language, content, createdBy]);

    if (result.rows.length !== 1)
      return res.status(500).end();

    let competitionId = result.rows[0].id;
    addCompetition({
      id: competitionId,
      createdAt: result.rows[0].createdAt,
      createdBy,
      language,
      finished: false,
      content,
    });
    res.set('Location', '/api/competitions/' + competitionId);
    res.status(201).end();
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}


export async function getCompetitions(req, res) {
  let competitions = {};

  try {
    let comps = await loadCompetitions(req.query);
    for (let c of comps) {
      competitions[c.id] = c;
      competitions[c.id].results = await loadCompetitionResults(c.id);
    }
    res.json(competitions);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
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
async function loadCompetitions(query) {
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

  let competitions = (await 
    db.query('SELECT id, language, created_at, created_by, finished FROM competitions ' +
      statusFilter + limitClause + offsetClause)).rows;

  return competitions;
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
export async function loadCompetitionResults(competitionId, onlyTopResults = true) {
  // let userObjectPromises = [];
  // let rows = [];

  let queryTopResults = "";
  if (onlyTopResults)
    queryTopResults = 'SELECT r.usr, r.start_time, r.end_time, r.wpm, r.acc, r.competition FROM results r' +
            ' INNER JOIN ' +
            ' (SELECT MAX(wpm) wpm, usr FROM results WHERE competition=$1 GROUP BY usr) max' +
            ' ON r.usr = max.usr AND r.wpm = max.wpm ORDER BY max.wpm DESC, r.end_time ASC';
  else
    queryTopResults = 'SELECT usr, start_time, end_time, wpm, acc, competition FROM results WHERE competition=$1' +
            ' ORDER BY wpm DESC, end_time ASC';

  let competitionResults = (await db.query(queryTopResults, [competitionId])).rows;
  for (let r of competitionResults) {
    r.user = await loadUserObject(r.usr);
    delete(r.usr); // Don't keep the user id hanging around for nothing
  }
  return competitionResults;
}
