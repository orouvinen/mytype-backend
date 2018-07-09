import { db } from '../main';
import { isEmpty } from '../util';
import { addResult } from '../competition-store';

/*
 * /api/users/
 */

export async function getUsers(req, res) {
  let qry = 'SELECT id, name, registered, avg_wpm, avg_acc, num_typing_tests FROM users';

  let sort = "";

  if (req.query.sort) {
    // Process possible query parameters
    sort = {
      'wpm': `avg_wpm ${req.query.order}, avg_acc ${req.query.order}`,
      'typing_tests': `num_typing_tests ${req.query.order}`,
    }[req.query.sort];
    if (!sort)
      return res.status(400).json({ error: "Invalid sorting criteria" });
  }

  if (req.query.sort)
    qry += ` ORDER BY ${sort}`;

  try {
    let { rows } = await (db.query(qry));
    res.json(rows);
  } catch(err) {
      res.status(500).json({ error: err.message });
  }
}

/*
 * Return user account data
 */
export async function getUser(req, res) {
  try {
    let { rows } =
      await db.query('SELECT id, name, num_typing_tests, avg_wpm, avg_acc FROM users WHERE id=$1',
        [req.params.id]);
    
    if (rows.length === 0)
      res.status(404).end();
    
    res.json(rows[0]);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
}


/*
 * Delete user account
 */
export async function deleteUser(req, res) {
  // For non-admins, only allow deleting your own account
  if (req.user.id !== req.params.id && !req.user.admin)
    return res.status(403).end();

  try {
    let { rows } = await db.query('DELETE FROM users WHERE id=$1 RETURNING id', [req.params.id]);

    if (rows.length === 0)
      return res.status(404).end();

    res.status(204).end();
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
}


/*
 * Return typing tests in which user has participated
 */
export function getUserResults(req, res) {
  loadUserResults(req.params.id)
    .then(results => res.status(200).json(results))
    .catch(err => res.status(500).json({ error: err.message }));
}


export async function saveResult(req, res) {
  if (isEmpty(req.body))
    return res.status(400).json({ error: "Missing request body" });

  let userId = req.params.id;
  let { startTime, endTime, wpm, acc } = req.body;
  let { competition } = req.body;


  // If no competitions was specified (undefined), A NULL value would be inserted even without
  // this check, but it's here for the sake of explicitness
  if (!competition)
    competition = null;

  /*
   * Javascript timestamps are milliseconds since epoch, but PostgreSQL
   * timestamps are seconds since epoch.
   */
  try {
    await db.query(
      'INSERT INTO results VALUES ($1, $2, to_timestamp($3), to_timestamp($4), $5, $6)' +
      ' RETURNING start_time',
      [userId, competition, startTime / 1000.0, endTime / 1000.0, wpm, acc]);

    res.set('Location', `/api/users/${userId}/results/${startTime}`);
    res.status(201).end();

    // Add to competition store and update user statistics
    let result = req.body;
    let user = await loadUserObject(userId);
    result.user = { id: user.id, name: user.name };

    if (competition)
      addResult(competition, result);

    let newAvgWpm, newAvgAcc;
    let { numTypingTests } = user;

    if (numTypingTests > 0) {
      newAvgWpm = (user.avgWpm + wpm) / 2.0;
      newAvgAcc = (user.avgAcc + acc) / 2.0;
    } else {
      // This was the first typing test for the user
      newAvgWpm = wpm;
      newAvgAcc = acc;
    }
    await db.query(
      'UPDATE users SET avg_wpm=$1, avg_acc=$2, num_typing_tests=$3 WHERE id=$4',
      [newAvgWpm, newAvgAcc, numTypingTests + 1, user.id]
    );
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getNotifications(req, res) {
  // No need to access notifcations of other users than oneself
  const userId = parseInt(req.params.id, 10);
  if (req.user.id !== userId)
    return res.status(403).end();

  try {
    let notifications = await getUserNotifications(userId);
    let events = await Promise.all(notifications.map(n => getEvent(n.event, req.user.id)));
    res.json(events);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
}


/*
 * Loaders used by API workers.
 */

export async function getEvent(eventId, userId) {
  // let { rows } = await db.query('SELECT id, type FROM events WHERE id=$1', [eventId]);
  let { rows } = await db.query(
    'SELECT e.id, e.type, n.id AS notification_id' +
    ' FROM events e' +
    ' JOIN notifications n ON n.event = e.id AND n.usr = $1' +
    ' WHERE e.id = $2', 
    [userId, eventId]);

  let event = rows[0];
  let typedEvent = await getTypedEvent(event);
  
  return typedEvent;
}


function getTypedEvent(baseEvent) {
  if (baseEvent.type === 'competition')
    return getCompetitionEvent(baseEvent);
  else
    return new Promise((_, reject) => reject("Invalid event type"));
}

async function getCompetitionEvent(baseEvent) {
  let event = {};

  event = 
    (await db.query('SELECT competition, type FROM competition_events WHERE id=$1',
      [baseEvent.id])).rows[0];

  event.notificationId = baseEvent.notificationId;

  let eventTbl, columns;

  switch (event.type) {
    case 'top_result':
      eventTbl = 'competition_top_result_events';
      columns = 'usr, wpm, ranking';
      break;

    case 'finished':
      eventTbl = 'competition_finished_events';
      columns = 'id';
      break;

    default:
      break;
  }
  let typedEvent = (await db.query(`SELECT ${columns} FROM ${eventTbl} WHERE id=$1`, [baseEvent.id])).rows[0];
  event = Object.assign(event, typedEvent);
  if (event.type === 'top_result') {
    event.user = await loadUserObject(event.usr);
    delete(event.usr);
  }
  event.acknowledged = false;
  return event;
}


async function getUserNotifications(userId) {
  let notifications =
    (await db.query('SELECT event FROM notifications WHERE usr=$1 AND acknowledged=FALSE ORDER BY created_at DESC',
      [userId])).rows;

  return notifications;
}

export async function loadUserObject(userId) {
  let { rows } = 
    await db.query('SELECT id, name, avg_wpm, avg_acc, num_typing_tests FROM users WHERE id=$1',
      [userId]);
  
  if (rows.length === 0)
    throw new Error("User not found");

  return rows[0];
}


async function loadUserResults(userId) {
  let userResults =
    (await db.query('SELECT start_time, end_time, wpm, acc FROM results WHERE usr=$1',
      [userId])).rows;
  
  return userResults;
}
