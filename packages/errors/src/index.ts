// =============================================================================
// o.company · errors
// =============================================================================
// Stable, machine-readable error codes. Every error thrown in the system has
// a code from this enum + a human message. The web app maps codes to localized
// messages via @o/i18n. The mobile app does the same.

export const ErrorCode = {
  // Auth
  AUTH_INVALID_CREDENTIALS:   "AUTH_001",
  AUTH_SESSION_EXPIRED:        "AUTH_002",
  AUTH_TOKEN_INVALID:          "AUTH_003",
  AUTH_EMAIL_NOT_VERIFIED:     "AUTH_004",
  AUTH_PASSWORD_TOO_WEAK:      "AUTH_005",
  AUTH_INVITE_INVALID:          "AUTH_006",
  AUTH_INVITE_EXPIRED:          "AUTH_007",
  AUTH_2FA_REQUIRED:           "AUTH_008",
  AUTH_2FA_INVALID:            "AUTH_009",
  AUTH_KYC_REQUIRED:           "AUTH_010",

  // Authorization
  AUTHZ_PERMISSION_DENIED:      "AUTHZ_001",
  AUTHZ_ORG_MISMATCH:          "AUTHZ_002",
  AUTHZ_OWNER_REQUIRED:        "AUTHZ_003",
  AUTHZ_BILLING_REQUIRED:      "AUTHZ_004",

  // Validation
  VALIDATION_REQUIRED:         "VAL_001",
  VALIDATION_FORMAT:           "VAL_002",
  VALIDATION_RANGE:            "VAL_003",
  VALIDATION_UNIQUE:           "VAL_004",
  VALIDATION_REFERENCE:        "VAL_005",

  // Resources
  RESOURCE_NOT_FOUND:          "RES_001",
  RESOURCE_CONFLICT:           "RES_002",
  RESOURCE_GONE:               "RES_003",
  RESOURCE_LOCKED:             "RES_004",

  // Payments
  PAYMENT_CARD_DECLINED:       "PAY_001",
  PAYMENT_INSUFFICIENT_FUNDS:  "PAY_002",
  PAYMENT_3DS_REQUIRED:        "PAY_003",
  PAYMENT_FRAUD_SUSPECTED:     "PAY_004",
  PAYMENT_ALREADY_REFUNDED:    "PAY_005",
  PAYMENT_CRYPTO_UNDERPAID:    "PAY_006",
  PAYMENT_CRYPTO_EXPIRED:      "PAY_007",
  PAYMENT_CHARGE_DISPUTED:     "PAY_008",

  // External services
  EXT_STRIPE_DOWN:             "EXT_001",
  EXT_RPC_DOWN:                "EXT_002",
  EXT_EMAIL_BOUNCED:           "EXT_003",
  EXT_STORAGE_DOWN:            "EXT_004",

  // Server
  SERVER_INTERNAL:             "SRV_001",
  SERVER_TIMEOUT:              "SRV_002",
  SERVER_MAINTENANCE:          "SRV_003",
  SERVER_RATE_LIMITED:         "SRV_004",

  // Compliance
  COMPLIANCE_KYC_FAILED:       "CMP_001",
  COMPLIANCE_SANCTIONED:       "CMP_002",
  COMPLIANCE_TAX_MISMATCH:     "CMP_003",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;

  constructor(opts: {
    code: ErrorCode;
    message: string;
    status?: number;
    details?: Record<string, unknown>;
    cause?: unknown;
  }) {
    super(opts.message);
    this.name = "AppError";
    this.code = opts.code;
    this.status = opts.status ?? 500;
    this.details = opts.details;
    this.cause = opts.cause;
  }

  /** Render as a JSON API response. */
  toJSON() {
    return {
      error: {
        code:    this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

/** Helper builders. */
export const errors = {
  unauthorized:    (msg = "Unauthorized")           => new AppError({ code: "AUTHZ_001", message: msg, status: 403 }),
  forbidden:        (msg = "Permission denied")      => new AppError({ code: "AUTHZ_001", message: msg, status: 403 }),
  notFound:         (resource: string)             => new AppError({ code: "RES_001", message: `${resource} not found`, status: 404 }),
  conflict:         (msg: string)                   => new AppError({ code: "RES_002", message: msg, status: 409 }),
  validation:       (msg: string, details?: unknown) => new AppError({ code: "VAL_001", message: msg, status: 422, details }),
  internal:         (msg = "Internal server error")  => new AppError({ code: "SRV_001", message: msg, status: 500 }),
  paymentDeclined:  (msg: string)                   => new AppError({ code: "PAY_001", message: msg, status: 402 }),
  rateLimited:      (msg = "Too many requests")      => new AppError({ code: "SRV_004", message: msg, status: 429 }),
};

/** Type guard. */
export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
