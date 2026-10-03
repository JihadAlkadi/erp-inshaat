declare global {
  namespace Express {
    interface Request {
      validatedQuery?: unknown;
    }
  }
}

export {};
