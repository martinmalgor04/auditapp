import { AwsClient } from 'aws4fetch';
import { getR2Env } from './r2-config';

let clientInstance: AwsClient | undefined;

export function getAwsClient(): AwsClient {
  if (!clientInstance) {
    const env = getR2Env();
    clientInstance = new AwsClient({
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      service: 's3',
      region: 'auto'
    });
  }
  return clientInstance;
}

export function resetAwsClientForTests(): void {
  clientInstance = undefined;
}
