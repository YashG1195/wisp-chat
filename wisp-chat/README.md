# Wisp Chat

A real-time messaging web app built with React, Vite, and Firebase Firestore.

## Features
- Pick a display name to join the chat
- Send and receive messages in real time
- Shared chat room — all connected users see new messages instantly

## Tech stack
- [React](https://react.dev/) + [Vite](https://vitejs.dev/)
- [Firebase Firestore](https://firebase.google.com/docs/firestore) for real-time data sync
- [Firebase Hosting](https://firebase.google.com/docs/hosting) for deployment

## Getting started

```bash
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

## Deployment

This project deploys to Firebase Hosting:

```bash
npm run build
firebase deploy
```

## Project structure

```
src/
  firebase.js   # Firebase config + Firestore setup
  App.jsx       # Main chat UI and logic
  App.css       # Styling
firestore.rules # Firestore security rules
firebase.json   # Firebase Hosting + Firestore config
```
