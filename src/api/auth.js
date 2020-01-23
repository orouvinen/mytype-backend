/*
 * Auth/account API functions
 */

import { db } from '../main';
import { isEmpty } from '../util';
import { loadUserObject } from './user';

var jwt = require('jsonwebtoken');
var crypto = require('crypto');
export const secret = process.env.SECRET;

/*
 * Create a user
 * Params (in request body):
 *  "name": username
 *  "email": email address
 *  "password": password
 */
export async function createUser(req, res) {
  if (isEmpty(req.body))
    return res.status(400).json({ error: "Missing request body" });

  const { name, email, password } = req.body;
  const salt = randomSalt().toString('base64');
  try {
    const hash = await passwordHash(password, salt);
    const { rows } =
      await db.query('INSERT INTO users(name, email, password, salt) VALUES ' +
        '($1, $2, $3, $4) RETURNING id',
        [name, email, hash, salt]);

    const newUserId = rows[0].id;
    res.set('Location', '/api/users/' + newUserId);
    res.status(201).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/*
 * req body:
 * "email": account email address
 * "password": account password
 */
export async function authenticate(req, res) {
  if (isEmpty(req.body))
    return res.status(400).json({ error: "Missing request body" });

  const { email } = req.body;

  const authHeader = req.header('WWW-Authenticate');
  if (!authHeader)
    return res.status(400).json({ error: "Missing auth header" });
  else if (authHeader !== 'Bearer')
    return res.status(400).json({ error: "Invalid WWW-Authenticate header" });

  try {
    let { rows } = await
      db.query('SELECT id, password, salt, name, admin FROM users WHERE email=$1',
        [email]);

    if (rows.length === 0)
      return res.status(401).json({ error: "Account not found" });

    const { id, password, salt, name, admin } = rows[0];

    let hash = await passwordHash(req.body.password, salt);
    if (hash !== password)
      return res.status(401).end(); // invalid password

    const token = createToken(id, name, email, admin);
    const user = await loadUserObject(id);
    res.status(200).json({ user, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}


function createToken(id, name, email, admin) {
  const payload = {
    id,
    name,
    email,
    admin,
  };
  return jwt.sign(payload, secret, { expiresIn: '8h' });
}


const iterations = 10000;
const keyLength = 64; // 128 char hex string
const saltBytes = 14; // 20 char base64 string


function passwordHash(plaintext, salt) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(plaintext, salt, iterations, keyLength, 'sha512',
      (err, key) => {
        if (err)
          reject(err.message);
        else
          resolve(key.toString('hex'));
      });
  });
}

function randomSalt() {
  return crypto.randomBytes(saltBytes);
}