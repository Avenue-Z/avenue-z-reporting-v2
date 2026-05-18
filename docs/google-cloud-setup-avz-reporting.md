# Google Cloud Setup — GA4 & Search Console

**Audience:** Data Engineer  
**Goal:** Connect Google Analytics 4 and Google Search Console to the Avenue Z reporting platform using a single GCP Service Account.

---

## Overview

Both GA4 and Google Search Console are accessed server-side using a **Google Cloud Service Account** — a machine identity that the app authenticates with to call the respective APIs. You will:

1. Create (or reuse) a Google Cloud project
2. Enable the two required APIs
3. Create a Service Account and download its JSON key
4. Grant the Service Account read access to the GA4 property and GSC site
5. Configure environment variables in the app

The same Service Account and JSON key are used for both GA4 and Search Console.

---

## Prerequisites

- A Google account with access to [Google Cloud Console](https://console.cloud.google.com)
- Admin access to the GA4 property in [Google Analytics](https://analytics.google.com)
- Verified ownership of the site in [Google Search Console](https://search.google.com/search-console)
- Access to the app's `.env.local` file (development) and Vercel project (production)

---

## Step 1 — Create or Select a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown in the top navigation bar
3. Either select an existing project or click **New Project**
   - Suggested name: `avenue-z-reporting`
4. Note the **Project ID** (not the display name) — you'll need it later

---

## Step 2 — Enable the Required APIs

Both APIs must be explicitly enabled in your GCP project.

### Google Analytics Data API (GA4)

1. Go to **APIs & Services → Library**
2. Search for **"Google Analytics Data API"**
3. Click it and press **Enable**

### Google Search Console API

1. Stay in **APIs & Services → Library**
2. Search for **"Google Search Console API"**
3. Click it and press **Enable**

---

## Step 3 — Create a Service Account

1. Go to **IAM & Admin → Service Accounts**
2. Click **Create Service Account**
3. Fill in the details:
   - **Name:** `avenue-z-reporting`
   - **Description:** `Read-only access for GA4 and Search Console`
4. Click **Create and Continue**
5. For **Grant this service account access to project**: skip this step (no project-level roles needed — access is granted at the property level in GA4 and GSC)
6. Click **Done**

### Download the JSON Key

1. Click the newly created service account to open it
2. Go to the **Keys** tab
3. Click **Add Key → Create new key**
4. Select **JSON** and click **Create**
5. The key file downloads automatically — store it securely, it cannot be re-downloaded

---

## Step 4 — Grant Access to the GA4 Property

The Service Account needs **Viewer** access to the GA4 property.

1. Go to [analytics.google.com](https://analytics.google.com)
2. Select the **Avenue Z** account and property
3. Go to **Admin** (gear icon, bottom left)
4. Under **Property**, click **Property Access Management**
5. Click the **+** button → **Add users**
6. Enter the service account's email address (looks like `avenue-z-reporting@your-project-id.iam.gserviceaccount.com`)
7. Set the role to **Viewer**
8. Click **Add**

### Find Your GA4 Property ID

While you're in GA4 Admin:

1. Go to **Admin → Property Settings**
2. Copy the **Property ID** (a numeric ID like `123456789`)
3. The app requires it in the format: **`properties/123456789`** (include the prefix)

---

## Step 5 — Grant Access to Google Search Console

The Service Account needs read access to the site.

1. Go to [search.google.com/search-console](https://search.google.com/search-console)
2. Select the **avenuez.com** property
3. Click **Settings** (gear icon)
4. Click **Users and permissions**
5. Click **Add User**
6. Enter the service account's email address
7. Set permission to **Full** (required for API access — GSC has no read-only API permission)
8. Click **Add**

> **Note:** GSC API access requires the "Full" permission level even for read-only queries. This is a Google limitation, not an app setting.

---

## Step 6 — Configure Environment Variables

### Encode the JSON Key

The app expects the service account JSON as a **base64-encoded string** (so it can be stored safely as a single env var).

Run this in your terminal (replace the path with where you saved the JSON key):

```bash
base64 -i ~/Downloads/avenue-z-reporting-abc123.json
```

Copy the entire output — it will be a long single-line string.

> **Mac/Linux:** Use `base64 -i <file>` as shown above.  
> **Windows (PowerShell):** `[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\key.json"))`

### Set the Variables

#### In `.env.local` (development)

Open `.env.local` in the project root and fill in:

```env
GOOGLE_SERVICE_ACCOUNT_KEY=<paste the base64 string here>
GA4_PROPERTY_ID_AVENUE_Z=properties/123456789
```

Replace `123456789` with the actual numeric property ID from Step 4.

#### In Vercel (production)

1. Go to your Vercel project → **Settings → Environment Variables**
2. Add `GOOGLE_SERVICE_ACCOUNT_KEY` with the base64 string as the value
3. Add `GA4_PROPERTY_ID_AVENUE_Z` with the value `properties/123456789`
4. Set both to apply to **Production**, **Preview**, and **Development** environments
5. Redeploy for the changes to take effect

---

## Step 7 — Verify the GA4 Connection

GA4 has a working API client in the app. Once the env vars are set:

1. Start the dev server: `npm run dev`
2. Navigate to the **Web Analytics** report for Avenue Z
3. If the connection works, live data will replace the demo data placeholder
4. If you see an error, check the server logs — common issues are listed below

### Common GA4 Errors

| Error | Cause | Fix |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_KEY is not set` | Env var missing or empty | Paste the base64 key into `.env.local` |
| `403 The caller does not have permission` | Service account not added to GA4 property | Repeat Step 4 |
| `invalid_grant` | JSON key is malformed or expired | Re-download and re-encode the JSON key |
| `Property not found` | Wrong property ID format | Ensure the value starts with `properties/` |

---

## Step 8 — Verify the Search Console Connection

The Search Console API client is built and ready (`lib/gsc/client.ts`). Once access is granted in Step 5 and the env var below is set, the report loads live data automatically.

### Set the Site URL Variable

Add one more env var alongside `GOOGLE_SERVICE_ACCOUNT_KEY`:

#### In `.env.local` (development)

```env
# Match the exact format of your GSC property type:
GSC_SITE_URL_AVENUE_Z=sc-domain:avenuez.com     # domain property
# GSC_SITE_URL_AVENUE_Z=https://avenuez.com/    # URL-prefix property (trailing slash required)
```

#### In Vercel (production)

Add `GSC_SITE_URL_AVENUE_Z` with the same value to **Production**, **Preview**, and **Development** environments.

### Verify

1. Start the dev server: `npm run dev`
2. Navigate to the **Search Console** report for Avenue Z
3. Live data will replace the loading state if the connection is working
4. If you see an error, check the server logs — common issues below

### Common Search Console Errors

| Error | Cause | Fix |
|---|---|---|
| `Missing GOOGLE_SERVICE_ACCOUNT_KEY` | Shared env var not set | Complete Step 6 |
| `403 User does not have sufficient permission` | Service account not added to GSC | Repeat Step 5 |
| `Missing env var: GSC_SITE_URL_AVENUE_Z` | Site URL var not set | Add it per the instructions above |
| No data / empty rows | Wrong site URL format | Check whether your GSC property is domain or URL-prefix type |

---

## Reference

| Variable | Format | Example |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Base64-encoded JSON string | `eyJh...` |
| `GA4_PROPERTY_ID_AVENUE_Z` | `properties/<numeric ID>` | `properties/123456789` |
| `GSC_SITE_URL_AVENUE_Z` | Domain or URL-prefix property URL | `sc-domain:avenuez.com` |

| API | Name in GCP Library |
|---|---|
| GA4 | Google Analytics Data API |
| Search Console | Google Search Console API |

**Service Account email format:**  
`<account-name>@<project-id>.iam.gserviceaccount.com`

**How the app decodes the key (for reference):**  
`lib/ga4/client.ts` calls `Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY, 'base64').toString('utf-8')` and passes the result to `BetaAnalyticsDataClient` as credentials JSON.
