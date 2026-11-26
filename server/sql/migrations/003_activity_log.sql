-- 003: phase B2, step 2. The audit trail's UCDS and Admin entries.
--
-- ERMS, Document Portal and NAS entries stay in MongoDB with the ERMS records
-- they describe (the tracking screens read them there); VERA follows in a
-- later step. services/activityStore.js decides, per entry, where it goes.
--
-- category is worked out when an entry is written (activityStore.categoryOf)
-- and stored, so a tab is one indexed range rather than a scan. request_data
-- is stored already redacted: no password, code or key reaches this table.

CREATE TABLE eu.activity_log (
    id           bigint IDENTITY(1,1) NOT NULL CONSTRAINT pk_activity_log PRIMARY KEY,
    mongo_id     char(24)        NULL,
    occurred_at  datetime2(3)    NOT NULL,
    category     varchar(16)     NOT NULL,   -- ucds | admin | (vera, later)
    domain       varchar(16)     NULL,
    user_id      nvarchar(64)    NULL,
    username     nvarchar(128)   NULL,
    action_type  nvarchar(100)   NULL,
    action_label nvarchar(max)   NULL,
    message      nvarchar(1000)  NULL,       -- a Developer's note on the entry
    detail       nvarchar(2000)  NULL,
    method       varchar(10)     NULL,
    path         nvarchar(400)   NULL,
    success      bit             NULL,
    serial_no    nvarchar(64)    NULL,
    document_id  nvarchar(64)    NULL,
    ip           varchar(64)     NULL,
    user_agent   nvarchar(300)   NULL,
    request_data nvarchar(max)   NULL CONSTRAINT ck_activity_log_request CHECK (request_data IS NULL OR ISJSON(request_data) = 1),
    details      nvarchar(max)   NULL CONSTRAINT ck_activity_log_details CHECK (details IS NULL OR ISJSON(details) = 1),
    extra        nvarchar(max)   NULL CONSTRAINT ck_activity_log_extra CHECK (extra IS NULL OR ISJSON(extra) = 1)
);
GO
CREATE UNIQUE INDEX ux_activity_log_mongo ON eu.activity_log (mongo_id) WHERE mongo_id IS NOT NULL;
-- A tab of Admin › Audit Logs: one category, newest first.
CREATE INDEX ix_activity_log_category ON eu.activity_log (category, occurred_at DESC) INCLUDE (username, action_type);
-- One person's activity (User Accounts, Audit Logs filtered by username).
CREATE INDEX ix_activity_log_user ON eu.activity_log (username, occurred_at DESC);
