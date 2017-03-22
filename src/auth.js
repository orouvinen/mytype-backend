/*
 * Auth/account API functions
 */

import { db } from './main';
import { isEmpty } from './util';


/*
 * Create a user
 * Params (in request body):
 *  "name": username
 *  "email": email address
 *  "password": password
 */
export const createUser = (req, res) => {
  if (isEmpty(req.body))
    return res.status(400).json({ error: "Missing request body" });

  const { name, email, password } = req.body;

  db.query("INSERT INTO users(name, email, password) VALUES ($1, $2, $3)",
    [name, email, password])
    .then(result => {
      res.status(200).json({ success: "true" });
    }).catch(error => {
      res.status(409).json({ error: error.detail });
    });
};

export const authenticate = (req, res) => {
  if (isEmpty(req.body))
    return res.status(400).json({ error: "Missing request body" });
};
