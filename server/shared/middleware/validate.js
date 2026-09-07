const { z } = require('zod');

// ---------------------------------------------------------------------------
// Request validation at the route boundary.
//
// The database has no ODM and no schema validators, so nothing downstream
// rejects a malformed document — it is simply written. New routes validate
// their input here and hand the handler parsed, coerced data.
//
// Existing UCDS handlers are deliberately not retrofitted: that is a much
// larger change, and their hand-rolled checks work today.
// ---------------------------------------------------------------------------

/**
 * @param {import('zod').ZodTypeAny} schema
 * @param {'body'|'query'|'params'} source
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      // One entry per offending field, so the client can mark the right input
      // rather than showing a single opaque message.
      const errors = result.error.issues.map((i) => ({
        field: i.path.join('.') || source,
        message: i.message,
      }));
      return res.status(400).json({
        code: 'VALIDATION_FAILED',
        message: 'The request contains invalid values.',
        errors,
      });
    }

    req[source] = result.data;
    next();
  };
}

// Reusable primitives.
const trimmed = (max = 200) => z.string().trim().min(1).max(max);
const optionalTrimmed = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));
const objectId = z
  .string()
  .regex(/^[a-fA-F0-9]{24}$/, 'Must be a 24-character MongoDB id');

module.exports = { validate, z, trimmed, optionalTrimmed, objectId };
