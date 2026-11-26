-- 001: the foundation of db_euniverse.
--
-- Every E-Universe table lives in the `eu` schema, so nothing it creates can
-- be mistaken for, or collide with, anything else on this server. Tables
-- arrive with the phase that moves their data (server/sql/README.md).

IF SCHEMA_ID('eu') IS NULL
    EXEC('CREATE SCHEMA eu AUTHORIZATION dbo');
GO

-- Where each phase records that its data was copied and verified, so a
-- switch from MongoDB to SQL Server is never made on unverified data.
CREATE TABLE eu.data_moves (
    collection_name nvarchar(128) NOT NULL PRIMARY KEY,
    target_table    nvarchar(128) NOT NULL,
    mongo_count     bigint        NULL,
    sql_count       bigint        NULL,
    copied_at       datetime2(3)  NULL,
    verified_at     datetime2(3)  NULL,
    switched_at     datetime2(3)  NULL,
    notes           nvarchar(1000) NULL
);
