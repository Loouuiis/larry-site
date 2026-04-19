export class OfflineError extends Error {
  constructor(message = "You're offline") {
    super(message);
    this.name = "OfflineError";
  }
}
