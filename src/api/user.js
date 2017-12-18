import { db } from '../main';
import { isEmpty } from '../util';
import { addResult } from '../competition-store';

/*
 * /api/users/
 */

export function getUsers(req, res) {
  let qry = 'SELECT id, name, registered, avg_wpm, avg_acc, num_typing_tests FROM users';
 
  let sort = "";

  if (req.query.sort) {
    // Process possible query parameters
    sort = {
      'wpm': `avg_wpm ${req.query.order}, avg_acc ${req.query.order}`,
      'typing_tests': `num_typing_tests ${req.query.order}`,
    }[req.query.sort];
    if (sort === undefined)
      return res.status(400).json({ error: "Invalid request parameters "});
  }

  if (req.query.sort)
    qry += ` ORDER BY ${sort}`;

  db.query(qry)
    .then(result => {
      return res.status(200).json(result.rows);
    })
    .catch(err => {
      res.status(500).json({ error: err.message });
    });
}

/*
 * Return user account data
 */
export function getUser(req, res) {
  db.query('SELECT id, name, num_typing_tests, avg_wpm, avg_acc FROM users WHERE id=$1',
    [req.params.id])
    .then(result => {
      if (result.rows.length === 0)
        return res.status(404).json({ error: "User not found" });

      return res.status(200).json(result.rows[0]);
    });
}


/*
 * Delete user account
 */
export function deleteUser(req, res) {
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
}


/*
 * Return typing tests in which user has participated
 */
export function getUserResults(req, res) {
  loadUserResults(req.params.id)
    .then(results => {
      res.status(200).json(results);
    })
    .catch(err => {
      res.status(500).end();
    });
}


export function saveResult(req, res) {
  if (isEmpty(req.body))
    return res.status(400).json({ error: "Missing request body" });

  const { user, startTime, endTime, wpm, acc } = req.body;
  
  // If no competitions was specified, A NULL value would be inserted even without
  // this check, but it's here for the sake of explicitness
  let competition = null;
  if (req.body.competition !== undefined)
    competition = req.body.competition; 
  /*
   * Javascript timestamps are milliseconds since epoch, but PostgreSQL
   * timestamps are seconds since epoch.
   */
  db.query('INSERT INTO results VALUES ($1, $2, to_timestamp($3), to_timestamp($4), $5, $6)' +
  ' RETURNING start_time',
    [user, competition, startTime / 1000.0, endTime / 1000.0, wpm, acc])
    .then(result => {
      res.set('Location', `/api/users/${user}/results/${startTime}`);
      res.status(201).end();
      return loadUserObject(user);
    })
    .then(user => {
      // Replace a mere user id in the result with a user object
      const result = req.body;
      result.user = { id: user.id, name: user.name };

      if (competition)
        addResult(competition, result);

      // Update user stats
      let numTypingTests = user.num_typing_tests;
      let newAvgWpm, newAvgAcc;

      if (numTypingTests > 0) {
        newAvgWpm = (user.avg_wpm + wpm) / 2.0;
        newAvgAcc = (user.avg_acc + acc) / 2.0;
      } else {
        // This was the first typing test for the user
        newAvgWpm = wpm;
        newAvgAcc = acc;
      }
      return db.query('UPDATE users SET avg_wpm=$1, avg_acc=$2, num_typing_tests=$3 WHERE id=$4',
        [newAvgWpm, newAvgAcc, numTypingTests + 1, user.id]);
    })
    .catch(err => {
      res.status(500).json({ error: err.message });
    }); 
}

export function getNotifications(req, res) {
  // No need to access notifcations of other users than oneself
  const requestUserId = parseInt(req.params.id, 10);
  if (req.user.id !== requestUserId)
    return res.status(401).end();

  getUserNotifications(requestUserId)
    .then(notifications => Promise.all(notifications.map(n => getEvent(n.event))))
    .then(events => res.status(200).json(events))
    .catch(err => res.json(500).json({ error: err.message }));
}


/*******************************************************************************
 *
 * Loaders used by API workers.
 * These typically load an array of objects to be further transformed or
 * joined to another object by the main API worker.
 */

function getEvent(eventId) {
  return new Promise((resolve, reject) => {
    db.query('SELECT id, type FROM events WHERE id=$1', [eventId])
      .then(result => result.rows[0])
      .then(event => getTypedEvent(event))
      .then(event => resolve(event))
      .catch(err => reject(err));
  });
}

function getTypedEvent(baseEvent) {
  if (baseEvent.type === 'competition')
    return getCompetitionEvent(baseEvent);
  else
    return new Promise((_, reject) => reject("Invalid event type"));
}

function getCompetitionEvent(baseEvent) {
  let event = {};

  return new Promise((resolve, reject) => {
    db.query('SELECT competition, type FROM competition_events WHERE id=$1',
      [baseEvent.id])
      .then(result => {
        event = Object.assign({}, result.rows[0]);

        let eventTbl, columns;
        switch(event.type) {
        case 'top_result':
          eventTbl = 'competition_top_result_events';
          columns = 'usr, wpm, user_ranking';
          break;

        case 'finished':
          eventTbl = 'competition_finished_events';
          columns = 'id';
        }

        return db.query(`SELECT ${columns} FROM ${eventTbl} WHERE id=$1`, [baseEvent.id]);
      })
      .then(result => Object.assign(event, result.rows[0]))
      .then(event => {
        // For top result events, replace user id with actual user object
        if (event.type === 'top_result')
          return loadUserObject(event.usr);
        else resolve(event);
      })
      .then(user => {
        event.user = user;
        delete(event.usr);
        resolve(event);
      })
      .catch(err => reject(err));
  });
}


function getUserNotifications(userId) {
  return new Promise((resolve, reject) => {
    db.query('SELECT event FROM notifications WHERE usr=$1 AND acknowledged=FALSE', [userId])
      .then(result => resolve(result.rows))
      .catch(err => reject(err));
  });
}

export function loadUserObject(userId) {
  return new Promise((resolve, reject) => {
    db.query('SELECT id, name, avg_wpm, avg_acc, num_typing_tests FROM users WHERE id=$1',
    [userId])
      .then(result => {
        if (result.rows.length === 0)
          reject(new Error("User not found"));
        resolve(result.rows[0]);
      })
      .catch(err => {
        reject(err);
      });
  });
}


function loadUserResults(userId) {
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
}
