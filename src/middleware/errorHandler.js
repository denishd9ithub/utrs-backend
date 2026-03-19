/**
 * Global error handler
 * Note: err.response (Axios) has circular refs - extract safe props only.
 */
export function errorHandler(err, req, res, next) {
  const status = err.statusCode || err.status || err.response?.status || 500;
  const message = err.message || 'Internal server error';

  console.error(`[Error] ${status} ${message}`, err.stack);

  const payload = {
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  };

  // Axios err.response has circular refs - extract safe fields only
  if (err.response) {
    payload.details = {
      status: err.response.status,
      statusText: err.response.statusText,
      data: err.response.data,
    };
  }     

  console.log(payload);                         

  res.status(status).json(payload);     
}                                                     ///////////////////////////
