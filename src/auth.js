/*
 * Auth/account API functions
 */

import { db } from './main';
import { isEmpty } from './util';

var jwt = require('jsonwebtoken');
var crypto = require('crypto');
const secret = process.env.SECRET;

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
    db.query("INSERT INTO users(name, email, password, salt) VALUES ($1, $2, $3, $4) RETURNING id",
      [name, email, hash, salt])
      .then(result => {
        // When succesfully fulfilling the request, send a 201 Created-response with
        // a Location-header stating the URI for the created user
        const newUserId = result.rows[0].id;
        res.set('Location', '/api/users/' + newUserId);
        res.sendStatus(201);
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
  // Validate request body
  if (isEmpty(req.body))
    return res.status(400).json({ error: "Missing request body" });

  // Validate request header
  const authHeader = req.header('WWW-Authenticate');
  if (!authHeader)
    return res.status(400).json({ error: "Missing auth header "});
  else if (authHeader !== 'Bearer')
    return res.status(400).json({ error: "Invalid WWW-Authenticate header"});

  // Retrieve password hash and the salt that it was generated with,
  // and compare the hash to a hash generated from the same salt
  // together with the password in the request.
  // If they match, then the password is correct.
  db.query('SELECT id, password, salt, name, admin FROM users WHERE email=$1', [req.body.email])
    .then(result => {
      if (result.rows.length === 0)
        return res.status(401).end(); // no user found

      const { id, password, salt, name, admin } = result.rows[0];
      const email = req.body.email;

      passwordHash(req.body.password, salt).then(hash => {
        if (hash !== password)
          res.status(401).end(); // invalid password
        else {
          const token = createToken(id, name, email, admin);
          res.status(200).json({
            "user": { id, name, email, admin },
            "token": token
          });
        }
      });
    })
    .catch(err => {
      res.status(500).end();
    });
};

/*
 * Create an auth token
 * Args:
 *  id:   user id
 *  name: username
 *  email: account email address
 *  admin: admin flag
 *
 * Returns the JWT as a string
 */
const createToken = (id, name, email, admin) => {
  const payload = {
    id,
    name,
    email,
    admin,
  };
  return jwt.sign(payload, secret, { expiresIn: '8h' });
};

const iterations = 10000;
const keyLength = 64; // 128 char hex string
const saltBytes = 14; // 20 char base64 string

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
