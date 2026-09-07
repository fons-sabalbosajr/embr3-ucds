// ---------------------------------------------------------------------------
// Terminal error handling.
//
// Every controller in the codebase carries its own try/catch that logs and
// returns a 500. Those keep working untouched — this exists so new code can
// simply `next(err)`, and so an unmatched /api path answers with JSON rather
// than Express's default HTML page, which a fetch() caller cannot parse.
// ---------------------------------------------------------------------------

/** An error carrying the status and code the client should see. */
class AppError extends Error {
  constructor(message, status = 500, code) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    Error.captureStackTrace?.(this, AppError);
  }
}

const badRequest = (message, code = 'BAD_REQUEST') => new AppError(message, 400, code);
const notFoundError = (message, code = 'NOT_FOUND') => new AppError(message, 404, code);
const forbidden = (message, code = 'FORBIDDEN') => new AppError(message, 403, code);
const conflict = (message, code = 'CONFLICT') => new AppError(message, 409, code);

/** JSON 404 for unmatched API paths. Non-API paths fall through untouched. */
function notFound(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();
  res.status(404).json({
    code: 'NOT_FOUND',
    message: `No route matches ${req.method} ${req.path}`,
  });
}

/**
 * Terminal handler. Must be registered last, after every route.
 *
 * A stack trace is never returned to the client; it is logged instead. An error
 * without an explicit status is treated as a bug and reported as 500 with a
 * generic message, so an internal detail cannot leak through err.message.
 */
// eslint-disable-next-line no-unused-vars -- Express identifies the terminal
// handler by arity; `next` must stay in the signature.
function errorHandler(err, req, res, next) {
  const status = Number(err?.status) || 500;
  const isExpected = status < 500;

  if (isExpected) {
    console.warn(`${req.method} ${req.path} -> ${status}: ${err.message}`);
  } else {
    console.error(`${req.method} ${req.path} -> ${status}:`, err);
  }

  if (res.headersSent) return next(err);

  res.status(status).json({
    code: err?.code || (isExpected ? 'REQUEST_FAILED' : 'INTERNAL_ERROR'),
    message: isExpected ? err.message : 'An unexpected error occurred.',
  });
}

module.exports = {
  AppError,
  badRequest,
  notFoundError,
  forbidden,
  conflict,
  notFound,
  errorHandler,
};
