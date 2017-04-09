/*
 * The competition store keeps track of competitions that are in progress.
 * The store's purpose is to minimise DB I/O if the open competitions need
 * to be queried often.
 */
import { db } from './main';

const competitions = [];

// Adds typing test object to the competition store
export const addCompetition = (typingTest) => {
  competitions.push(typingTest);
  setTimeout(closeCompetition, 24 * 60 * 60 * 1000, typingTestId);
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
