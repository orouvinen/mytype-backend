DROP TABLE IF EXISTS results;
DROP TABLE IF EXISTS competitions;
DROP TABLE IF EXISTS users;

CREATE TABLE users(
  id SERIAL,
  name VARCHAR(30),
  email varchar(64),
  password CHAR(128),
  salt CHAR(20),
  admin BOOLEAN
);
ALTER TABLE users ADD PRIMARY KEY(id);
ALTER TABLE users ADD UNIQUE(email);

CREATE TABLE competitions(
  id SERIAL,
  created_at TIMESTAMPTZ,
  finished BOOLEAN DEFAULT FALSE,
  content TEXT,
  language CHAR(3)
);
ALTER TABLE competitions ADD PRIMARY KEY(id);

CREATE TABLE results (
  usr INTEGER,  -- "user" is a reserved word
  competition INTEGER,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  wpm REAL,
  acc REAL
);
ALTER TABLE results ADD PRIMARY KEY(usr, start_time);
ALTER TABLE results ADD FOREIGN KEY(competition) REFERENCES competitions(id) ON DELETE CASCADE;
ALTER TABLE results ADD FOREIGN KEY(usr) REFERENCES users(id) ON DELETE CASCADE;