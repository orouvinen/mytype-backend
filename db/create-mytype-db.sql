DROP TABLE IF EXISTS results;
DROP TABLE IF EXISTS competitions;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS stats;

CREATE TABLE users(
  id SERIAL,
  name VARCHAR(30),
  email varchar(64),
  password CHAR(128),
  salt CHAR(20),
  admin BOOLEAN DEFAULT FALSE,
  registered TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

  -- aggregate values updated on fly
  avg_wpm REAL DEFAULT 0.0,
  avg_acc REAL DEFAULT 0.0,
  num_typing_tests INTEGER DEFAULT 0
);
ALTER TABLE users ADD PRIMARY KEY(id);
ALTER TABLE users ADD UNIQUE(email);

CREATE TABLE competitions(
  id SERIAL,
  created_at TIMESTAMPTZ,
  finished BOOLEAN DEFAULT FALSE,
  content TEXT,
  language CHAR(3),
  duration INTEGER DEFAULT 24,
  avg_wpm REAL,
  avg_acc REAL
);
ALTER TABLE competitions ADD PRIMARY KEY(id);

CREATE TABLE results (
  usr INTEGER,  -- "user" is a reserved word
  competition INTEGER,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  wpm REAL DEFAULT 0.0,
  acc REAL DEFAULT 0.0
);
ALTER TABLE results ADD PRIMARY KEY(usr, start_time);
ALTER TABLE results ADD FOREIGN KEY(competition) REFERENCES competitions(id) ON DELETE CASCADE;
ALTER TABLE results ADD FOREIGN KEY(usr) REFERENCES users(id) ON DELETE CASCADE;

CREATE TABLE stats(
  avg_wpm REAL DEFAULT 0.0,
  avg_acc REAL DEFAULT 0.0
);
