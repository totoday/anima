import { WebClient, type WebClientOptions } from '@slack/web-api';

export function createSlackWebClient(token: string): WebClient {
  return new WebClient(token, slackWebClientOptions());
}

function slackWebClientOptions(): WebClientOptions {
  return process.env.ANIMA_SLACK_API_URL ? { slackApiUrl: process.env.ANIMA_SLACK_API_URL } : {};
}
