# API Testing Guide – Villa Aggregator Flow

Yeh guide tumhare main flow ko **step-by-step** test karne ke liye hai:

**Flow:** Login → Sync → Search → Create booking (logged-in user = guest) → Razorpay → HyperGuest confirm

---

## Prerequisites

1. **.env** mein set karo:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `HYPERGUEST_AUTH_TOKEN`, `HYPERGUEST_TEST_PROPERTY_ID` (e.g. 19912)
   - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`

2. **Migrations run karo** (Supabase SQL Editor ya `supabase db push`):
   - `006_guests_user_link.sql`
   - `007_profiles_full_name_on_signup.sql`

3. **Server start:**
   ```bash
   npm run dev
   ```
   Base URL: `http://localhost:3000` (ya jo port .env mein hai)

---

## Step 1: Signup / Login

### 1a. Signup (naya user)

```http
POST /api/v1/auth/signup
Content-Type: application/json

{
  "email": "test@example.com",
  "password": "your-secure-password",
  "full_name": "Test User"
}
```

**Response:** `access_token`, `user` – token copy karo.

### 1b. Login (existing user)

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "test@example.com",
  "password": "your-secure-password"
}
```

**Response:** `access_token` – yeh token baaki requests mein `Authorization: Bearer <token>` use hoga.

---

## Step 2: Sync HyperGuest Inventory

```bash
npm run sync:hyperguest
```

**Verify:** Supabase → `villas`, `villa_sources`, `villa_pricing` tables check karo.

---

## Step 3: Search Villas (our sell price)

```http
POST /api/v1/search
Content-Type: application/json

{
  "checkIn": "2025-02-20",
  "checkOut": "2025-02-22",
  "guests": 2
}
```

**Response:** Villas with sell prices. Ek `villa_id` copy karo.

---

## Step 4: Get/Create Guest (Logged-in user = guest)

### Option A: GET /guests/me (auth required)
Logged-in user ke liye guest auto-create hoga:

```http
GET /api/v1/guests/me
Authorization: Bearer <access_token>
```

**Response:** Guest object with `id`, `name`, `email` – profile se filled.

### Option B: POST /guests (manual create)
Guest details bhejo, agar logged in ho to `user_id` auto-link ho jayega:

```http
POST /api/v1/guests
Content-Type: application/json
Authorization: Bearer <access_token>   <!-- optional -->

{
  "name": "Test User",
  "email": "test@example.com",
  "phone": "+919876543210"
}
```

**Response:** Guest with `id`. Agar Bearer token hai to `user_id` bhi set hoga.

### Option C: Guest details inline (booking ke saath)
Step 5 mein directly `guest: { name, email, phone }` bhej sakte ho – guest create ho jayega.

---

## Step 5: Create Booking

**3 tareeke:**

### A) Logged-in user (sabse simple)
Sirf `Authorization` header – guest auto-use hoga:

```http
POST /api/v1/bookings
Content-Type: application/json
Authorization: Bearer <access_token>

{
  "villaId": "<villa-uuid-from-step-3>",
  "checkIn": "2025-02-20",
  "checkOut": "2025-02-22",
  "guests": 2
}
```

### B) Guest details inline (no login)
```http
POST /api/v1/bookings
Content-Type: application/json

{
  "villaId": "<villa-uuid>",
  "checkIn": "2025-02-20",
  "checkOut": "2025-02-22",
  "guests": 2,
  "guest": {
    "name": "Test User",
    "email": "test@example.com",
    "phone": "+919876543210"
  }
}
```

### C) guestId use karke
```http
POST /api/v1/bookings
Content-Type: application/json

{
  "villaId": "<villa-uuid>",
  "checkIn": "2025-02-20",
  "checkOut": "2025-02-22",
  "guests": 2,
  "guestId": "<guest-uuid-from-step-4>"
}
```

**Response:** Booking with `id`, `booking_ref`, `sell_price`, `status: "pending"`.

---

## Step 6: Create Razorpay Order

```http
POST /api/v1/bookings/<booking-id>/create-order
```

**Response:**
```json
{
  "orderId": "order_xxx",
  "amount": 12300,
  "currency": "INR",
  "keyId": "rzp_test_xxx"
}
```

Frontend Razorpay Checkout open karega.

---

## Step 7: Verify Payment

Razorpay test payment complete hone ke baad:

```http
POST /api/v1/bookings/<booking-id>/verify-payment
Content-Type: application/json

{
  "orderId": "order_xxx",
  "paymentId": "pay_xxx",
  "signature": "<razorpay_signature>"
}
```

**Flow:** Signature verify → `status: paid` → HyperGuest confirm → `status: confirmed`.

---

## Step 8: Verify Booking

```http
GET /api/v1/bookings/<booking-id>
```

**Check:** `status: "confirmed"`, `partner_reservation_id` set.

---

## Summary (API order)

| # | API | Auth? | Purpose |
|---|-----|-------|---------|
| 1 | `POST /auth/signup` | No | Register |
| 2 | `POST /auth/login` | No | Get token |
| 3 | `npm run sync:hyperguest` | - | Sync inventory |
| 4 | `POST /search` | No | Search villas |
| 5 | `GET /guests/me` | Yes | Get/create guest for logged-in user |
| 6 | `POST /bookings` | Optional | Create booking (guest auto if logged in) |
| 7 | `POST /bookings/:id/create-order` | No | Razorpay order |
| 8 | `POST /bookings/:id/verify-payment` | No | Verify + HG confirm |
| 9 | `GET /bookings/:id` | No | Check status |

---

## Quick Test (curl)

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"xxx"}' | jq -r '.access_token')

# 2. Search
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"checkIn":"2025-02-20","checkOut":"2025-02-22","guests":2}'

# 3. Create booking (logged-in = guest)
curl -X POST http://localhost:3000/api/v1/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"villaId":"<uuid>","checkIn":"2025-02-20","checkOut":"2025-02-22","guests":2}'
```

---

## Troubleshooting

- **"Guest required"** → `guestId`, `guest: {...}`, ya `Authorization: Bearer <token>` bhejo
- **"No available pricing"** → Sync run karo, dates sync range ke andar honi chahiye
- **"Invalid payment signature"** → Razorpay key secret check karo
- **HG confirm fail** → Console `[HyperGuest] Post-payment confirm failed` – guest `name` + `raw_data` room/rate check karo
