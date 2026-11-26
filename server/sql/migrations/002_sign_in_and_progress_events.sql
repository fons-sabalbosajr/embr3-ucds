-- 002: phase B2, step 1. Sign-in history and Progress Tracker events.
--
-- Both are append-only histories with one module each that writes and reads
-- them (services/signInHistory.js, services/progressTracker). mongo_id keeps
-- the original MongoDB _id of a copied row, so a copy can be re-run without
-- duplicating anything; rows written here first have none.

CREATE TABLE eu.sign_in_history (
    id          bigint IDENTITY(1,1) NOT NULL CONSTRAINT pk_sign_in_history PRIMARY KEY,
    mongo_id    char(24)       NULL,
    occurred_at datetime2(3)   NOT NULL,
    event       varchar(16)    NOT NULL,   -- sign-in | sign-out
    user_id     nvarchar(64)   NULL,
    username    nvarchar(128)  NULL,
    name        nvarchar(200)  NULL,
    ip          varchar(64)    NULL,
    user_agent  nvarchar(200)  NULL
);
GO
CREATE UNIQUE INDEX ux_sign_in_history_mongo ON eu.sign_in_history (mongo_id) WHERE mongo_id IS NOT NULL;
-- Admin › Sign-in History (newest first) and the retention purge.
CREATE INDEX ix_sign_in_history_at ON eu.sign_in_history (occurred_at DESC);
-- A unit's staff (ERMS › Log History): by account, newest first.
CREATE INDEX ix_sign_in_history_user ON eu.sign_in_history (username, occurred_at DESC);
GO

CREATE TABLE eu.progress_events (
    id          bigint IDENTITY(1,1) NOT NULL CONSTRAINT pk_progress_events PRIMARY KEY,
    mongo_id    char(24)       NULL,
    season      varchar(64)    NOT NULL,
    occurred_at datetime2(3)   NOT NULL,
    kind        varchar(32)    NOT NULL,   -- save | warning | baseline
    file_name   nvarchar(400)  NULL,
    source      nvarchar(64)   NULL,
    modified_by nvarchar(200)  NULL,
    -- Everything else the event carries (delta, sample, counts...), as JSON.
    payload     nvarchar(max)  NULL CONSTRAINT ck_progress_events_payload CHECK (payload IS NULL OR ISJSON(payload) = 1)
);
GO
CREATE UNIQUE INDEX ux_progress_events_mongo ON eu.progress_events (mongo_id) WHERE mongo_id IS NOT NULL;
-- The overview: a season's latest 80 events.
CREATE INDEX ix_progress_events_season ON eu.progress_events (season, occurred_at DESC);
