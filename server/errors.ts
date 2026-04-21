// Custom error types for better error handling

export class IntegrationDisconnectedError extends Error {
  constructor(
    public integration: string,
    public reconnectUrl?: string
  ) {
    super(`${integration} integration is disconnected. Please reconnect in the Replit integrations panel.`);
    this.name = 'IntegrationDisconnectedError';
  }
}

export class DropboxHealthCheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DropboxHealthCheckError';
  }
}
