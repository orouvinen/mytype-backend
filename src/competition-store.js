/*
 * The competition store keeps track of competitions that are in progress.
 * The store's purpose is to minimise DB I/O if the open competitions need
 * to be queried often.
 */
import { db, io } from './main';

export const competitions = []; // Competition store (houses typing test objects) 
const clients = {};      // Client sockets by socket ID (i.e. socket.id -> socket map)

// Adds typing test object to the competition store
export const addCompetition = (typingTest) => {
  competitions.push(typingTest);
  // send 'competitionListUpdate' to all clients
  // TODO: socket.io must have a broadcast function?
  Object.keys(clients).forEach(client => {
    clients[client].emit('competitionListUpdate', competitions);
  });
  setTimeout(closeCompetition, 24 * 60 * 60 * 1000, typingTest.id);
};


// closeCompetition():
//  Set the finished flag for the typing test in the DB and remove
//  the typing test object from the competition store
const closeCompetition = typingTestId => {
  db.query('UPDATE typing_tests SET finished=true WHERE id=$1',
    [typingTestId])
    .catch(err => {
      console.log('Warning: failed to update competition status finished to true.\n' +
        'typing_tests id: ' + typingTestId + '\n' + err.message + '\n');
    });
  // Remove the competition object from the store array
  const deletePos = competitions.findIndex(competition => competition.id === typingTestId);
  competitions.splice(deletePos, 1);
};


// newClient(): stores client socket to client pool when they connect.
// On disconnect, remove clients from the pool.
export const newClient = clientSocket => {
  clients[clientSocket.id] = clientSocket;
  clientSocket.on('disconnect', () => {
    delete(clients[clientSocket.id]);
  });
};


export const getRunningCompetitions = () => {
  return competitions.map(comp => {
    return {
      id: comp.id,
      language: comp.language,
      created_at: comp.createdAt,
      finished: false
    };
  });
};