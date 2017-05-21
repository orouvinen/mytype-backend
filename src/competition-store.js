/*
 * The competition store keeps track of competitions that are in progress.
 * The store's purpose is to minimise DB I/O if the open competitions need
 * to be queried often.
 */
import { db, io } from './main';

export const competitions = {}; // Competition store, map from id to competition 
const clients = {};      // Client sockets by socket ID (i.e. socket.id -> socket map)

const competitionDurationHours = 24;

// Send list of competitions to all connected sockets
function broadcastCompetitions() {
  io.sockets.emit('competitionListUpdate', competitions);
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
  competitions[competition.id].results = [];

  broadcastCompetitions();
  // Keep competition open for 24 hours
  setTimeout(closeCompetition, competitionDurationHours * 60 * 60 * 1000, competition.id);
}


// Adds a result to competition. Result is expected to be an
// object containing necessary fields to describe the result.
export function addResult(competitionId, result) {
  competitions[competitionId].results.push(result);
  broadcastCompetitionResults(competitionId);
}


export function getCompetitionContent(competitionId)
{
  return competitions[competitionId].content;
}

// closeCompetition():
//  Set the finished flag for the typing test in the DB and remove
//  the typing test object from the competition store
function closeCompetition(competitionId) {
  db.query('UPDATE competitions SET finished=true WHERE id=$1',
    [competitionId])
    .catch(err => {
      console.log('Warning: failed to update competition status finished to true.\n' +
        'typing_tests id: ' + competitionId + '\n' + err.message + '\n');
    });
  // Remove from store and notify send updated store to clients
  delete(competitions[competitionId]);
  broadcastCompetitions();
}


// newClient(): stores client socket to client pool when they connect.
// On disconnect, remove clients from the pool.
export function newClient(clientSocket) {
  clients[clientSocket.id] = clientSocket;
  clientSocket.on('disconnect', () => delete(clients[clientSocket.id]));
  broadcastCompetitions();
}

export function getRunningCompetitions() {
  return Object.keys(competitions).map(key => {
    const { id, language, createdAt, duration, finished, content } = competitions[key];
    return { 
      id, language, createdAt, duration, finished, content,
    };
  });
}