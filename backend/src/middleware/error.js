export function notFoundHandler(_req, res) {
  res.status(404).json({ status: "NOT_FOUND", message: "Route not found" });
}

export function errorHandler(err, _req, res, _next) {
  const statusCode = err.statusCode || 500;
  const isProduction = (process.env.NODE_ENV || "development") === "production";
  const message = isProduction && statusCode >= 500 ? "Internal server error" : (err.message || "Internal server error");

  res.status(statusCode).json({
    status: "ERROR",
    message
  });
}
