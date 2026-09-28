# Term Project - BACKEND AND Database (DEV MODE)

## Setup
  ### 1. Clone Repository
  - git clone <URL's Repository>
  - cd TP-BACKEND
  ### 2. Install Dependencies
  - pnpm install
  ### 3. Setting Environment Variables
  - create .env 
  ### 4. Start the database
  - docker compose up -d

  ### 5. Push Database Schema & Seed Data
  - pnpm drizzle-kit push
  - pnpm tsx src/db/seed.ts
  ### 6. Start the backend
  - pnpm run dev

## Usage
  - pnpm drizzle-kit push หรือ pnpm run db:push
  - pnpm tsx src/db/seed.ts
  - pnpm drizzle-kit generate
  - pnpm drizzle-kit migrate

  
   