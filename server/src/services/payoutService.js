export class PayoutService {
  async createCreatorPayoutBatch() {
    return {
      status: "not_configured",
      provider: "mock",
      payouts: [],
    };
  }
}

export const payoutService = new PayoutService();
