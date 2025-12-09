# Meduhub Backend - Firebase Setup

## Firebase Migration Complete! 🎉

Your backend has been successfully migrated from MongoDB to Firebase Firestore.

## Setup Instructions

### 1. Download Firebase Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **meduhub-52922**
3. Click the gear icon ⚙️ → **Project settings**
4. Go to the **Service accounts** tab
5. Click **Generate new private key**
6. Click **Generate key** to download the JSON file
7. Rename the downloaded file to `serviceAccountKey.json`
8. Place it in the root directory of this project (same folder as `server.js`)

### 2. Install Dependencies

```bash
npm install
```

### 3. Start the Server

```bash
npm start
```

or

```bash
node server.js
```

## API Endpoints

All endpoints remain the same as before:

- `GET /api/health` - Health check
- `POST /api/register` - Submit registration
- `GET /api/registrations` - Get all registrations (with pagination)
- `PATCH /api/registrations/:id` - Update registration status

## What Changed?

✅ Replaced **MongoDB/Mongoose** with **Firebase Firestore**
✅ All validation logic preserved
✅ Duplicate detection still works (24-hour window)
✅ Pagination implemented
✅ All API responses remain the same

## Firebase Security Rules (Recommended)

Go to Firebase Console → Firestore Database → Rules and add:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /registrations/{document=**} {
      allow read, write: if false; // Only backend can access
    }
  }
}
```

## Environment Variables (Optional)

Instead of using `serviceAccountKey.json`, you can use environment variables in production:

Create a `.env` file:

```
FIREBASE_CLIENT_EMAIL=your-firebase-adminsdk@meduhub-52922.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour-Key-Here\n-----END PRIVATE KEY-----\n"
```

## Security Notes

⚠️ **IMPORTANT**: Never commit `serviceAccountKey.json` to Git!
⚠️ The file is already added to `.gitignore`
