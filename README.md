Purpose: Backend API for the AssetVerse Corporate Asset Management System, handling authentication, asset management, employee requests, package upgrades, and payment workflows.

Live URL: https://assignment-11-server-dun-phi.vercel.app

Key features list: Secure REST APIs, Firebase token verification, role-based access (HR & Employee), asset CRUD operations, asset request & approval system, package subscription handling, Stripe payment integration, search and filtering, protected routes, and scalable MongoDB data modeling

npm packages used: express, cors, mongodb, dotenv, jsonwebtoken, firebase-admin, stripe, nodemon

Setup instructions: Clone the repository, run npm install, create a .env file with required credentials, start the server using npm run dev or npm start, and ensure MongoDB and Firebase credentials are correctly configured.

Environment variables configuration: MONGODB_URI, PORT, FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL, STRIPE_SECRET_KEY