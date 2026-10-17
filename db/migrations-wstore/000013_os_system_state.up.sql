CREATE TABLE IF NOT EXISTS db_ossystemevent (
    oid varchar(36) PRIMARY KEY,
    version int NOT NULL,
    data json NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ossystemevent_space_created
    ON db_ossystemevent (json_extract(data, '$.spaceid'), json_extract(data, '$.createdts'));

CREATE TABLE IF NOT EXISTS db_oscapabilitygrant (
    oid varchar(36) PRIMARY KEY,
    version int NOT NULL,
    data json NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oscapabilitygrant_space_session
    ON db_oscapabilitygrant (json_extract(data, '$.spaceid'), json_extract(data, '$.agentsessionid'));

CREATE TABLE IF NOT EXISTS db_oscheckpoint (
    oid varchar(36) PRIMARY KEY,
    version int NOT NULL,
    data json NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oscheckpoint_space_created
    ON db_oscheckpoint (json_extract(data, '$.spaceid'), json_extract(data, '$.createdts'));
