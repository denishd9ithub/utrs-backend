/**
 * Villa Aggregator MVP - Backend API
 * Node.js + Express + Supabase
*/
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/index.js';
import { supabase } from './config/supabase.js';
import { ensureDefaultAdmin } from './config/ensureAdmin.js';
import { errorHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';
import { handleRazorpayWebhook } from './services/bookingService.js';
import { handleWhatsAppWebhook } from './controllers/whatsappController.js';
import { validateWebhookSignature } from './lib/whatsappSignature.js';
import { startSyncScheduler } from './jobs/syncScheduler.js';

const app = express();    

// Security (CSP relaxed for Razorpay test page)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://checkout.razorpay.com"],
        frameSrc: ["'self'", "https://api.razorpay.com", "https://razorpay.com", "https://checkout.razorpay.com"],
        connectSrc: ["'self'", "https://api.razorpay.com", "https://checkout.razorpay.com"],
      },
    },
  })
);
app.use(cors({ origin: true }));                                            

// Razorpay webhook - GET for quick reachability test (ngrok)
app.get(`${config.apiPrefix}/bookings/webhook/razorpay`, (req, res) => {
  res.json({ ok: true, message: 'Razorpay webhook endpoint reachable', ts: new Date().toISOString() });
});

// Razorpay webhook (raw body)   
app.post(
  `${config.apiPrefix}/bookings/webhook/razorpay`,
  express.raw({ type: 'application/json' }),
  async (req, res, next) => {
    try {
      await handleRazorpayWebhook(req);
      res.status(200).send('OK');
    } catch (err) {
      next(err);
    }
  }                                                                                          
);                                                                                                                                                                                                                                                             
// WhatsApp webhook (raw body for signature, ack first then process async)
app.post(
  `${config.apiPrefix}/whatsapp`,
  express.raw({ type: 'application/json' }),
  async (req, res, next) => {
    const signature = req.headers['x-hub-signature-256'];
    const rawBody = req.body?.toString?.() ?? req.body;
    if (!validateWebhookSignature(rawBody, signature)) {
      return res.status(401).send('Invalid signature');
    }                                                                                     
    res.status(200).send('OK');                                                                           
    setImmediate(() => {
      handleWhatsAppWebhook(rawBody).catch((err) =>
        console.error('[WhatsApp] Webhook processing failed:', err)
      );
    });
  }                                       
);                    
                                                                                                                                  
app.use(express.json({ limit: '1mb' }));                            
app.use(express.urlencoded({ extended: true }));                                                               

// Health check 
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });                                                                
});                                          

// Static files (Razorpay test page)
app.use(express.static('public'));

// API routes
app.use(config.apiPrefix, routes);     


// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});                                                                                                                                                                            
// Error handler
app.use(errorHandler);
      

app.listen(config.port, async () => {
  console.log(`[Villa Aggregator] API running on http://localhost:${config.port}`);
  console.log(`[API] Prefix: ${config.apiPrefix}`);

  // Verify DB connection & ensure default admin
  if (config.supabase?.url && config.supabase?.serviceRoleKey) {
    const { error } = await supabase.from('partners').select('id').limit(1);
    if (error) {
      console.warn('[Supabase] Connection check failed:', error.message);
    } else {
      console.log('[Supabase] Database connected');
      await ensureDefaultAdmin(supabase);
    }
  }

  startSyncScheduler();
});
