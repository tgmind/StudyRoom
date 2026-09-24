import { PaymentSubmission } from "./types";

// In-memory queue shared between submission endpoint and admin review endpoint
export const inMemorySubmissions: PaymentSubmission[] = [];
