DROP TABLE IF EXISTS stats;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS competition_finished_events, competition_top_result_events;
DROP TABLE IF EXISTS competition_events;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS results;
DROP TABLE IF EXISTS competitions;
DROP TABLE IF EXISTS users;
DROP TYPE IF EXISTS competition_event_type CASCADE;
DROP TYPE IF EXISTS event_type;

CREATE TABLE users(
  id SERIAL,
  name VARCHAR(30),
  email varchar(64),
  password CHAR(128),
  salt CHAR(20),
  admin BOOLEAN DEFAULT FALSE,
  registered TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

  -- aggregate values updated on fly
  avg_wpm DOUBLE PRECISION DEFAULT 0.0,
  avg_acc DOUBLE PRECISION DEFAULT 0.0,
  num_typing_tests INTEGER DEFAULT 0
);
ALTER TABLE users ADD PRIMARY KEY(id);
ALTER TABLE users ADD UNIQUE(email);

CREATE TABLE competitions(
  id SERIAL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  finish_at TIMESTAMPTZ NOT NULL,
  created_by INTEGER NULL,
  content TEXT,
  language CHAR(3)
);
ALTER TABLE competitions ADD PRIMARY KEY(id);
ALTER TABLE competitions ADD FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE results (
  usr INTEGER,  -- "user" is a reserved word
  competition INTEGER NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  wpm DOUBLE PRECISION,
  acc DOUBLE PRECISION
);
ALTER TABLE results ADD PRIMARY KEY(usr, start_time);
ALTER TABLE results ADD FOREIGN KEY(competition) REFERENCES competitions(id) ON DELETE CASCADE;
ALTER TABLE results ADD FOREIGN KEY(usr) REFERENCES users(id) ON DELETE CASCADE;

CREATE TABLE stats(
  avg_wpm DOUBLE PRECISION DEFAULT 0.0, -- avg wpm for all typed typing tests
  avg_acc DOUBLE PRECISION DEFAULT 0.0
);

-- Events and notifications ----------------------------------------------------
CREATE TYPE event_type AS ENUM('competition');
CREATE TYPE competition_event_type AS ENUM('finished', 'top_result');

-- Properties general to all events
CREATE TABLE events(
  id SERIAL,
  type event_type NULL
);
ALTER TABLE events ADD PRIMARY KEY(id);

-- There's no relation from the base event type to the inherited event types,
-- so the deletion from `events` will be handled with trigger from the
-- inherited event tables (e.g. competition_events).

-- PostgreSQL needs a stored function for trigger execution
DROP FUNCTION IF EXISTS delete_event();
CREATE OR REPLACE FUNCTION delete_event()
RETURNS TRIGGER AS $delete_event$
BEGIN
  DELETE FROM events WHERE id=OLD.id;
  RETURN OLD;
END;
$delete_event$ LANGUAGE plpgsql;


-- Competition-specific event properties
CREATE TABLE competition_events(
  id INTEGER,
  competition INTEGER,
  type competition_event_type
);
ALTER TABLE competition_events ADD PRIMARY KEY(id);
ALTER TABLE competition_events ADD FOREIGN KEY(id) REFERENCES events(id) ON DELETE CASCADE;
ALTER TABLE competition_events ADD FOREIGN KEY(competition) REFERENCES competitions(id) ON DELETE CASCADE;

CREATE TRIGGER event_delete AFTER DELETE ON competition_events
  FOR EACH ROW EXECUTE PROCEDURE delete_event();

CREATE TABLE competition_top_result_events(
  id INTEGER,
  usr INTEGER,
  wpm DOUBLE PRECISION,
  ranking INTEGER
);
ALTER TABLE competition_top_result_events ADD PRIMARY KEY(id);
ALTER TABLE competition_top_result_events ADD FOREIGN KEY(id) REFERENCES competition_events(id) ON DELETE CASCADE;
ALTER TABLE competition_top_result_events ADD FOREIGN KEY(usr) REFERENCES users(id) ON DELETE CASCADE;

-- With no additional properties to hold, this table is redundant.
-- But I'd like to keep it around for a while for the sake of completeness.
CREATE TABLE competition_finished_events(
  id INTEGER
);
ALTER TABLE competition_finished_events ADD PRIMARY KEY(id);
ALTER TABLE competition_finished_events ADD FOREIGN KEY(id) REFERENCES competition_events(id) ON DELETE CASCADE;


CREATE TABLE notifications(
  id SERIAL,
  usr INTEGER,
  event INTEGER,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  acknowledged BOOLEAN DEFAULT FALSE
);
ALTER TABLE notifications ADD PRIMARY KEY(id);
ALTER TABLE notifications ADD FOREIGN KEY(usr) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD FOREIGN key(event) REFERENCES events(id) ON DELETE CASCADE;
