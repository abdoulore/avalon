// Future implementation point for Circle Gateway/Nanopayments on Arc Testnet.
// Keep this class API aligned with MockPaymentAdapter so paymentService can
// switch adapters without changing usage tracking or creator accounting.
export class ArcGatewayPaymentAdapter {
  async chargeUsage() {
    throw new Error("Arc Gateway payments are not integrated yet.");
  }

  async creditMockBalance() {
    throw new Error("Mock top-ups are not available for real payment adapters.");
  }
}
