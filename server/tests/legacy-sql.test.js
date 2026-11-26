import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// services/legacySql.js: the parts that need no SQL Server. How a server
// address is read, and how names are quoted before they reach a statement.
const require = createRequire(import.meta.url);
const { parseServer, quote, DEFAULT_DATABASES, buildQuery, csvCell } = require('../services/legacySql');

// A stand-in for an mssql request: records the parameters it is given.
const fakeRequest = () => {
  const inputs = {};
  return { inputs, input(name, _type, value) { inputs[name] = value; return this; } };
};
const COLUMNS = [
  { name: 'Serial_No', binary: false },
  { name: 'Proponent', binary: false },
  { name: 'Photo_Blob', binary: true },
];

describe('Explorer queries', () => {
  it('puts every value in a parameter, never in the SQL text', () => {
    const req = fakeRequest();
    const q = buildQuery(req, COLUMNS, { filters: [{ column: 'Proponent', op: 'contains', value: "x'; DROP TABLE t; --" }] });
    expect(q.where).toBe('WHERE CAST([Proponent] AS nvarchar(4000)) LIKE @p0');
    expect(req.inputs.p0).toBe("%x'; DROP TABLE t; --%");
    expect(q.where).not.toContain('DROP');
  });

  it('ignores unknown columns, binary columns and unknown operators', () => {
    const q = buildQuery(fakeRequest(), COLUMNS, {
      filters: [
        { column: 'NotAColumn', op: 'equals', value: 1 },
        { column: 'Photo_Blob', op: 'equals', value: 1 },
        { column: 'Proponent', op: 'DROP', value: 1 },
      ],
    });
    expect(q.where).toBe('');
  });

  it('makes LIKE wildcards in a value literal', () => {
    const req = fakeRequest();
    buildQuery(req, COLUMNS, { filters: [{ column: 'Serial_No', op: 'startsWith', value: '50%_[a]' }] });
    expect(req.inputs.p0).toBe('50[%][_][[]a]%');
  });

  it('searches every text column with one parameter', () => {
    const req = fakeRequest();
    const q = buildQuery(req, COLUMNS, { search: 'ana' });
    expect(q.where).toBe('WHERE (CAST([Serial_No] AS nvarchar(4000)) LIKE @p0 OR CAST([Proponent] AS nvarchar(4000)) LIKE @p0)');
    expect(req.inputs.p0).toBe('%ana%');
  });

  it('sorts a legacy text column through a cast, which SQL Server allows', () => {
    const cols = [{ name: 'Remarks', type: 'text', binary: false }];
    expect(buildQuery(fakeRequest(), cols, { sort: { column: 'Remarks', dir: 'asc' } }).orderBy).toBe('CAST([Remarks] AS nvarchar(4000)) ASC');
  });

  it('sorts only by a real column, in a fixed direction', () => {
    expect(buildQuery(fakeRequest(), COLUMNS, { sort: { column: 'proponent', dir: 'desc' } }).orderBy).toBe('[Proponent] DESC');
    expect(buildQuery(fakeRequest(), COLUMNS, { sort: { column: 'x; DROP', dir: 'asc' } }).orderBy).toBe('(SELECT NULL)');
  });

  it('writes CSV cells safely: quotes, newlines and formula-looking text', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-5')).toBe('-5');
    expect(csvCell('-cmd')).toBe("'-cmd");
    expect(csvCell(null)).toBe('');
  });
});

describe('Legacy SQL Server settings', () => {
  it('reads an address the way SSMS and people write it', () => {
    expect(parseServer('10.14.77.248, 1433')).toEqual({ host: '10.14.77.248', port: 1433 });
    expect(parseServer('10.14.77.248:1444')).toEqual({ host: '10.14.77.248', port: 1444 });
    expect(parseServer('10.14.77.248', 1500)).toEqual({ host: '10.14.77.248', port: 1500 });
    expect(parseServer('  sqlhost  ')).toEqual({ host: 'sqlhost', port: 1433 });
  });

  it('leaves a named instance whole', () => {
    expect(parseServer('SERVER\\SQLEXPRESS')).toEqual({ host: 'SERVER\\SQLEXPRESS', port: 1433 });
  });

  it('bracket-quotes names so none can close the quote and add SQL', () => {
    expect(quote('tb_maindata')).toBe('[tb_maindata]');
    expect(quote('x]; DROP TABLE t; --')).toBe('[x]]; DROP TABLE t; --]');
  });

  it('defaults to the three live ERMS unit databases', () => {
    expect(DEFAULT_DATABASES).toEqual(['dbmain_records', 'dbmain_ermssublegal', 'dbmain_ermssublaboratory']);
  });
});
