# Chat360 - Next-Generation Voice Chat Platform

A modern, real-time voice chat platform built with Next.js 15, Agora RTC, and Supabase. Chat360 delivers high-quality voice communication with an Xbox-inspired interface, advanced audio processing, and real-time presence tracking.

## Core Features

- 🎙️ **Advanced Voice Communication**
  - High-fidelity audio streaming powered by Agora RTC
  - AI-powered noise cancellation with Agora AI Denoiser
  - Voice activity detection (VAD) for intelligent audio processing
  - Automatic gain control and echo cancellation
  - Real-time volume level visualization
  - Individual volume controls for party members

- 👥 **Party System**
  - Seamless party creation and management
  - Real-time member presence tracking
  - Dynamic voice status indicators (speaking/silent/muted)
  - Rich user profiles with avatars and game status
  - Party chat with real-time messaging
  - Xbox-style party interface

- 🎮 **Modern UI/UX**
  - Responsive design optimized for both desktop and mobile
  - Xbox-inspired interface elements and animations
  - Beautiful component library built with shadcn/ui
  - Smooth transitions powered by Framer Motion
  - Toast notifications for important events
  - Dark mode support

- 🔒 **Security & Performance**
  - Token-based voice channel authentication
  - End-to-end encrypted communication
  - Optimized bundle size with Next.js
  - Efficient state management with Zustand
  - Type-safe development with TypeScript

## Tech Stack

### Frontend
- **Framework**: Next.js 15
- **Language**: TypeScript
- **State Management**: Zustand
- **Styling**:
  - Tailwind CSS
  - shadcn/ui components
  - Radix UI primitives
- **Animations**: Framer Motion
- **Form/Validation**: React Hook Form and Zod

### Backend & Services
- **Voice Communication**: Agora RTC SDK
  - AI Denoiser Extension
  - Voice Activity Detection (VAD)
- **Backend & Auth**: Supabase
- **Real-time Updates**: Supabase Realtime

### Development & Quality
- **Type Safety**: TypeScript
- **Linting**: ESLint with strict configuration
- **Code Formatting**: Prettier and ESLint Perfectionist
- **Bundle Analysis**: @next/bundle-analyzer
- **Dead Code Detection**: Knip

## Prerequisites

- Node.js >= 18.x
- npm >= 9.x
- Supabase account and project
- Agora account with App ID and certificate

## Environment Variables

Create a `.env.local` file with:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_AGORA_APP_ID=your_agora_app_id
AGORA_APP_CERTIFICATE=your_agora_certificate
```

## Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/chat360.git
   cd chat360
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

## Available Scripts

- `npm run dev` - Start development server
- `npm run dev:debug` - Start development server with debugging
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run lint:strict` - Run ESLint with zero warnings
- `npm run format` - Format code with Prettier
- `npm run typecheck` - Run TypeScript type checking
- `npm run test` - Run tests with Vitest
- `npm run check:all` - Run all checks (format, lint, typecheck, knip)
- `npm run knip` - Check for unused exports/dependencies

## Project Structure

```
src/
├── app/              # Next.js app directory
├── components/       # React components
│   ├── features/    # Feature-specific components
│   │   └── party/  # Party system components
│   ├── providers/   # Context providers
│   └── ui/         # Reusable UI components
├── lib/             # Core application logic
│   ├── contexts/    # React contexts
│   ├── hooks/       # Custom React hooks
│   ├── services/    # Service layer (voice, etc.)
│   ├── stores/      # Zustand stores
│   └── types/      # TypeScript types
└── styles/         # Global styles
```

## Voice Features

- Real-time volume level visualization
- Individual volume controls per party member
- AI-powered noise cancellation
- Voice activity detection
- Automatic gain control
- Echo cancellation
- Mute/unmute functionality
- Background noise suppression

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Development Guidelines

- Write clean, maintainable TypeScript code
- Follow the established project structure
- Add proper logging for debugging
- Write tests for critical functionality
- Use the provided UI components
- Keep bundle size optimized

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [Agora.io](https://www.agora.io/) for real-time voice capabilities
- [Supabase](https://supabase.com/) for backend infrastructure
- [Next.js](https://nextjs.org/) team for the amazing framework
- [shadcn/ui](https://ui.shadcn.com/) for beautiful components
- All contributors who have helped shape this project
