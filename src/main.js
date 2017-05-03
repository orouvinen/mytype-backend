'use strict';

var express = require('express');
var fs      = require('fs');
var pg      = require('pg');
var async   = require('async');
var path    = require('path');
var url     = require('url');
var bodyParser = require('body-parser');
var jwt     = require('express-jwt');
var http    = require('http');
var socketIO = require('socket.io');

import * as auth from './api/auth';
import * as competition from './api/competition';
import * as user from './api/user';
import { isEmpty } from './util';
import { newClient } from './competition-store';


var app = express();
var server = http.createServer(app);
export var io = socketIO(server);

var host = 'localhost';
if (process.env.PORT)
  host = '0.0.0.0';
var serverOptions = {
  port: (process.env.PORT || 8000),
  host: host
};

const params = url.parse(process.env.DATABASE_URL);
const dbAuth = params.auth.split(':');

const dbConfig = {
  user: dbAuth[0],
  password: dbAuth[1],
  host: params.hostname,
  port: params.port,
  database: params.pathname.split('/')[1],
  max: 10,
  idleTimeoutMillis: 30000,
  ssl: true
};

// Create a connection pool for db queries
export const db = new pg.Pool(dbConfig);

// Frontend build and static assets from under public/
app.use(express.static(__dirname + '/public'));

// JSON parser needed for API requests
var jsonParser = bodyParser.json();

// Auth token checker middleware for routes that need authorization for access
const tokenChecker = (err, req, res, next) => {
  if (err.name === 'UnauthorizedError')
    res.status(401).json({ error: "Invalid auth token" });
};

// Routes
app.post('/api/authenticate', jsonParser, auth.authenticate);
app.post('/api/users', jsonParser, auth.createUser);
app.get('/api/users/:id', jwt({ secret: auth.secret }), tokenChecker, jsonParser, user.getUser);
app.delete('/api/users/:id', jwt({ secret: auth.secret }), tokenChecker, jsonParser, user.deleteUser);

app.post('/api/competitions', jwt({ secret: auth.secret }), tokenChecker, jsonParser, competition.createCompetition);
app.get('/api/competitions/:id', jsonParser, competition.getCompetition);
app.get('/api/users/:id/results', jwt({ secret: auth.secret }), jsonParser, user.getUserResults);
app.post('/api/users/:id/results/', jwt({ secret: auth.secret }), tokenChecker, jsonParser, user.saveResult);


// Rest of the urls are for front-end
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'public/index.html'));
});

// Grab incoming websocket connections
io.on('connection', newClient);

server.listen(serverOptions.port, () => {
  console.log('listening on port %s', serverOptions.port);
});
