export class SubscriptionService {
  async getFallbackPlan() {
    return {
      enabled: false,
      planName: "Avalon Plus",
      note: "Subscription fallback mode placeholder.",
    };
  }
}

export const subscriptionService = new SubscriptionService();
