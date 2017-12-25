/*
 * The competition store keeps track of competitions that are in progress.
 * The store's purpose is to minimise DB I/O if the open competitions need
 * to be queried often.
 */
import { db, io } from './main';
import { loadCompetitionResults } from './api/competition';

export const competitions = {}; // Competition store, map from id to competition
const clients = {};      // Client sockets by socket ID (i.e. socket.id -> to socket mapping)


const competitionDurationHours = 24;

// Dictionary of userId,socket pairs which tell the socket to use
// when sending notification for specific user.
const notificationSubscribers = {};

// Send list of competitions to all connected sockets.
// Results need to be camelCased for correct object property names
// when restoring competitions from database upon startup.
// If clientSocket is null, broadcast to all connected clients.
function broadcastCompetitions(clientSocket = null) {
  if (!clientSocket)
    io.sockets.emit('competitionListUpdate', competitions);
  else
    clientSocket.emit('competitionListUpdate', competitions);
}


// Send list of competition result to all connected clients
function broadcastCompetitionResults(competitionId) {
  io.sockets.emit('competitionResultsUpdate', {
    competition: competitionId,
    results: competitions[competitionId].results,
  });
}

// Adds typing test object to the competition store
export function addCompetition(competition) {
  competition.duration = competitionDurationHours;
  competitions[competition.id] = competition;
  competitions[competition.id].results = {};

  broadcastCompetitions();
  // Keep competition open for 24 hours
  setTimeout(closeCompetition, competitionDurationHours * 60 * 60 * 1000, competition.id);
}


// Adds a result to competition. Result is expected to be an
// object containing necessary fields to describe the result.
export function addResult(competitionId, result, topResultNotifications = true) {
  let competition = competitions[competitionId];

  const userCurrentResult = competition.results[result.user.id];
  if (!userCurrentResult || result.wpm > userCurrentResult.wpm) {
    competition.results[result.user.id] = result;
    broadcastCompetitionResults(competitionId);

    if (!topResultNotifications)
      return;

    let sortedResults = sortResults(competition.results);
    let ranking = sortedResults.findIndex(r => r.user.id === result.user.id);

    // Create top result event for top3 results
    if (ranking < 3) {
      db.query('SELECT create_competition_top_result_event($1, $2, $3, $4)',
        [competitionId, result.user.id, result.wpm, ranking])
        .then(res => {
          let eventId = res.rows[0].createCompetitionTopResultEvent;
          return createCompetitionNotifications(eventId, competitionId)
            .then(() =>
              notifyCompetitionParticipants(competitionId, {
                eventId,
                type: 'top_result',
                wpm: result.wpm,
                ranking,
                user: result.user,
              }));
        })
        .catch(err => {
          console.log("Warning: something in addResult() didn't go as planned.");
          console.log(`competitionId: ${competitionId}, userId: ${result.user.id}`);
          console.log(err.message);
        });
    }
  }
}


function notifyCompetitionParticipants(competitionId, event) {
  return getParticipants(competitionId)
    .then(userIds => { userIds.forEach(id => {
      if (notificationSubscribers[id])
        notificationSubscribers[id].emit('eventNotification', event);
    });
  });
}


function createCompetitionNotifications(eventId, competitionId) {
  return getParticipants(competitionId)
    .then(participantUserIds => {
      let tasks = participantUserIds.map(userId =>
        db.query('INSERT INTO notifications (usr, event) VALUES($1, $2)', [userId, eventId]));

      return Promise.all(tasks);
  });
}

// Returns an array of competition results, sorted by WPM in descending order.
// Argument is a result dictionary where userId is a key that maps
// to the user's (best) result in a competition.
function sortResults(results) {
  return Object.keys(results)
    .map(userId => results[userId])
    .sort((a, b) => b.wpm - a.wpm);
}


export function getCompetitionContent(competitionId) {
  return competitions[competitionId].content;
}

// Closes a competition:
//  - set status to finished
//  - create a competition 'finished' event
//  - create notification for all participants about competition being finished
function closeCompetition(competitionId) {
  let eventId;

  db.query('SELECT close_competition($1)', [competitionId])
    .then(result => {
      eventId = result.rows[0].closeCompetition;
      return getParticipants(competitionId);
    })
    .then(users => {
      // Remove the competition from store and send updated store to clients
      delete(competitions[competitionId]);
      broadcastCompetitions();

      // Create notifications about finished competition
      const notifyTasks = users.map(userId =>
        db.query('INSERT INTO notifications(usr, event) VALUES($1, $2)',
          [userId, eventId]));

      return Promise.all(notifyTasks);
    })
    .catch(err => {
      console.log('Warning: failed to close competition.\n' +
        'competition id: ' + competitionId + '\n' + err.message + '\n');
    });
}

// Get competition participants.
// Returns a promise that resolved with an array of user ids.
function getParticipants(competitionId) {
  return new Promise((resolve, reject) =>
    db.query('SELECT DISTINCT usr FROM results WHERE competition=$1', [competitionId])
      .then(result => resolve(result.rows.map(row => row.usr)))
      .catch(err => reject(err)));
}

// Helper to restore in-progress competitions from db when starting the server
// --- NOTE: if a competition would have been finished while the server was not running,
// and should thus have been closed but was not because the server indeed was not running,
// then such a competition will, in fact, enjoy eternal life.
// It's a bug, yes, but this restore functionality exists solely on making the developing of the
// application more pleasant and therefore this the bug doesn't bother us too much at this point.
// It could be fixed, but I'd rather take the time to write this comment than think about
// timestamps and setTimeouts.
export function restoreCompetitions() {
  db.query('SELECT id, created_at, created_by, finished, content, language, duration FROM competitions WHERE finished=false')
    .then(result => {
      result.rows.forEach(competition => {
        competitions[competition.id] = competition;
        competition.results = {};
        loadCompetitionResults(competition.id).then(results => {
          results.forEach(result => {
            addResult(competition.id, result, false);
          });
        });
      });
    })
    .catch(err => {
      console.log("Warning: can't restore competitions from db");
    });
}

// newClient(): stores client socket to client pool when they connect.
// On disconnect, remove clients from the pool.
export function newClient(socket) {
  clients[socket.id] = socket;
  socket.on('disconnect', () => {
    // Remove possible notification subscription
    for (let userId of Object.keys(notificationSubscribers)) {
      if (notificationSubscribers[userId] == socket) {
        delete(notificationSubscribers[userId]);
        break;
      }
    }
    delete (clients[socket.id]);
  });

  socket.on('notificationSubscribe', msg => {
    if (msg.userId)
      notificationSubscribers[msg.userId] = socket;
  });
}

export function getRunningCompetitions() {
  return Object.keys(competitions).map(key => {
    const { id, language, createdAt, createdBy, duration, finished, content }  = competitions[key];
    return {
      id, language, createdAt, createdBy, duration, finished, content,
    };
  });
}
