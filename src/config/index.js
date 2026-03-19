
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  apiPrefix: process.env.API_PREFIX || '/api/v1',

  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },

  hyperguest: {
    apiUrl: process.env.HYPERGUEST_API_URL || 'https://api.hyperguest.com',
    searchUrl: process.env.HYPERGUEST_SEARCH_URL || 'https://search-api.hyperguest.io',
    bookUrl: process.env.HYPERGUEST_BOOK_URL || 'https://book-api.hyperguest.com',
    staticUrl: process.env.HYPERGUEST_STATIC_URL || 'https://hg-static.hyperguest.com',
    authToken: (process.env.HYPERGUEST_AUTH_TOKEN || '').trim(),
    testPropertyId: process.env.HYPERGUEST_TEST_PROPERTY_ID || '19912',
    clientId: process.env.HYPERGUEST_CLIENT_ID,
    clientSecret: process.env.HYPERGUEST_CLIENT_SECRET,
    sandbox: process.env.HYPERGUEST_SANDBOX === 'true',
  },

  roibos: {
    apiUrl: process.env.ROIBOS_API_URL || 'https://api.roibos.com',
    apiKey: process.env.ROIBOS_API_KEY,
    sandbox: process.env.ROIBOS_SANDBOX === 'true',
  },

  whatsapp: {
    apiUrl: process.env.WHATSAPP_API_URL || 'https://graph.facebook.com',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v18.0',
    apiKey: process.env.WHATSAPP_API_KEY,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    appSecret: process.env.WHATSAPP_APP_SECRET,
    webhookBaseUrl: process.env.WEBHOOK_BASE_URL || process.env.APP_URL,
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },

  razorpay: {
    keyId: (process.env.RAZORPAY_KEY_ID || '').trim(),
    keySecret: (process.env.RAZORPAY_KEY_SECRET || '').trim(),
    webhookSecret: (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim(),
  },

  zoho: {
    clientId: process.env.ZOHO_CLIENT_ID,
    clientSecret: process.env.ZOHO_CLIENT_SECRET,
    refreshToken: process.env.ZOHO_REFRESH_TOKEN,
    organizationId: process.env.ZOHO_ORGANIZATION_ID,
    defaultCustomerId: process.env.ZOHO_DEFAULT_CUSTOMER_ID,
    booksUrl: 'https://www.zohoapis.com/books/v3',
  },
  tally: {
    apiUrl: process.env.TALLY_API_URL,
    organizationId: process.env.TALLY_ORGANIZATION_ID,
  },

  app: {
    url: process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000',
    resetPasswordPath: process.env.RESET_PASSWORD_PATH || '/reset-password',
  },

  defaults: {
    globalMarkupPercent: 15,
    currency: 'INR',
    whatsappResponseTimeoutMs: 3000,
  },
};
