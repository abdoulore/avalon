export function errorHandler(error, req, res, next) {
  const status = error.status || 500;
  if (status === 402 && error.paymentRequirement) {
    return res
      .status(402)
      .set("PAYMENT-REQUIRED", Buffer.from(JSON.stringify(error.paymentRequirement)).toString("base64"))
      .json({
        error: error.message || "Payment required",
        paymentRequired: error.paymentRequirement,
      });
  }

  res.status(status).json({
    error: error.message || "Something went wrong",
  });
}
