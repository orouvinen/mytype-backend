/*
 * The competition store keeps track of competitions that are in progress.
 * The store's purpose is to minimise DB I/O if the open competitions need
 * to be queried often.
 */
import { db, io } from './main';

export const competitions = []; // Competition store (houses typing test objects) 
const clients = {};      // Client sockets by socket ID (i.e. socket.id -> socket map)

const competitionDurationHours = 24;

// Send list of competitions to all connected sockets
function broadcastCompetitions() {
  io.sockets.emit('competitionListUpdate', competitions);
}

// Adds typing test object to the competition store
export const addCompetition = competition => {
  competition.duration = competitionDurationHours;
  competitions.push(competition);

  broadcastCompetitions();
  // Keep competition open for 24 hours
  setTimeout(closeCompetition, competitionDurationHours * 60 * 60 * 1000, competition.id);
};


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
  // Remove the competition object from the store array
  const deletePos = competitions.findIndex(competition => competition.id === competitionId);
  competitions.splice(deletePos, 1);
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
  return competitions.map(comp => {
    return {
      id: comp.id,
      language: comp.language,
      created_at: comp.createdAt,
      duration,
      finished: false
    };
  });
}