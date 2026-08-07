# Lead Seller Platform

Lead Seller is an omnichannel customer service platform built with a modern tech stack.

## Technology Stack

### Frontend
- **Framework**: React 18 (Vite 5)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS v3 + Shadcn UI
- **Data Fetching**: TanStack Query (React Query) v5
- **State Management**: React Context API & TanStack Query
- **Routing**: React Router DOM v6
- **UI Components**: Radix UI
- **Icons**: Lucide React
- **Animations**: Framer Motion
- **Forms**: React Hook Form + Zod

### Backend (Lovable Cloud / Supabase)
- **Database**: PostgreSQL
- **Authentication**: Managed Auth (Google OAuth, Email/Password, WebAuthn)
- **Storage**: Managed Storage for media and documents
- **Serverless**: Edge Functions (Deno/TypeScript)
- **Real-time**: Postgres CDC + Realtime for chat synchronization

### Key Integrations
- **WhatsApp**: WAHA (WhatsApp HTTP API)
- **Voice/SIP**: Wavoip (JsSIP / WebRTC)
- **CRM**: Custom multi-tenant pipeline and funnel management
- **Automation**: Internal Flow Builder for lead distribution and SLA

### Security & Reliability
- **Architecture**: Strict multi-tenant isolation via Row Level Security (RLS)
- **Monitoring**: Automated error reporting and logging system
- **Testing**: Vitest for unit tests and Playwright for E2E flows
- **Performance**: Image optimization (HEIC conversion) and virtualized chat lists
