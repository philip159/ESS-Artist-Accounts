import type { PayoutBatch, PayoutItem } from "@shared/schema";

interface PayPalAccessToken {
  access_token: string;
  expires_in: number;
  expiresAt: number;
}

interface PayPalPayoutItem {
  recipient_type: "EMAIL";
  receiver: string;
  amount: {
    value: string;
    currency: string;
  };
  note?: string;
  sender_item_id: string;
  recipient_wallet?: "PAYPAL";
}

interface PayPalPayoutRequest {
  sender_batch_header: {
    sender_batch_id: string;
    email_subject: string;
    email_message?: string;
    recipient_type?: "EMAIL";
  };
  items: PayPalPayoutItem[];
}

interface PayPalBatchHeader {
  payout_batch_id: string;
  batch_status: "PENDING" | "PROCESSING" | "SUCCESS" | "DENIED" | "CANCELED";
  sender_batch_header: {
    sender_batch_id: string;
    email_subject: string;
    email_message?: string;
  };
  time_created?: string;
  time_completed?: string;
  funding_source?: string;
  amount?: {
    currency: string;
    value: string;
  };
  fees?: {
    currency: string;
    value: string;
  };
}

interface PayPalPayoutItemDetail {
  payout_item_id: string;
  transaction_id?: string;
  transaction_status: "SUCCESS" | "FAILED" | "PENDING" | "UNCLAIMED" | "RETURNED" | "ONHOLD" | "BLOCKED" | "REFUNDED" | "REVERSED";
  payout_batch_id: string;
  payout_item_fee?: {
    currency: string;
    value: string;
  };
  payout_item: {
    recipient_type: string;
    amount: {
      currency: string;
      value: string;
    };
    note?: string;
    receiver: string;
    sender_item_id: string;
  };
  time_processed?: string;
  errors?: {
    name: string;
    message: string;
  };
}

interface PayPalBatchResponse {
  batch_header: PayPalBatchHeader;
  items?: PayPalPayoutItemDetail[];
  links?: Array<{
    href: string;
    rel: string;
    method: string;
  }>;
}

class PayPalService {
  private baseUrl: string;
  private accessToken: PayPalAccessToken | null = null;

  constructor() {
    const useSandbox = process.env.PAYPAL_SANDBOX !== "false";
    this.baseUrl = useSandbox
      ? "https://api-m.sandbox.paypal.com"
      : "https://api-m.paypal.com";
  }

  private getCredentials(): { clientId: string; clientSecret: string } | null {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.warn("[PayPal] Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET");
      return null;
    }

    return { clientId, clientSecret };
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessToken.expiresAt - 60000) {
      return this.accessToken.access_token;
    }

    const credentials = this.getCredentials();
    if (!credentials) {
      throw new Error("PayPal credentials not configured");
    }

    const auth = Buffer.from(
      `${credentials.clientId}:${credentials.clientSecret}`
    ).toString("base64");

    const response = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[PayPal] Failed to get access token:", error);
      throw new Error(`PayPal authentication failed: ${response.status}`);
    }

    const data = await response.json();
    this.accessToken = {
      access_token: data.access_token,
      expires_in: data.expires_in,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    return this.accessToken.access_token;
  }

  isConfigured(): boolean {
    return this.getCredentials() !== null;
  }

  async createBatchPayout(
    batch: PayoutBatch,
    items: PayoutItem[]
  ): Promise<{ batchId: string; status: string }> {
    const token = await this.getAccessToken();

    const payoutItems: PayPalPayoutItem[] = items.map((item) => ({
      recipient_type: "EMAIL" as const,
      receiver: item.paypalEmailSnapshot,
      amount: {
        value: (item.netAmount / 100).toFixed(2),
        currency: item.currency,
      },
      note: item.paypalRecipientNameSnapshot
        ? `Payment to ${item.paypalRecipientNameSnapshot}`
        : "Artist commission payment",
      sender_item_id: item.id,
      recipient_wallet: "PAYPAL" as const,
    }));

    const request: PayPalPayoutRequest = {
      sender_batch_header: {
        sender_batch_id: batch.id,
        email_subject: "You have received a payment from East Side Studio London",
        email_message:
          "Thank you for your art sales. Your commission payment has been processed.",
        recipient_type: "EMAIL",
      },
      items: payoutItems,
    };

    console.log(`[PayPal] Creating batch payout with ${items.length} items`);

    const response = await fetch(`${this.baseUrl}/v1/payments/payouts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[PayPal] Failed to create payout:", error);
      throw new Error(`PayPal payout failed: ${response.status} - ${error}`);
    }

    const data: PayPalBatchResponse = await response.json();
    console.log(
      `[PayPal] Batch created: ${data.batch_header.payout_batch_id}, status: ${data.batch_header.batch_status}`
    );

    return {
      batchId: data.batch_header.payout_batch_id,
      status: data.batch_header.batch_status,
    };
  }

  async getBatchStatus(paypalBatchId: string): Promise<PayPalBatchResponse> {
    const token = await this.getAccessToken();

    const response = await fetch(
      `${this.baseUrl}/v1/payments/payouts/${paypalBatchId}?fields=items`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("[PayPal] Failed to get batch status:", error);
      throw new Error(
        `PayPal get batch failed: ${response.status} - ${error}`
      );
    }

    return await response.json();
  }

  async getItemStatus(paypalItemId: string): Promise<PayPalPayoutItemDetail> {
    const token = await this.getAccessToken();

    const response = await fetch(
      `${this.baseUrl}/v1/payments/payouts-item/${paypalItemId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("[PayPal] Failed to get item status:", error);
      throw new Error(`PayPal get item failed: ${response.status} - ${error}`);
    }

    return await response.json();
  }

  mapBatchStatus(paypalStatus: string): string {
    switch (paypalStatus) {
      case "PENDING":
        return "processing";
      case "PROCESSING":
        return "processing";
      case "SUCCESS":
        return "completed";
      case "DENIED":
      case "CANCELED":
        return "failed";
      default:
        return "processing";
    }
  }

  mapItemStatus(paypalStatus: string): string {
    switch (paypalStatus) {
      case "SUCCESS":
        return "paid";
      case "PENDING":
      case "UNCLAIMED":
      case "ONHOLD":
        return "processing";
      case "FAILED":
      case "BLOCKED":
      case "RETURNED":
      case "REFUNDED":
      case "REVERSED":
        return "failed";
      default:
        return "processing";
    }
  }
}

export const paypalService = new PayPalService();
