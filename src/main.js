'use strict';

var express = require('express');
var fs      = require('fs');
var pg      = require('pg');
var async   = require('async');
var path    = require('path');
var url     = require('url');
var bodyParser = require('body-parser');

var app = express();

var host = 'localhost';
if (process.env.PORT)
  host = '0.0.0.0';
var serverOptions = {
  port: (process.env.PORT || 8000),
  host: host
};

const params = url.parse(process.env.DATABASE_URL);
const auth = params.auth.split(':');

const dbConfig = {
  user: auth[0],
  password: auth[1],
  host: params.hostname,
  port: params.port,
  database: params.pathname.split('/')[1],
  max: 10,
  idleTimeoutMillis: 30000,
  ssl: true
};

// Create a connection pool for db queries
const db = new pg.Pool(dbConfig);


// Frontend build and static assets from under public/
app.use(express.static('public'));

var jsonParser = bodyParser.json();

/*
 * Create a user
 * Params (in request body):
 *  "name": username
 *  "email": email address
 *  "password": password
 */
app.post('/api/user', jsonParser, (req, res) => {
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
});


// Rest of the urls are for front-end
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'public/index.html'));
});


app.listen(serverOptions.port, () => {
  console.log('listening on port %s', serverOptions.port);
});


const isEmpty = obj => Object.keys(obj).length === 0;
