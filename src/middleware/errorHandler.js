export function errorHandler(err, req, res, next) {
  const status = err.status || 500;

  console.error(`[${new Date().toISOString()}] ${status} - ${err.message}`);
  if (process.env.NODE_ENV === 'development') {
    console.error(err.stack);
  }

  const safeMessage = status >= 500
    ? 'Internal server error'
    : err.message || 'An error occurred';

  res.status(status).json({
    error: { message: safeMessage, status }
  });
}
