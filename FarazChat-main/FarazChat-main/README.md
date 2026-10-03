# FarazChat

FarazChat is a React, Vite, and Capacitor messenger. Accounts use a unique 8-digit contact code and Firebase Authentication; app data is stored in Cloud Firestore. Profile photos are compressed to a maximum 400px JPEG at 70% quality and saved as base64 in the user profile. Attachments and voice notes are currently disabled.

## Run locally

Requires Node.js 20 or newer.

```sh
npm install
npm run dev
```

The Firebase web configuration is in `src/firebase.js`. Use the configuration for your Firebase project, enable Email/Password authentication, and create a Cloud Firestore database. The app maps each contact code to an internal Firebase email address; users still sign in with their code and password.

## Firestore data

- `users/{uid}` stores `id`, `contactCode`, `displayName`, `avatarBase64`, `notificationsEnabled`, and `lastSeen` alongside profile preferences.
- `messages/{messageId}` stores text only. Direct messages include `conversationId`, `senderId`, `recipientId`, and `participants`; group messages include `groupId` and `participants`.
- `groups/{groupId}` stores its name, creator, member IDs, and latest text preview.
- `contacts/{ownerId_contactId}` stores a private nickname with `ownerId` and `contactId`.
- `statuses/{statusId}` stores text, `ownerId`, and an `expiresAt` timestamp 24 hours after publication. Expired statuses are hidden by the app and the current user's expired documents are cleaned up when the status view is opened. For background deletion, enable a Firestore TTL policy on `statuses.expiresAt` in Google Cloud; client cleanup alone cannot run while the app is closed.

Firestore Security Rules must permit authenticated users to read discoverable user profiles, read/write their own profile and contacts, read messages where they are a participant, read/write groups where they are a member, and read active statuses while restricting status creation/deletion to the owner. Rules are managed in the Firebase project and are not included in this repository, so verify they cover these collections before deployment.

Online presence is based on `lastSeen` within the previous five minutes. Typing indicators and delivery/read receipts are not currently provided.

## Android

After setting the Firebase configuration and building the web app, sync the Capacitor project and build the Android app with:

```sh
npm run android:apk
```