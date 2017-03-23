/*
 * Auth/account API functions
 */

import { db } from './main';
import { isEmpty } from './util';

var crypto = require('crypto');

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
  const salt = randomSalt().toString('base64');
  passwordHash(password, salt).then(hash => {
    db.query("INSERT INTO users(name, email, password, salt) VALUES ($1, $2, $3, $4)",
      [name, email, hash, salt])
      .then(result => {
        res.status(200).json({ success: "true" });
      })
      .catch(error => {
        res.status(409).json({ error: error.detail });
      });
  })
  .catch(err => {
    res.status(400).json({ error: err });
  });
};

/*
 * Authenticate in order to retrieve a JWT.
 *
 * "email": account email address
 * "password": account password
 */
export const authenticate = (req, res) => {
  if (isEmpty(req.body))
    return res.status(400).json({ error: "Missing request body" });
  if (!req.header('WWW-Authenticate'))
    return res.status(400).json({ error: "Missing auth header "});

  // Retrieve password has and the salt that it was generated with,
  // and compare the hash to a hash generated from the same salt
  // together with the password in the request.
  // If they match, then the password is correct.
  db.query('SELECT password, salt FROM users WHERE email=$1', [req.body.email])
    .then(result => {
      if (result.rows.length === 0)
        return res.status(401).end(); // no user found

      const { password, salt } = result.rows[0];

      passwordHash(req.body.password, salt).then(hash => {
        if (hash !== password)
          res.status(401).end(); // invalid password
        else
          res.status(200).json({"token": "greatsuccess!"});
      });
    })
    .catch(err => {
      res.status(500).end();
    });
};


const iterations = 10000;
const keyLength = 64; // 128 char hex string
const saltBytes = 14; // 28 char base64 string

// Generates a hash from a plaintext password using salt
const passwordHash = (plaintext, salt) => {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(plaintext, salt, iterations, keyLength, 'sha512', (err, key) => {
      if (err)
        reject(err.message);
      else
        resolve(key.toString('hex'));
    });
  });
};

const randomSalt = () => { return crypto.randomBytes(saltBytes); };
