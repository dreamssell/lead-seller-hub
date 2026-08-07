# Plataforma Lead Seller - Stack Tecnológica

## Frontend
- **Framework**: React 18 (Vite)
- **Linguagem**: TypeScript 5
- **Estilização**: Tailwind CSS v3 + Shadcn UI
- **Gerenciamento de Estado/Cache**: TanStack Query (React Query) v5
- **Roteamento**: React Router DOM v6
- **Componentes de UI**: Radix UI
- **Ícones**: Lucide React
- **Animações**: Framer Motion
- **Formulários**: React Hook Form + Zod

## Backend (Lovable Cloud / Supabase)
- **Banco de Dados**: PostgreSQL
- **Autenticação**: Supabase Auth (OAuth Google, Email/Senha, WebAuthn/Biometria)
- **Storage**: Supabase Storage (para mídia e documentos)
- **Edge Functions**: Deno (TypeScript) para integrações externas e webhooks
- **Realtime**: PostgreSQL CDC + Supabase Realtime para chat e notificações

## Integrações & Funcionalidades Core
- **WhatsApp**: WAHA (WhatsApp HTTP API) & Evolution API
- **Telefonia**: Wavoip (JsSIP / WebRTC)
- **CRM**: Gestão de Funis, Etapas e Atendimento Omnichannel
- **Automação**: Flow Builder para distribuição de leads e SLA

## Qualidade & Segurança
- **Segurança**: RLS (Row Level Security) multi-tenant
- **Testes**: Vitest & Playwright
- **Monitoramento**: Sistema próprio de reporte de erros (`error_reports`)
