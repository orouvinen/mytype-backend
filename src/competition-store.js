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
// If `topResultNotifications` is true, creates notifications about the result
// for participants of the competition in question.
export async function addResult(competitionId, result, topResultNotifications = true) {
  let competition = competitions[competitionId];

  const userCurrentResult = competition.results[result.user.id];

  // If there's already a result that's better than this one, ignore the new result
  if (userCurrentResult && userCurrentResult.wpm > result.wpm)
    return;

  competition.results[result.user.id] = result;
  broadcastCompetitionResults(competitionId);

  if (!topResultNotifications)
    return;

  let sortedResults = sortResults(competition.results);
  let ranking = sortedResults.findIndex(r => r.user.id === result.user.id);

  // Create top result event for top3 results
  if (ranking < 3) {
    try {
      let res = await db.query('SELECT create_competition_top_result_event($1, $2, $3, $4)',
        [competitionId, result.user.id, result.wpm, ranking]);
      let eventId = res.rows[0].createCompetitionTopResultEvent;
      let insertRes = await createCompetitionNotifications(eventId, competitionId);
      let userNotifications = {};

      insertRes.forEach(r => {
        let { userId, notificationId } = r.rows[0];
        userNotifications[userId] = notificationId;
      });

      await notifyCompetitionParticipants(
        competitionId, {
          eventId,
          competition: competitionId,
          type: 'top_result',
          wpm: result.wpm,
          ranking,
          user: result.user,
        }, 
        userNotifications);

    } catch(e) {
      console.log("Warning: something in addResult() didn't go as planned.");
      console.log(`competitionId: ${competitionId}, userId: ${result.user.id}`);
      console.log(`${e.name}: ${e.message}`);
    }
  }
}


// Notifies connected clients who are participants in a competition about
// a competition event.
//
// Arg `notificationUserMappings` maps user ids to notification ids ([{ userId: notificationId }]),
// telling which notification belongs to whom.
async function notifyCompetitionParticipants(competitionId, event, userNotificationMapping) {
  let participants = await getParticipants(competitionId);
  for (let userId of participants) {
    if (notificationSubscribers[userId]) {
      let notificationId = userNotificationMapping[userId];
      event['notificationId'] = notificationId;
      console.log(event);
      notificationSubscribers[userId].emit('eventNotification', event);
    }
  }
}


// Creates a notification for all participants in a competition about an event
async function createCompetitionNotifications(eventId, competitionId) {
  let participants = await getParticipants(competitionId);
  return Promise.all(participants.map(userId =>
     db.query('INSERT INTO notifications (usr, event) VALUES($1, $2) RETURNING id AS notification_id, usr AS user_id', [userId, eventId])));
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
async function closeCompetition(competitionId) {
  try {
    let result = await db.query('SELECT close_competition($1)', [competitionId]);
    let eventId = result.rows[0].closeCompetition;
    let participants = await getParticipants(competitionId);

    delete(competitions[competitionId]);
    broadcastCompetitions();
    await Promise.all(participants.map(userId =>
          db.query('INSERT INTO notifications(usr, event) VALUES($1, $2)',
            [userId, eventId])));
    } catch(e) {
      console.log('Warning: failed to close competition.\n' +
        `competitionId: ${competitionId}\n` +
        `${e.name}: ${e.message}`);
    }
}

// Get competition participants.
// Returns a promise that resolved with an array of user ids.
async function getParticipants(competitionId) {
  let res =
    await db.query('SELECT DISTINCT usr FROM results WHERE competition=$1',
      [competitionId]);

  return res.rows.map(r => r.usr);
}

// Helper to restore in-progress competitions from db when starting the server
// --- NOTE: if a competition would have been finished while the server was not running,
// and should thus have been closed but was not because the server indeed was not running,
// then such a competition will, in fact, enjoy eternal life.
// It's a bug, yes, but this restore functionality exists solely on making the developing of the
// application more pleasant and therefore this the bug doesn't bother us too much at this point.
// It could be fixed, but I'd rather take the time to write this comment than think about
// timestamps and setTimeouts.
export async function restoreCompetitions() {
  try {
    let runningCompetitions =
      (await db.query('SELECT id, created_at, created_by, finished, content, language, duration FROM competitions WHERE finished=false'))
        .rows;

    for (let c of runningCompetitions) {
      competitions[c.id] = c;

      // Load competition results
      c.results = {};
      let results = await loadCompetitionResults(c.id);
      for (let r of results)
        addResult(c.id, r, false);
      }
    } catch(e) {
      console.log("Warning: can't restore competitions from db");
      console.log(`${e.name}: ${e.message}`);
    }
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
    const { id, language, createdAt, createdBy, duration, finished, content } = competitions[key];
    return {
      id, language, createdAt, createdBy, duration, finished, content,
    };
  });
}
