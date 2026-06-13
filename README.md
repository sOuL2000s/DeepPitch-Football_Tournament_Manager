# README.md
# DeepPitch - Football Tournament Manager

A profoundly simple, minimal, and lightweight football tournament management application with robust underlying capabilities.

## Tech Stack

- **Frontend**: Next.js 14, Tailwind CSS, React Query, Zustand, React Hook Form, Zod.
- **Backend**: NestJS, Prisma ORM, Passport.js (JWT).
- **Database**: PostgreSQL.

## Project Structure

- `frontend/`: Next.js application.
- `backend/`: NestJS API.

## Getting Started

### Backend Setup

1. Navigate to the `backend` directory.
2. Install dependencies: `npm install`.
3. Create a `.env` file based on `.env.example`.
4. Run Prisma migrations: `npx prisma migrate dev`.
5. Start the development server: `npm run start:dev`.

### Frontend Setup

1. Navigate to the `frontend` directory.
2. Install dependencies: `npm install`.
3. Create a `.env.local` file based on `.env.example`.
4. Start the development server: `npm run dev`.

## License

MIT