// src/error.ts
class AIbitatError extends Error {
  constructor() {
    super(...arguments);
  }
}

class APIError extends AIbitatError {
  constructor(message) {
    super(message);
  }
}

class RetryError extends APIError {
  constructor() {
    super(...arguments);
  }
}

export { APIError, RetryError };
