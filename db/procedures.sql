-- closes a competition and creates an event about the competition finishing.
-- Returns id of the created event.
CREATE OR REPLACE FUNCTION close_competition(competition_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
  event_id INTEGER;
BEGIN
  UPDATE competitions SET finished=true WHERE id = competition_id;
  SELECT create_competition_finished_event(competition_id) INTO event_id;
  RETURN event_id;
END;
$$ LANGUAGE plpgsql;


-- Creates a basic competition event record.
-- Used by the actual competition event procedures to store the common properties
-- for a competition-specific event.
CREATE OR REPLACE FUNCTION create_competition_event(competition_id INTEGER, ce_type competition_event_type)
RETURNS INTEGER AS $$
DECLARE
  new_event_id INTEGER;
BEGIN
  INSERT INTO events(type) VALUES('competition') RETURNING id INTO new_event_id;
  INSERT INTO competition_events(id, competition, type)
    VALUES(new_event_id, competition_id, ce_type);

  RETURN new_event_id;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION create_competition_top_result_event
  (competition_id INTEGER, user_id INTEGER, wpm DOUBLE PRECISION, ranking INTEGER)
RETURNS INTEGER AS $$
DECLARE
  new_event_id INTEGER;
BEGIN
  SELECT create_competition_event(competition_id, 'top_result') INTO new_event_id;

  INSERT INTO competition_top_result_events(id, usr, wpm, ranking)
   VALUES(new_event_id, user_id, wpm, ranking);

  RETURN new_event_id;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION create_competition_finished_event(competition_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
  new_event_id INTEGER;
BEGIN
  SELECT create_competition_event(competition_id, 'finished') INTO new_event_id;
  INSERT INTO competition_finished_events(id) VALUES(new_event_id);
  RETURN new_event_id;
END;
$$ LANGUAGE plpgsql;


