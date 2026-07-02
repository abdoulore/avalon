export class AiContentProvider {
  async generateRecommendations({ userId }) {
    return {
      userId,
      items: [],
      provider: "placeholder",
    };
  }
}
